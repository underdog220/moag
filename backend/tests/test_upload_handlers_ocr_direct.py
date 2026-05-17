"""
Tests für Upload-Handler ocr.direct.

Prüft: Happy-Path OctoBoss, Fallback bei 404, Fallback bei ConnectError,
fehlende Engine, ungültige Engine, HTTP-Fehler, Timeout, Schema-Strict, Registry.
"""
from __future__ import annotations

from datetime import datetime

import httpx
import pytest

from moag.upload.schemas import UploadResult


def _make_client_patch(monkeypatch, transport):
    real_client = httpx.AsyncClient

    def patched(**kw):
        kw.pop("transport", None)
        return real_client(transport=transport, **kw)

    monkeypatch.setattr(httpx, "AsyncClient", patched)
    monkeypatch.setenv("MOAG_OCTOBOSS_BASE_URL", "http://mock-octoboss")
    monkeypatch.setenv("MOAG_OCREXPERT_BASE_URL", "http://mock-ocrexpert")


def _process_response(engine: str = "tesseract") -> dict:
    return {
        "status": "ok",
        "job_id": f"job-{engine}-001",
        "text": f"OCR-Text via {engine}",
        "text_len": 20 + len(engine),
        "pages": 2,
        "quality": {"passed": True, "score": 0.91, "avg_confidence": 0.93, "reason": "ok"},
        "pdfa_url": None,
        "duration_ms": 800,
    }


@pytest.mark.asyncio
async def test_ocr_direct_happy_path_octoboss(monkeypatch):
    """Happy-Path: OctoBoss Dispatch antwortet 200 → UploadResult completed."""
    body = _process_response("tesseract")

    def handler(req: httpx.Request) -> httpx.Response:
        if "/api/v1/dispatch/ocr-tesseract/process" in str(req.url):
            return httpx.Response(200, json=body)
        return httpx.Response(404)

    _make_client_patch(monkeypatch, httpx.MockTransport(handler))

    from moag.upload.handlers.ocr_direct import handle_ocr_direct

    result = await handle_ocr_direct(
        upload_id="direct01",
        file_bytes=b"%PDF",
        mime="application/pdf",
        params={"engine": "tesseract"},
    )

    assert isinstance(result, UploadResult)
    assert result.status == "completed"
    assert result.operation == "ocr.direct"
    assert result.completed_at is not None
    assert result.result_payload["engine"] == "tesseract"
    assert result.result_payload["via_fallback"] is False
    assert result.result_payload["text"] == body["text"]
    assert result.result_payload["pages"] == 2
    assert result.error is None
    assert "tesseract" in result.result_summary


@pytest.mark.asyncio
async def test_ocr_direct_engine_missing(monkeypatch):
    """Fehlender engine-Parameter → status=failed."""
    _make_client_patch(monkeypatch, httpx.MockTransport(lambda r: httpx.Response(200, json={})))

    from moag.upload.handlers.ocr_direct import handle_ocr_direct

    result = await handle_ocr_direct("direct02", b"%PDF", "application/pdf", params={})

    assert result.status == "failed"
    assert result.operation == "ocr.direct"
    assert result.completed_at is not None
    assert "engine" in result.error.lower()


@pytest.mark.asyncio
async def test_ocr_direct_engine_invalid(monkeypatch):
    """Unbekannte Engine (nicht in Whitelist) → status=failed."""
    _make_client_patch(monkeypatch, httpx.MockTransport(lambda r: httpx.Response(200, json={})))

    from moag.upload.handlers.ocr_direct import handle_ocr_direct

    result = await handle_ocr_direct("direct03", b"%PDF", "application/pdf", params={"engine": "unknownengine"})

    assert result.status == "failed"
    assert "unknownengine" in result.error


@pytest.mark.asyncio
@pytest.mark.parametrize("engine", ["tesseract", "surya", "paddle", "easyocr"])
async def test_ocr_direct_all_engines_whitelist(monkeypatch, engine):
    """Alle erlaubten Engines passieren die Whitelist-Prüfung."""
    body = _process_response(engine)

    def handler(req: httpx.Request) -> httpx.Response:
        if f"/api/v1/dispatch/ocr-{engine}/process" in str(req.url):
            return httpx.Response(200, json=body)
        return httpx.Response(404)

    _make_client_patch(monkeypatch, httpx.MockTransport(handler))

    from moag.upload.handlers.ocr_direct import handle_ocr_direct

    result = await handle_ocr_direct("wl_" + engine, b"%PDF", "application/pdf", {"engine": engine})

    assert result.status == "completed"
    assert result.result_payload["engine"] == engine


