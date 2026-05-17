"""
Upload-Handler: ocr.shadow

Persistiert die Datei-Bytes auf dem Filesystem und ruft dann OCRexpert
POST /api/v1/shadow/process (JSON) auf.

Besonderheit:
- OCRexpert liest source_path vom Server-Dateisystem, daher muss MOAG
  die Datei erst lokal ablegen.
- Shadow-Pfad-Ableitung: source_path + ".pdfa.pdf" (Default).
- OCREXPERT_SHADOW_ALLOWED_ROOTS muss /tmp/moag-shadow oder
  /data/moag/uploads enthalten — sonst antwortet OCRexpert mit 403.

ShadowProcessResponse-Felder:
  status, shadow_written, shadow_path, shadow_bytes, source_path,
  pages, text_len, quality, engines_used, duration_ms, audit_id
"""
from __future__ import annotations

import logging
import os
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx

from moag.pipeline_hooks import plog
from moag.upload.handlers.registry import register_handler
from moag.upload.schemas import UploadResult

logger = logging.getLogger("moag.upload.handlers.ocr_shadow")

_OCREXPERT_BASE_URL = os.environ.get("MOAG_OCREXPERT_BASE_URL", "http://192.168.200.71:17810")

# Standardwert — zur Laufzeit überschreibbar via MOAG_SHADOW_TMP_DIR
_DEFAULT_SHADOW_TMP_DIR = "/tmp/moag-shadow"


def _get_shadow_tmp_dir() -> Path:
    """Gibt das Shadow-Verzeichnis zurück — zur Laufzeit aus ENV gelesen."""
    return Path(os.environ.get("MOAG_SHADOW_TMP_DIR", _DEFAULT_SHADOW_TMP_DIR))


def _persist_file(upload_id: str, file_bytes: bytes) -> Path:
    """Schreibt file_bytes in <MOAG_SHADOW_TMP_DIR>/<upload_id>.pdf und gibt den Pfad zurück."""
    shadow_dir = _get_shadow_tmp_dir()
    shadow_dir.mkdir(parents=True, exist_ok=True)
    path = shadow_dir / f"{upload_id}.pdf"
    path.write_bytes(file_bytes)
    logger.debug("Shadow-Quelldatei geschrieben: %s (%d bytes)", path, len(file_bytes))
    return path


