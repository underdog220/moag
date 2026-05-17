"""
Upload-Handler: ocr.standard

Leitet multipart-Upload an OCRexpert POST /api/v1/process weiter.
Response (ProcessV1Response): status, job_id, text, text_len, pages, quality, pdfa_url, pdfa_base64, duration_ms.
"""
from __future__ import annotations

import logging
import os
import time
from datetime import datetime, timezone

import httpx

from moag.pipeline_hooks import plog
from moag.upload.handlers.registry import register_handler
from moag.upload.schemas import UploadResult

logger = logging.getLogger("moag.upload.handlers.ocr_standard")

_OCREXPERT_BASE_URL = os.environ.get("MOAG_OCREXPERT_BASE_URL", "http://192.168.200.71:17810")


@register_handler("ocr.standard")
async def handle_ocr_standard(
    upload_id: str,
    file_bytes: bytes,
    mime: str,
    params: dict,
) -> UploadResult:
    """Sendet die Datei per multipart an OCRexpert /api/v1/process.

    Erwartet von OCRexpert: ProcessV1Response mit text, text_len, pages,
    quality-Objekt und optionaler pdfa_url.
    """
    base = _OCREXPERT_BASE_URL.rstrip("/")
    t0 = time.monotonic()
    plog.step(
        "ocr.standard", "start",
        input={"upload_id": upload_id, "mime": mime, "bytes": len(file_bytes)},
        dauer_ms=0,
    )

    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            resp = await client.post(
                f"{base}/api/v1/process",
                files={"file": ("upload", file_bytes, mime)},
            )
    except httpx.TimeoutException as exc:
        dauer_ms = int((time.monotonic() - t0) * 1000)
        plog.step("ocr.standard", "timeout", output=str(exc), dauer_ms=dauer_ms, ok=False)
        logger.warning("ocr.standard Timeout nach %dms für upload_id=%s", dauer_ms, upload_id)
        return UploadResult(
            upload_id=upload_id,
            status="failed",
            operation="ocr.standard",
            completed_at=datetime.now(timezone.utc),
            duration_ms=dauer_ms,
            error=f"OCRexpert-Timeout nach {dauer_ms}ms",
        )
    except httpx.ConnectError as exc:
        dauer_ms = int((time.monotonic() - t0) * 1000)
        plog.step("ocr.standard", "connect_error", output=str(exc), dauer_ms=dauer_ms, ok=False)
        logger.warning("ocr.standard Verbindungsfehler für upload_id=%s: %s", upload_id, exc)
        return UploadResult(
            upload_id=upload_id,
            status="failed",
            operation="ocr.standard",
            completed_at=datetime.now(timezone.utc),
            duration_ms=dauer_ms,
            error=f"OCRexpert nicht erreichbar: {exc}",
        )

    dauer_ms = int((time.monotonic() - t0) * 1000)

    if not resp.is_success:
        plog.step("ocr.standard", "http_error", output={"status": resp.status_code}, dauer_ms=dauer_ms, ok=False)
        logger.warning(
            "ocr.standard HTTP %d für upload_id=%s: %s",
            resp.status_code, upload_id, resp.text[:200],
        )
        return UploadResult(
            upload_id=upload_id,
            status="failed",
            operation="ocr.standard",
            completed_at=datetime.now(timezone.utc),
            duration_ms=dauer_ms,
            error=f"OCRexpert HTTP {resp.status_code}: {resp.text[:200]}",
        )

    try:
        data = resp.json()
    except Exception as exc:
        plog.step("ocr.standard", "parse_error", output=str(exc), dauer_ms=dauer_ms, ok=False)
        return UploadResult(
            upload_id=upload_id,
            status="failed",
            operation="ocr.standard",
            completed_at=datetime.now(timezone.utc),
            duration_ms=dauer_ms,
            error=f"Antwort nicht parsierbar: {exc}",
        )

    text = data.get("text") or ""
    text_len = data.get("text_len") or len(text)
    pages = data.get("pages", 0)
    quality = data.get("quality") or {}
    quality_score = quality.get("score", 0.0)
    quality_passed = quality.get("passed", False)
    ocrexpert_duration = data.get("duration_ms", dauer_ms)

    # Kurztext für Zusammenfassung (max 80 Zeichen)
    text_preview = text[:80].replace("\n", " ") if text else "(kein Text erkannt)"

    result_summary = (
        f"OCR abgeschlossen: {text_len} Zeichen auf {pages} Seite(n) "
        f"(Qualität: {quality_score:.0%}). Vorschau: {text_preview}"
    )

    plog.step(
        "ocr.standard", "done",
        output={"text_len": text_len, "pages": pages, "quality_score": quality_score},
        dauer_ms=dauer_ms,
        ok=True,
    )
    logger.info("ocr.standard OK upload_id=%s text_len=%d pages=%d", upload_id, text_len, pages)

    return UploadResult(
        upload_id=upload_id,
        status="completed",
        operation="ocr.standard",
        completed_at=datetime.now(timezone.utc),
        duration_ms=ocrexpert_duration or dauer_ms,
        result_summary=result_summary,
        result_payload={
            "text": text,
            "text_len": text_len,
            "pages": pages,
            "quality": quality,
            "quality_score": quality_score,
            "quality_passed": quality_passed,
            "job_id": data.get("job_id"),
        },
        artifact_url=data.get("pdfa_url") or None,
        artifact_mime="application/pdf" if data.get("pdfa_url") else None,
    )