@pytest.mark.asyncio
async def test_ocr_direct_fallback_on_404(monkeypatch):
    """OctoBoss 404 → Fallback auf OCRexpert direkt."""
    fallback_body = _process_response("tesseract")

    def handler(req: httpx.Request) -> httpx.Response:
        url = str(req.url)
        if "/api/v1/dispatch/" in url:
            return httpx.Response(404, text="Not Found")
        if "/api/v1/process" in url:
            return httpx.Response(200, json=fallback_body)
        return httpx.Response(500)

    _make_client_patch(monkeypatch, httpx.MockTransport(handler))

    from moag.upload.handlers.ocr_direct import handle_ocr_direct

    result = await handle_ocr_direct("fallback404", b"%PDF", "application/pdf", {"engine": "tesseract"})

    assert result.status == "completed"
    assert result.result_payload["via_fallback"] is True
    assert "Fallback" in result.result_summary


@pytest.mark.asyncio
async def test_ocr_direct_fallback_on_connect_error(monkeypatch):
    """OctoBoss nicht erreichbar (ConnectError) → Fallback auf OCRexpert."""
    fallback_body = _process_response("surya")
    call_count = {"dispatch": 0, "fallback": 0}

    def handler(req: httpx.Request) -> httpx.Response:
        url = str(req.url)
        if "mock-octoboss" in url:
            call_count["dispatch"] += 1
            raise httpx.ConnectError("Connection refused")
        if "/api/v1/process" in url:
            call_count["fallback"] += 1
            return httpx.Response(200, json=fallback_body)
        return httpx.Response(404)

    _make_client_patch(monkeypatch, httpx.MockTransport(handler))

    from moag.upload.handlers.ocr_direct import handle_ocr_direct

    result = await handle_ocr_direct("conn_fallback", b"%PDF", "application/pdf", {"engine": "surya"})

    assert result.status == "completed"
    assert result.result_payload["via_fallback"] is True


@pytest.mark.asyncio
async def test_ocr_direct_http_500(monkeypatch):
    """OctoBoss HTTP 500 → status=failed (kein Fallback für 5xx)."""

    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="Internal Server Error")

    _make_client_patch(monkeypatch, httpx.MockTransport(handler))

    from moag.upload.handlers.ocr_direct import handle_ocr_direct

    result = await handle_ocr_direct("direct500", b"%PDF", "application/pdf", {"engine": "paddle"})

    assert result.status == "failed"
    assert "500" in result.error


@pytest.mark.asyncio
async def test_ocr_direct_timeout(monkeypatch):
    """Timeout auf OctoBoss → status=failed."""

    def handler(req: httpx.Request) -> httpx.Response:
        raise httpx.TimeoutException("timed out")

    _make_client_patch(monkeypatch, httpx.MockTransport(handler))

    from moag.upload.handlers.ocr_direct import handle_ocr_direct

    result = await handle_ocr_direct("directtimeout", b"%PDF", "application/pdf", {"engine": "easyocr"})

    assert result.status == "failed"
    assert "Timeout" in result.error


@pytest.mark.asyncio
async def test_ocr_direct_schema_strict(monkeypatch):
    """Schema-Strict: alle Pflichtfelder gesetzt."""
    body = _process_response("tesseract")

    def handler(req: httpx.Request) -> httpx.Response:
        if "/api/v1/dispatch/ocr-tesseract/process" in str(req.url):
            return httpx.Response(200, json=body)
        return httpx.Response(404)

    _make_client_patch(monkeypatch, httpx.MockTransport(handler))

    from moag.upload.handlers.ocr_direct import handle_ocr_direct

    result = await handle_ocr_direct("schema_direct", b"%PDF", "application/pdf", {"engine": "tesseract"})

    assert result.upload_id == "schema_direct"
    assert result.status in ("completed", "failed", "queued", "processing")
    assert result.operation == "ocr.direct"
    assert isinstance(result.completed_at, datetime)
    assert result.duration_ms is not None


def test_ocr_direct_in_registry():
    """ocr.direct ist in HANDLERS registriert."""
    from moag.upload.handlers.registry import HANDLERS

    assert "ocr.direct" in HANDLERS
    assert HANDLERS["ocr.direct"].__module__ == "moag.upload.handlers.ocr_direct"