@register_handler("ocr.shadow")
async def handle_ocr_shadow(
    upload_id: str,
    file_bytes: bytes,
    mime: str,
    params: dict,
) -> UploadResult:
    """Erstellt eine PDF/A-Shadow-Kopie via OCRexpert /api/v1/shadow/process.

    Ablauf:
    1. Datei auf Disk schreiben (OCRexpert braucht Dateisystem-Pfad)
    2. shadow_path ableiten (source_path + ".pdfa.pdf")
    3. POST JSON an OCRexpert
    4. UploadResult mappen

    Bei HTTP 403 (path_not_allowed): ehrliche Fehlermeldung mit
    Hinweis auf OCREXPERT_SHADOW_ALLOWED_ROOTS.
    """
    base = _OCREXPERT_BASE_URL.rstrip("/")
    t0 = time.monotonic()

    # Optionale Parameter aus params
    profile = params.get("profile", "default")
    language = params.get("language") or None
    overwrite = bool(params.get("overwrite", True))

    # Datei persistieren
    try:
        source_path = _persist_file(upload_id, file_bytes)
    except OSError as exc:
        dauer_ms = int((time.monotonic() - t0) * 1000)
        logger.error("Shadow: Datei konnte nicht geschrieben werden: %s", exc)
        return UploadResult(
            upload_id=upload_id,
            status="failed",
            operation="ocr.shadow",
            completed_at=datetime.now(timezone.utc),
            duration_ms=dauer_ms,
            error=f"Datei konnte nicht persistiert werden: {exc}",
        )

    shadow_path = str(source_path) + ".pdfa.pdf"

    body: dict = {
        "source_path": str(source_path),
        "shadow_path": shadow_path,
        "profile": profile,
        "overwrite": overwrite,
    }
    if language:
        body["language"] = language

    plog.step(
        "ocr.shadow", "start",
        input={"upload_id": upload_id, "source_path": str(source_path)},
        dauer_ms=0,
    )

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                f"{base}/api/v1/shadow/process",
                json=body,
            )
    except httpx.TimeoutException as exc:
        dauer_ms = int((time.monotonic() - t0) * 1000)
        plog.step("ocr.shadow", "timeout", output=str(exc), dauer_ms=dauer_ms, ok=False)
        return UploadResult(
            upload_id=upload_id,
            status="failed",
            operation="ocr.shadow",
            completed_at=datetime.now(timezone.utc),
            duration_ms=dauer_ms,
            error=f"OCRexpert-Shadow-Timeout nach {dauer_ms}ms",
        )
    except httpx.ConnectError as exc:
        dauer_ms = int((time.monotonic() - t0) * 1000)
        plog.step("ocr.shadow", "connect_error", output=str(exc), dauer_ms=dauer_ms, ok=False)
        return UploadResult(
            upload_id=upload_id,
            status="failed",
            operation="ocr.shadow",
            completed_at=datetime.now(timezone.utc),
            duration_ms=dauer_ms,
            error=f"OCRexpert nicht erreichbar: {exc}",
        )

    dauer_ms = int((time.monotonic() - t0) * 1000)

    # 403 = path_not_allowed — spezieller Hinweis
    if resp.status_code == 403:
        hint = (
            "OCRexpert verweigert Zugriff auf den Shadow-Pfad. "
            f"Konfiguriere OCREXPERT_SHADOW_ALLOWED_ROOTS so, dass "
            f"'{_get_shadow_tmp_dir()}' erlaubt ist (aktuell: {str(source_path)})."
        )
        plog.step("ocr.shadow", "path_forbidden", output=hint, dauer_ms=dauer_ms, ok=False)
        logger.warning("ocr.shadow 403 für upload_id=%s source=%s", upload_id, source_path)
        return UploadResult(
            upload_id=upload_id,
            status="failed",
            operation="ocr.shadow",
            completed_at=datetime.now(timezone.utc),
            duration_ms=dauer_ms,
            error=hint,
        )

    if not resp.is_success:
        plog.step("ocr.shadow", "http_error", output={"status": resp.status_code}, dauer_ms=dauer_ms, ok=False)
        logger.warning("ocr.shadow HTTP %d für upload_id=%s", resp.status_code, upload_id)
        return UploadResult(
            upload_id=upload_id,
            status="failed",
            operation="ocr.shadow",
            completed_at=datetime.now(timezone.utc),
            duration_ms=dauer_ms,
            error=f"OCRexpert HTTP {resp.status_code}: {resp.text[:200]}",
        )

    try:
        data = resp.json()
    except Exception as exc:
        plog.step("ocr.shadow", "parse_error", output=str(exc), dauer_ms=dauer_ms, ok=False)
        return UploadResult(
            upload_id=upload_id,
            status="failed",
            operation="ocr.shadow",
            completed_at=datetime.now(timezone.utc),
            duration_ms=dauer_ms,
            error=f"Antwort nicht parsierbar: {exc}",
        )

    # ShadowProcessResponse mappen
    status_str = data.get("status", "unknown")
    shadow_written = bool(data.get("shadow_written", False))
    result_shadow_path = data.get("shadow_path", shadow_path)
    shadow_bytes_size = data.get("shadow_bytes", 0)
    pages = data.get("pages", 0)
    text_len = data.get("text_len", 0)
    ocrexpert_duration = data.get("duration_ms", dauer_ms)
    skipped_reason = data.get("skipped_reason")
    quality = data.get("quality") or {}

    if not shadow_written and skipped_reason:
        result_summary = f"Shadow übersprungen: {skipped_reason}"
    elif shadow_written:
        result_summary = (
            f"PDF/A-Shadow erstellt: {shadow_bytes_size // 1024} KB, "
            f"{pages} Seite(n), {text_len} Zeichen erkannt."
        )
    else:
        result_summary = f"Shadow-Status: {status_str}"

    plog.step(
        "ocr.shadow", "done",
        output={"shadow_written": shadow_written, "pages": pages, "text_len": text_len},
        dauer_ms=dauer_ms,
        ok=True,
    )
    logger.info(
        "ocr.shadow OK upload_id=%s shadow_written=%s pages=%d",
        upload_id, shadow_written, pages,
    )

    return UploadResult(
        upload_id=upload_id,
        status="completed",
        operation="ocr.shadow",
        completed_at=datetime.now(timezone.utc),
        duration_ms=ocrexpert_duration or dauer_ms,
        result_summary=result_summary,
        result_payload={
            "status": status_str,
            "shadow_written": shadow_written,
            "shadow_path": result_shadow_path,
            "shadow_bytes": shadow_bytes_size,
            "source_path": str(source_path),
            "pages": pages,
            "text_len": text_len,
            "quality": quality,
            "engines_used": data.get("engines_used", []),
            "audit_id": data.get("audit_id"),
            "skipped_reason": skipped_reason,
        },
        artifact_url=None,  # Shadow-File liegt lokal; DB-Schicht setzt artifact_path
        artifact_mime="application/pdf" if shadow_written else None,
    )
