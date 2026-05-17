"""Upload-Handler: llm.text — Text/PDF an Oberon DSGVO-Proxy.

Akzeptierte MIMEs: PDF, TXT, MD, HTML, DOCX, RTF
Pflicht-Param: prompt (string)

Text-Extraktion:
  - PDF  → pypdf (soft-fail wenn nicht installiert)
  - DOCX → python-docx (soft-fail wenn nicht installiert)
  - Rest → raw bytes als UTF-8

Oberon-Endpoint: POST {OBERON_BASE_URL}/api/v2/dsgvo/proxy
Body: {"clientId": "moag-upload", "domain": "GENERAL", "prompt": "...", "profile": "STANDARD", "maxTokens": 4000}
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

logger = logging.getLogger("moag.upload.handlers.llm_text")

# MIME-Typen, die diese Funktion per raw-UTF-8 lesen kann
_TEXT_MIMES = {
    "text/plain",
    "text/markdown",
    "text/html",
    "application/rtf",
    "text/rtf",
}
_PDF_MIME = "application/pdf"
_DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

_MAX_TOKENS = 4000
_SUMMARY_CHARS = 200


def _extract_text(file_bytes: bytes, mime: str) -> str | None:
    """Text aus File-Bytes extrahieren.

    Gibt None zurueck wenn Extraktion nicht moeglich ist (Soft-Fail).
    """
    # PDF
    if mime == _PDF_MIME:
        try:
            import pypdf  # type: ignore

            reader = pypdf.PdfReader(io.BytesIO(file_bytes))
            parts = []
            for page in reader.pages:
                txt = page.extract_text()
                if txt:
                    parts.append(txt)
            return "\n".join(parts) if parts else ""
        except ImportError:
            return None  # Soft-Fail: Caller liefert failed + Hinweis

    # DOCX
    if mime == _DOCX_MIME:
        try:
            import docx  # type: ignore  (python-docx)

            doc = docx.Document(io.BytesIO(file_bytes))
            return "\n".join(p.text for p in doc.paragraphs)
        except ImportError:
            return None  # Soft-Fail

    # Text-Formate: UTF-8 mit Fehler-Toleranz
    if mime in _TEXT_MIMES:
        return file_bytes.decode("utf-8", errors="replace")

    # Unbekannt — Versuch als UTF-8
    return file_bytes.decode("utf-8", errors="replace")


def _failed(upload_id: str, error: str) -> UploadResult:
    return UploadResult(
        upload_id=upload_id,
        status="failed",
        operation="llm.text",
        completed_at=datetime.now(timezone.utc),
        duration_ms=0,
        error=error,
    )


def _build_oberon_client() -> httpx.Client:
    base_url = os.environ.get("MOAG_OBERON_BASE_URL", "http://192.168.200.169:17900").rstrip("/")
    token = os.environ.get("MOAG_OBERON_TOKEN", "")
    headers: dict[str, str] = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return httpx.Client(base_url=base_url, headers=headers, timeout=60.0)


@register_handler("llm.text")
async def handle_llm_text(
    upload_id: str,
    file_bytes: bytes,
    mime: str,
    params: dict,
) -> UploadResult:
    """LLM Text-Analyse via Oberon DSGVO-Proxy."""
    t0 = time.monotonic()

    # Pflicht-Param pruefen
    prompt = params.get("prompt")
    if not prompt or not str(prompt).strip():
        return _failed(upload_id, "Pflicht-Param 'prompt' fehlt oder leer.")

    # Text extrahieren
    if mime == _PDF_MIME:
        extracted = _extract_text(file_bytes, mime)
        if extracted is None:
            return _failed(
                upload_id,
                "PDF-Extraktion nicht verfuegbar — pypdf ist nicht installiert.",
            )
    elif mime == _DOCX_MIME:
        extracted = _extract_text(file_bytes, mime)
        if extracted is None:
            return _failed(
                upload_id,
                "DOCX-Extraktion nicht verfuegbar — python-docx ist nicht installiert.",
            )
    else:
        extracted = _extract_text(file_bytes, mime)
        if extracted is None:
            extracted = ""

    full_prompt = f"{prompt}\n\n{extracted}".strip()

    # Oberon DSGVO-Proxy aufrufen
    base_url = os.environ.get("MOAG_OBERON_BASE_URL", "http://192.168.200.169:17900").rstrip("/")
    token = os.environ.get("MOAG_OBERON_TOKEN", "")
    headers: dict[str, str] = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    body = {
        "clientId": "moag-upload",
        "domain": "GENERAL",
        "prompt": full_prompt,
        "profile": "STANDARD",
        "maxTokens": _MAX_TOKENS,
    }

    try:
        with httpx.Client(base_url=base_url, headers=headers, timeout=60.0) as client:
            resp = client.post(f"{base_url}/api/v2/dsgvo/proxy", json=body)
    except (httpx.ConnectError, httpx.TimeoutException, OSError) as exc:
        duration_ms = int((time.monotonic() - t0) * 1000)
        return UploadResult(
            upload_id=upload_id,
            status="failed",
            operation="llm.text",
            completed_at=datetime.now(timezone.utc),
            duration_ms=duration_ms,
            error=f"Oberon nicht erreichbar: {exc}",
        )

    duration_ms = int((time.monotonic() - t0) * 1000)

    if resp.status_code != 200:
        return UploadResult(
            upload_id=upload_id,
            status="failed",
            operation="llm.text",
            completed_at=datetime.now(timezone.utc),
            duration_ms=duration_ms,
            error=f"Oberon HTTP {resp.status_code}: {resp.text[:200]}",
            result_payload={"status_code": resp.status_code},
        )

    data = resp.json()
    llm_response: str = data.get("response", "")
    summary = llm_response[:_SUMMARY_CHARS] if llm_response else "(keine Antwort)"

    return UploadResult(
        upload_id=upload_id,
        status="completed",
        operation="llm.text",
        completed_at=datetime.now(timezone.utc),
        duration_ms=duration_ms,
        result_summary=summary,
        result_payload={
            "response": llm_response,
            "pii_found": data.get("piiFound", False),
            "pii_types": data.get("piiTypes", []),
            "anonymized": data.get("anonymized", False),
            "audit_id": data.get("auditId"),
            "oberon_duration_ms": data.get("durationMs"),
        },
    )
