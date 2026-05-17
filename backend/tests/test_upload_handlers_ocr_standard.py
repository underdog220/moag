"""
Tests für Upload-Handler ocr.standard.

Prüft: Happy-Path, HTTP-Fehler, Timeout, Connection-Error,
Schema-Strict (status/operation/completed_at), Registry-Eintrag.
"""
from __future__ import annotations

from datetime import datetime, timezone

import httpx
import pytest

from moag.upload.schemas import UploadResult


def _make_client_patch(monkeypatch, transport):
    """Patcht httpx.AsyncClient mit dem gegebenen Transport."""
    real_client = httpx.AsyncClient

    def patched(**kw):
        kw.pop("transport", None)
        return real_client(transport=transport, **kw)

    monkeypatch.setattr(httpx, "AsyncClient", patched)
    monkeypatch.setenv("MOAG_OCREXPERT_BASE_URL", "http://mock-ocrexpert")


def _process_v1_response(
    text: str = "Rechnungsnummer: 2026-042",
    text_len: int | None = None,
    pages: int = 3,
    quality_score: float = 0.92,
    quality_passed: bool = True,
    pdfa_url: str | None = None,
) -> dict:
    return {
        "status": "ok",
        "job_id": "job-abc123",
        "text": text,
        "text_len": text_len if text_len is not None else len(text),
        "pages": pages,
        "quality": {
            "passed": quality_passed,
            "score": quality_score,
            "avg_confidence": 0.95,
            "reason": "ok",
        },
        "pdfa_url": pdfa_url,
        "duration_ms": 1234,
    }


@pytest.mark.asyncio
async def test_ocr_standard_happy_path(monkeypatch):
    """Happy-Path: OCRexpert liefert ProcessV1Response → UploadResult completed."""
    body = _process_v1_response()

    def handler(req: httpx.Request) -> httpx.Response:
        if "/api/v1/process" in str(req.url):
            return httpx.Response(200, json=body)
        return httpx.Response(404)

    _make_client_patch(monkeypatch, httpx.MockTransport(handler))

    from moag.upload.handlers.ocr_standard import handle_ocr_standard

    result = await handle_ocr_standard(
        upload_id="01ABCDEF01ABCDEF01ABCDEF",
        file_bytes=b"%PDF-1.4 test",
        mime="application/pdf",
        params={},
    )

    assert isinstance(result, UploadResult)
    assert result.status == "completed"
    assert result.operation == "ocr.standard"
    assert result.completed_at is not None
    assert result.duration_ms == 1234
    assert result.result_payload["text"] == body["text"]
    assert result.result_payload["pages"] == 3
    assert result.result_payload["text_len"] == len(body["text"])
    assert result.result_payload["quality_score"] == pytest.approx(0.92)
    assert result.result_payload["quality_passed"] is True
    assert result.result_payload["job_id"] == "job-abc123"
    assert result.artifact_url is None  # kein pdfa_url gesetzt
    assert result.artifact_mime is None
    assert result.error is None
    assert result.result_summary is not None
    assert "Zeichen" in result.result_summary


@pytest.mark.asyncio
async def test_ocr_standard_with_pdfa_url(monkeypatch):
    """Wenn pdfa_url vorhanden, wird artifact_url + artifact_mime gesetzt."""
    body = _process_v1_response(pdfa_url="http://mock-ocrexpert/artifacts/abc.pdf")

    def handler(req: httpx.Request) -> httpx.Response:
        if "/api/v1/process" in str(req.url):
            return httpx.Response(200, json=body)
        return httpx.Response(404)

    _make_client_patch(monkeypatch, httpx.MockTransport(handler))

    from moag.upload.handlers.ocr_standard import handle_ocr_standard

    result = await handle_ocr_standard("uid01", b"%PDF", "application/pdf", {})

    assert result.status == "completed"
    assert result.artifact_url == "http://mock-ocrexpert/artifacts/abc.pdf"
    assert result.artifact_mime == "application/pdf"


@pytest.mark.asyncio
async def test_ocr_standard_http_500(monkeypatch):
    """Service antwortet 500 → status=failed, error gesetzt."""

    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="Internal Server Error")

    _make_client_patch(monkeypatch, httpx.MockTransport(handler))

    from moag.upload.handlers.ocr_standard import handle_ocr_standard

    result = await handle_ocr_standard("uid02", b"%PDF", "application/pdf", {})

    assert result.status == "failed"
    assert result.operation == "ocr.standard"
    assert result.completed_at is not None
    assert "500" in result.error
    assert result.result_payload == {}


@pytest.mark.asyncio
async def test_ocr_standard_timeout(monkeypatch):
    """Service-Timeout → status=failed mit Timeout-Meldung."""

    def handler(req: httpx.Request) -> httpx.Response:
        raise httpx.TimeoutException("timed out")

    _make_client_patch(monkeypatch, httpx.MockTransport(handler))

    from moag.upload.handlers.ocr_standard import handle_ocr_standard

    result = await handle_ocr_standard("uid03", b"%PDF", "application/pdf", {})

    assert result.status == "failed"
    assert result.operation == "ocr.standard"
    assert result.completed_at is not None
    assert "Timeout" in result.error


@pytest.mark.asyncio
async def test_ocr_standard_connect_error(monkeypatch):
    """Connection-Error → status=failed."""

    def handler(req: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused")

    _make_client_patch(monkeypatch, httpx.MockTransport(handler))

    from moag.upload.handlers.ocr_standard import handle_ocr_standard

    result = await handle_ocr_standard("uid04", b"%PDF", "application/pdf", {})

    assert result.status == "failed"
    assert result.operation == "ocr.standard"
    assert result.completed_at is not None
    assert result.error is not None


@pytest.mark.asyncio
async def test_ocr_standard_invalid_json(monkeypatch):
    """Service antwortet 200 aber kein valides JSON → status=failed."""

    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="not-json{{{{")

    _make_client_patch(monkeypatch, httpx.MockTransport(handler))

    from moag.upload.handlers.ocr_standard import handle_ocr_standard

    result = await handle_ocr_standard("uid05", b"%PDF", "application/pdf", {})

    assert result.status == "failed"
    assert result.completed_at is not None
    assert result.error is not None


@pytest.mark.asyncio
async def test_ocr_standard_schema_strict(monkeypatch):
    """UploadResult hat alle Schema-Pflichtfelder gesetzt (status/operation/completed_at)."""
    body = _process_v1_response()

    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=body)

    _make_client_patch(monkeypatch, httpx.MockTransport(handler))

    from moag.upload.handlers.ocr_standard import handle_ocr_standard

    result = await handle_ocr_standard("uid06", b"%PDF", "application/pdf", {})

    # Schema-Strict: Pflichtfelder
    assert result.upload_id == "uid06"
    assert result.status in ("completed", "failed", "queued", "processing")
    assert result.operation == "ocr.standard"
    assert isinstance(result.completed_at, datetime)
    assert result.duration_ms is not None


def test_ocr_standard_in_registry():
    """ocr.standard ist in HANDLERS als echter Handler (nicht Stub) registriert."""
    from moag.upload.handlers.registry import HANDLERS
    import moag.upload.handlers.ocr_standard  # noqa: F401 — sicherstellt dass Modul geladen ist

    assert "ocr.standard" in HANDLERS
    handler_fn = HANDLERS["ocr.standard"]
    # Echter Handler: Funktionsname ist nicht der Stub
    assert "stub" not in handler_fn.__name__.lower()
    assert handler_fn.__module__ == "moag.upload.handlers.ocr_standard"
