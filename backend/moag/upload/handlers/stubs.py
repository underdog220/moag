"""
Stub-Handler — einziger Beispiel-Handler bis echte Implementierungen folgen.

Registriert nur ocr.standard als Stub mit status="not_implemented".
Subagents Y-C/D/E ersetzen diesen durch echte Implementierungen.
"""
from __future__ import annotations

from datetime import datetime, timezone

from moag.upload.handlers.registry import register_handler
from moag.upload.schemas import UploadResult


@register_handler("ocr.standard")
async def handle_ocr_standard_stub(
    upload_id: str,
    file_bytes: bytes,
    mime: str,
    params: dict,
) -> UploadResult:
    """Stub für ocr.standard — liefert status='not_implemented'.

    Wird durch echten Handler ersetzt sobald OCRexpert-HTTP-Adapter fertig ist.
    """
    return UploadResult(
        upload_id=upload_id,
        status="failed",
        operation="ocr.standard",
        completed_at=datetime.now(timezone.utc),
        duration_ms=0,
        result_summary=None,
        result_payload={},
        artifact_url=None,
        artifact_mime=None,
        error="not_implemented — Subagent Y-C implementiert diesen Handler",
    )
