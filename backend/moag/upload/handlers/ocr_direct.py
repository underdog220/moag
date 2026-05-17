"""
Upload-Handler: ocr.direct

Leitet multipart-Upload via OctoBoss Cluster-Dispatch an eine spezifische
OCR-Engine weiter: POST /api/v1/dispatch/ocr-{engine}/process

Pflicht-Param: engine ∈ {tesseract, surya, paddle, easyocr}
Fallback: bei OctoBoss 404 oder ConnectionError direkt an OCRexpert
          POST /api/v1/process.
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

logger = logging.getLogger("moag.upload.handlers.ocr_direct")

_OCTOBOSS_BASE_URL = os.environ.get("MOAG_OCTOBOSS_BASE_URL", "http://192.168.200.71:18765")
_OCREXPERT_BASE_URL = os.environ.get("MOAG_OCREXPERT_BASE_URL", "http://192.168.200.71:17810")

# Erlaubte Engines
_ALLOWED_ENGINES = {"tesseract", "surya", "paddle", "easyocr"}


def _map_dispatch_response(upload_id: str, data: dict, engine: str, dauer_ms: int) -> UploadResult:
    """Mappt OctoBoss Dispatch-Antwort auf UploadResult.

    OctoBoss gibt entweder ProcessV1Response-Format zurück oder ein
    generisches Dict mit result/text-Feldern. Wir greifen beides ab.
    """
    # Versuche ProcessV1Response-Felder (wenn Dispatch das intern durchreicht)
    text = data.get("text") or data.get("result") or ""
    text_len = data.get("text_len") or len(text)
    pages = data.get("pages", 0)
    quality = data.get("quality") or {}
    quality_score = quality.get("score", 0.0) if isinstance(quality, dict) else 0.0
    ocrexpert_duration = data.get("duration_ms", dauer_ms)
    text_preview = text[:80].replace("\n", " ") if text else "(kein Text erkannt)"

    result_summary = (
        f"OCR ({engine}) via OctoBoss: {text_len} Zeichen auf {pages} Seite(n). "
        f"Vorschau: {text_preview}"
    )

    return UploadResult(
        upload_id=upload_id,
        status="completed",
        operation="ocr.direct",
        completed_at=datetime.now(timezone.utc),
        duration_ms=ocrexpert_duration or dauer_ms,
        result_summary=result_summary,
        result_payload={
            "engine": engine,
            "text": text,
            "text_len": text_len,
            "pages": pages,
            "quality": quality,
            "quality_score": quality_score,
            "raw_response": data,
            "via_fallback": False,
        },
        artifact_url=data.get("pdfa_url") or None,
        artifact_mime="application/pdf" if data.get("pdfa_url") else None,
    )


async def _fallback_ocrexpert(
    upload_id: str,
    file_bytes: bytes,
    mime: str,
    engine: str,
    t0: float,
) -> UploadResult:
    """Direkter Fallback auf OCRexpert /api/v1/process wenn OctoBoss nicht reagiert."""
    base = _OCREXPERT_BASE_URL.rstrip("/")
    plog.step("ocr.direct", "fallback_start", input={"engine": engine}, dauer_ms=0)
    logger.info("ocr.direct Fallback auf OCRexpert für engine=%s upload_id=%s", engine, upload_id)

    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            resp = await client.post(
                f"{base}/api/v1/process",
                files={"file": ("upload", file_bytes, mime)},
            )
    except (httpx.TimeoutException, httpx.ConnectError) as exc:
        dauer_ms = int((time.monotonic() - t0) * 1000)
        plog.step("ocr.direct", "fallback_error", output=str(exc), dauer_ms=dauer_ms, ok=False)
        return UploadResult(
            upload_id=upload_id,
            status="failed",
            operation="ocr.direct",
            completed_at=datetime.now(timezone.utc),
            duration_ms=dauer_ms,
            error=f"OCRexpert-Fallback ebenfalls fehlgeschlagen: {exc}",
        )

    dauer_ms = int((time.monotonic() - t0) * 1000)
    if not resp.is_success:
        return UploadResult(
            upload_id=upload_id,
            status="failed",
            operation="ocr.direct",
            completed_at=datetime.now(timezone.utc),
            duration_ms=dauer_ms,
            error=f"OCRexpert-Fallback HTTP {resp.status_code}: {resp.text[:200]}",
        )

    try:
        data = resp.json()
    except Exception as exc:
        return UploadResult(
            upload_id=upload_id,
            status="failed",
            operation="ocr.direct",
            completed_at=datetime.now(timezone.utc),
            duration_ms=dauer_ms,
            error=f"OCRexpert-Fallback Antwort nicht parsierbar: {exc}",
        )

    text = data.get("text") or ""
    text_len = data.get("text_len") or len(text)
    pages = data.get("pages", 0)
    quality = data.get("quality") or {}
    quality_score = quality.get("score", 0.0) if isinstance(quality, dict) else 0.0
    text_preview = text[:80].replace("\n", " ") if text else "(kein Text erkannt)"
    plog.step("ocr.direct", "fallback_done", output={"text_len": text_len}, dauer_ms=dauer_ms, ok=True)

    return UploadResult(
        upload_id=upload_id,
        status="completed",
        operation="ocr.direct",
        completed_at=datetime.now(timezone.utc),
        duration_ms=data.get("duration_ms", dauer_ms) or dauer_ms,
        result_summary=(
            f"OCR ({engine}) via OCRexpert-Fallback: {text_len} Zeichen auf {pages} Seite(n). "
            f"Vorschau: {text_preview}"
        ),
        result_payload={
            "engine": engine,
            "text": text,
            "text_len": text_len,
            "pages": pages,
            "quality": quality,
            "quality_score": quality_score,
            "via_fallback": True,
        },
        artifact_url=data.get("pdfa_url") or None,
        artifact_mime="application/pdf" if data.get("pdfa_url") else None,
    )


@register_handler("ocr.direct")
async def handle_ocr_direct(
    upload_id: str,
    file_bytes: bytes,
    mime: str,
    params: dict,
) -> UploadResult:
    """OCR direkt auf einer bestimmten Engine via OctoBoss Cluster-Dispatch.

    Pflicht-Param: params["engine"] ∈ {tesseract, surya, paddle, easyocr}.
    Falls OctoBoss 404 liefert oder nicht erreichbar ist, wird direkt
    an OCRexpert weitergeleitet (Fallback).
    """
    engine = (params.get("engine") or "").strip().lower()

    # Pflicht-Param prüfen
    if not engine:
        return UploadResult(
            upload_id=upload_id,
            status="failed",
            operation="ocr.direct",
            completed_at=datetime.now(timezone.utc),
            duration_ms=0,
            error="Pflicht-Parameter 'engine' fehlt (erlaubt: tesseract, surya, paddle, easyocr)",
        )

    if engine not in _ALLOWED_ENGINES:
        return UploadResult(
            upload_id=upload_id,
            status="failed",
            operation="ocr.direct",
            completed_at=datetime.now(timezone.utc),
            duration_ms=0,
            error=(
                f"Unbekannte Engine '{engine}'. "
                f"Erlaubt: {', '.join(sorted(_ALLOWED_ENGINES))}"
            ),
        )

    base = _OCTOBOSS_BASE_URL.rstrip("/")
    dispatch_url = f"{base}/api/v1/dispatch/ocr-{engine}/process"
    t0 = time.monotonic()

    plog.step(
        "ocr.direct", "start",
        input={"upload_id": upload_id, "engine": engine, "bytes": len(file_bytes)},
        dauer_ms=0,
    )

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                dispatch_url,
                files={"file": ("upload", file_bytes, mime)},
            )
    except httpx.ConnectError as exc:
        dauer_ms = int((time.monotonic() - t0) * 1000)
        plog.step("ocr.direct", "connect_error", output=str(exc), dauer_ms=dauer_ms, ok=False)
        logger.warning("ocr.direct OctoBoss nicht erreichbar, Fallback. upload_id=%s", upload_id)
        return await _fallback_ocrexpert(upload_id, file_bytes, mime, engine, t0)
    except httpx.TimeoutException as exc:
        dauer_ms = int((time.monotonic() - t0) * 1000)
        plog.step("ocr.direct", "timeout", output=str(exc), dauer_ms=dauer_ms, ok=False)
        return UploadResult(
            upload_id=upload_id,
            status="failed",
            operation="ocr.direct",
            completed_at=datetime.now(timezone.utc),
            duration_ms=dauer_ms,
            error=f"OctoBoss-Timeout nach {dauer_ms}ms",
        )

    dauer_ms = int((time.monotonic() - t0) * 1000)

    # 404 = Engine/Plugin nicht registriert → Fallback
    if resp.status_code == 404:
        plog.step("ocr.direct", "dispatch_404_fallback", output={"url": dispatch_url}, dauer_ms=dauer_ms, ok=False)
        logger.info(
            "ocr.direct OctoBoss 404 für %s, Fallback auf OCRexpert. upload_id=%s",
            dispatch_url, upload_id,
        )
        return await _fallback_ocrexpert(upload_id, file_bytes, mime, engine, t0)

    if not resp.is_success:
        plog.step("ocr.direct", "http_error", output={"status": resp.status_code}, dauer_ms=dauer_ms, ok=False)
        logger.warning("ocr.direct OctoBoss HTTP %d upload_id=%s", resp.status_code, upload_id)
        return UploadResult(
            upload_id=upload_id,
            status="failed",
            operation="ocr.direct",
            completed_at=datetime.now(timezone.utc),
            duration_ms=dauer_ms,
            error=f"OctoBoss HTTP {resp.status_code}: {resp.text[:200]}",
        )

    try:
        data = resp.json()
    except Exception as exc:
        plog.step("ocr.direct", "parse_error", output=str(exc), dauer_ms=dauer_ms, ok=False)
        return UploadResult(
            upload_id=upload_id,
            status="failed",
            operation="ocr.direct",
            completed_at=datetime.now(timezone.utc),
            duration_ms=dauer_ms,
            error=f"Antwort nicht parsierbar: {exc}",
        )

    plog.step(
        "ocr.direct", "done",
        output={"engine": engine, "status": resp.status_code},
        dauer_ms=dauer_ms,
        ok=True,
    )
    logger.info("ocr.direct OK upload_id=%s engine=%s", upload_id, engine)
    return _map_dispatch_response(upload_id, data, engine, dauer_ms)
