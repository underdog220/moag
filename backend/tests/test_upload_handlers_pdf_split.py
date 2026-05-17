"""
Tests für Upload-Handler pdf.split.

Prüft: Happy-Path, leere teildokumente, HTTP-Fehler, Timeout,
Connection-Error, Schema-Strict, Registry-Eintrag.
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
    monkeypatch.setenv("MOAG_OCREXPERT_BASE_URL", "http://mock-ocrexpert")


def _split_response(
    seiten_anzahl: int = 12,
    anzahl_teildokumente: int = 3,
    llm_benutzt: bool = False,
    teildokumente: list | None = None,
) -> dict:
    if teildokumente is None:
        teildokumente = [
            {"pfad": f"/tmp/split/part_{i}.pdf", "seite_von": i * 4 + 1, "seite_bis": (i + 1) * 4}
            for i in range(anzahl_teildokumente)
        ]
    return {
        "pfad": "/tmp/split/output",
        "seiten_anzahl": seiten_anzahl,
        "anzahl_teildokumente": anzahl_teildokumente,
        "llm_benutzt": llm_benutzt,
        "teildokumente": teildokumente,
        "grenzen": [4, 8],
        "seiten_signale": [],
    }


@pytest.mark.asyncio
async def test_pdf_split_happy_path(monkeypatch):
    """Happy-Path: OCRexpert liefert SplitResponse → UploadResult completed."""
    body = _split_response()

    def handler(req: httpx.Request) -> httpx.Response:
        if "/ocr/split" in str(req.url):
            return httpx.Response(200, json=body)
        return httpx.Response(404)

    _make_client_patch(monkeypatch, httpx.MockTransport(handler))

    from moag.upload.handlers.pdf_split import handle_pdf_split

    result = await handle_pdf_split(
        upload_id="split01",
        file_bytes=b"%PDF-1.4 test",
        mime="application/pdf",
        params={},
    )

    assert isinstance(result, UploadResult)
    assert result.status == "completed"
    assert result.operation == "pdf.split"
    assert result.completed_at is not None
    assert result.result_payload["seiten_anzahl"] == 12
    assert result.result_payload["anzahl_teildokumente"] == 3
    assert result.result_payload["llm_benutzt"] is False
    assert len(result.result_payload["pages"]) == 3
    assert result.result_payload["grenzen"] == [4, 8]
    assert result.error is None
    assert "3" in result.result_summary
    assert "Teildokument" in result.result_summary


@pytest.mark.asyncio
async def test_pdf_split_llm_used(monkeypatch):
    """llm_benutzt=True erscheint in der result_summary."""
    body = _split_response(llm_benutzt=True)

    def handler(req: httpx.Request) -> httpx.Response:
        if "/ocr/split" in str(req.url):
            return httpx.Response(200, json=body)
        return httpx.Response(404)

    _make_client_patch(monkeypatch, httpx.MockTransport(handler))

    from moag.upload.handlers.pdf_split import handle_pdf_split

    result = await handle_pdf_split("splitllm", b"%PDF", "application/pdf", {})

    assert result.status == "completed"
    assert "LLM" in result.result_summary
    assert result.result_payload["llm_benutzt"] is True


@pytest.mark.asyncio
async def test_pdf_split_empty_teildokumente(monkeypatch):
    """Leere teildokumente-Liste → completed, pages=[]."""
    body = _split_response(seiten_anzahl=0, anzahl_teildokumente=0, teildokumente=[])

    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=body)

    _make_client_patch(monkeypatch, httpx.MockTransport(handler))

    from moag.upload.handlers.pdf_split import handle_pdf_split

    result = await handle_pdf_split("splitempty", b"%PDF", "application/pdf", {})

    assert result.status == "completed"
    assert result.result_payload["pages"] == []
    assert result.result_payload["anzahl_teildokumente"] == 0


@pytest.mark.asyncio
async def test_pdf_split_pages_normalized(monkeypatch):
    """Jede Seite in pages hat page_number-Feld (Normalisierung)."""
    teildokumente = [
        {"pfad": "/tmp/p1.pdf"},
        {"pfad": "/tmp/p2.pdf", "extra_field": "value"},
        "not-a-dict",  # robustness
    ]
    body = _split_response(seiten_anzahl=3, anzahl_teildokumente=3, teildokumente=teildokumente)

    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=body)

    _make_client_patch(monkeypatch, httpx.MockTransport(handler))

    from moag.upload.handlers.pdf_split import handle_pdf_split

    result = await handle_pdf_split("splitpages", b"%PDF", "application/pdf", {})

    pages = result.result_payload["pages"]
    assert len(pages) == 3
    for i, page in enumerate(pages):
        assert page["page_number"] == i + 1


@pytest.mark.asyncio
async def test_pdf_split_http_500(monkeypatch):
    """HTTP 500 → status=failed."""

    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="Server Fehler")

    _make_client_patch(monkeypatch, httpx.MockTransport(handler))

    from moag.upload.handlers.pdf_split import handle_pdf_split

    result = await handle_pdf_split("split500", b"%PDF", "application/pdf", {})

    assert result.status == "failed"
    assert result.operation == "pdf.split"
    assert result.completed_at is not None
    assert "500" in result.error


@pytest.mark.asyncio
async def test_pdf_split_timeout(monkeypatch):
    """Timeout → status=failed."""

    def handler(req: httpx.Request) -> httpx.Response:
        raise httpx.TimeoutException("timed out")

    _make_client_patch(monkeypatch, httpx.MockTransport(handler))

    from moag.upload.handlers.pdf_split import handle_pdf_split

    result = await handle_pdf_split("splittimeout", b"%PDF", "application/pdf", {})

    assert result.status == "failed"
    assert "Timeout" in result.error


@pytest.mark.asyncio
async def test_pdf_split_connect_error(monkeypatch):
    """Connection-Error → status=failed."""

    def handler(req: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused")

    _make_client_patch(monkeypatch, httpx.MockTransport(handler))

    from moag.upload.handlers.pdf_split import handle_pdf_split

    result = await handle_pdf_split("splitconn", b"%PDF", "application/pdf", {})

    assert result.status == "failed"
    assert result.error is not None


@pytest.mark.asyncio
async def test_pdf_split_invalid_json(monkeypatch):
    """200 aber kein valides JSON → status=failed."""

    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="not json{{")

    _make_client_patch(monkeypatch, httpx.MockTransport(handler))

    from moag.upload.handlers.pdf_split import handle_pdf_split

    result = await handle_pdf_split("splitbad", b"%PDF", "application/pdf", {})

    assert result.status == "failed"
    assert result.error is not None


@pytest.mark.asyncio
async def test_pdf_split_schema_strict(monkeypatch):
    """Schema-Strict: alle Pflichtfelder gesetzt."""
    body = _split_response()

    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=body)

    _make_client_patch(monkeypatch, httpx.MockTransport(handler))

    from moag.upload.handlers.pdf_split import handle_pdf_split

    result = await handle_pdf_split("schema_split", b"%PDF", "application/pdf", {})

    assert result.upload_id == "schema_split"
    assert result.status in ("completed", "failed", "queued", "processing")
    assert result.operation == "pdf.split"
    assert isinstance(result.completed_at, datetime)
    assert result.duration_ms is not None


def test_pdf_split_in_registry():
    """pdf.split ist in HANDLERS registriert."""
    from moag.upload.handlers.registry import HANDLERS

    assert "pdf.split" in HANDLERS
    assert HANDLERS["pdf.split"].__module__ == "moag.upload.handlers.pdf_split"
