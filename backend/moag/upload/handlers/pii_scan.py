"""Upload-Handler: pii.scan — PII-Detection in Text/PDF.

Akzeptierte MIMEs: PDF, TXT, MD
Keine Pflicht-Params.

Text-Extraktion: analog zu llm_text (pypdf fuer PDF, raw-UTF-8 fuer Text).
Oberon-Endpoint: POST {OBERON_BASE_URL}/api/v2/pii/detect
Body: {"text": "<extracted>"}
Response: Liste von Findings (EMAIL, IBAN, PHONE, ...)
result_summary: "X PII-Findings: <Top-3-Typen>"
"""
from __future__ import annotations

import io
import logging
import os
import time
from datetime import datetime, timezone

import httpx

from moag.upload.handlers.registry import register_handler
from moag.upload.schemas import UploadResult

logger = logging.getLogger("moag.upload.handlers.pii_scan")

_PDF_MIME = "application/pdf"
_TEXT_MIMES = {"text/plain", "text/markdown"}


def _extract_text(file_bytes: bytes, mime: str) -> tuple[str | None, str | None]:
    """Gibt (text, error) zurueck.

    error ist None bei Erfolg, sonst Fehlermeldung (Soft-Fail).
    """
    if mime == _PDF_MIME:
        try:
            import pypdf  # type: ignore

            reader = pypdf.PdfReader(io.BytesIO(file_bytes))
            parts = []
            for page in reader.pages:
                txt = page.extract_text()
                if txt:
                    parts.append(txt)
            return "\n".join(parts), None
        except ImportError:
            return None, "PDF-Extraktion nicht verfuegbar — pypdf ist nicht installiert."
        except Exception as exc:
            return None, f"PDF-Extraktion fehlgeschlagen: {exc}"

    # Text-Formate
    if mime in _TEXT_MIMES:
        return file_bytes.decode("utf-8", errors="replace"), None

    # Fallback
    return file_bytes.decode("utf-8", errors="replace"), None


def _failed(upload_id: str, error: str, duration_ms: int = 0) -> UploadResult:
    return UploadResult(
        upload_id=upload_id,
        status="failed",
        operation="pii.scan",
        completed_at=datetime.now(timezone.utc),
        duration_ms=duration_ms,
        error=error,
    )


def _build_summary(findings: list[dict]) -> str:
    """Baut result_summary: 'X PII-Findings: TYPE1, TYPE2, TYPE3'."""
    total = len(findings)
    if total == 0:
        return "Keine PII-Findings gefunden."

    # Typen zaehlen, Top-3 ausgeben
    type_counts: dict[str, int] = {}
    for f in findings:
        pii_type = f.get("type") or f.get("piiType") or f.get("label") or "UNBEKANNT"
        type_counts[pii_type] = type_counts.get(pii_type, 0) + 1

    sorted_types = sorted(type_counts.items(), key=lambda x: -x[1])
    top3 = ", ".join(t for t, _ in sorted_types[:3])
    if len(sorted_types) > 3:
        top3 += " ..."

    return f"{total} PII-Findings: {top3}"


@register_handler("pii.scan")
async def handle_pii_scan(
    upload_id: str,
    file_bytes: bytes,
    mime: str,
    params: dict,
) -> UploadResult:
    """PII-Scan via Oberon /api/v2/pii/detect."""
    t0 = time.monotonic()

    # Text extrahieren
    text, extract_error = _extract_text(file_bytes, mime)
    if extract_error:
        return _failed(upload_id, extract_error)
    if text is None:
        return _failed(upload_id, "Text-Extraktion lieferte kein Ergebnis.")

    base_url = os.environ.get("MOAG_OBERON_BASE_URL", "http://192.168.200.169:17900").rstrip("/")
    token = os.environ.get("MOAG_OBERON_TOKEN", "")
    headers: dict[str, str] = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    body = {"text": text}

    try:
        with httpx.Client(headers=headers, timeout=30.0) as client:
            resp = client.post(
                f"{base_url}/api/v2/pii/detect",
                json=body,
            )
    except (httpx.ConnectError, httpx.TimeoutException, OSError) as exc:
        duration_ms = int((time.monotonic() - t0) * 1000)
        return _failed(upload_id, f"Oberon nicht erreichbar: {exc}", duration_ms)

    duration_ms = int((time.monotonic() - t0) * 1000)

    if resp.status_code != 200:
        return UploadResult(
            upload_id=upload_id,
            status="failed",
            operation="pii.scan",
            completed_at=datetime.now(timezone.utc),
            duration_ms=duration_ms,
            error=f"Oberon HTTP {resp.status_code}: {resp.text[:200]}",
            result_payload={"status_code": resp.status_code},
        )

    data = resp.json()
    # Oberon PII-Detect Response kann sein:
    #   {"findings": [...]}  oder  {"entities": [...]}  oder direkte Liste
    if isinstance(data, list):
        findings = data
    elif isinstance(data, dict):
        findings = (
            data.get("findings")
            or data.get("entities")
            or data.get("results")
            or []
        )
    else:
        findings = []

    summary = _build_summary(findings)

    return UploadResult(
        upload_id=upload_id,
        status="completed",
        operation="pii.scan",
        completed_at=datetime.now(timezone.utc),
        duration_ms=duration_ms,
        result_summary=summary,
        result_payload={
            "findings": findings,
            "total": len(findings),
            "raw": data if not isinstance(data, list) else {"findings": data},
        },
    )
