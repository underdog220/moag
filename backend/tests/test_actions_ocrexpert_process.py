"""
Smoke-Tests fuer ocrexpert.process Aktion.

Testet handle_ocrexpert_process gegen einen Mock-OCRexpert-Service.
Pattern identisch mit test_actions_ocrexpert_shadow_batch.py.
"""
from __future__ import annotations

import httpx
import pytest

from moag.schemas import ActionTriggerResponse


def _make_transport(
    status: int = 200,
    body: dict | None = None,
    text: str | None = None,
):
    """Hilfsfunktion: MockTransport der /api/v1/process bedient."""
    def handler(req: httpx.Request) -> httpx.Response:
        if "/api/v1/process" in str(req.url):
            if status == 200:
                if text is not None:
                    return httpx.Response(200, text=text)
                return httpx.Response(
                    200,
                    json=body or {
                        "text": "Dies ist ein Testdokument mit viel Inhalt.",
                        "doctype": "brief",
                        "pii": None,
                        "duration_ms": 1234,
                    },
                )
            return httpx.Response(status, text="Fehler")
        return httpx.Response(404)

    return httpx.MockTransport(handler)


@pytest.mark.asyncio
async def test_process_completed_default_pfad(monkeypatch):
    """Happy-Path: Standard-Testpfad, Service liefert 200 mit text + doctype."""
    transport = _make_transport(body={
        "text": "Hallo Welt. Dies ist ein Testtext.",
        "doctype": "brief",
        "duration_ms": 987,
    })
    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        httpx, "AsyncClient",
        lambda **kw: real_client(transport=transport, **{k: v for k, v in kw.items() if k != "transport"}),
    )
    monkeypatch.setenv("MOAG_OCREXPERT_BASE_URL", "http://mock-ocrexpert")

    from moag.actions.ocrexpert_process import handle_ocrexpert_process
    result = await handle_ocrexpert_process({})

    assert isinstance(result, ActionTriggerResponse)
    assert result.action_id == "ocrexpert.process"
    assert result.status == "completed"
    # n_chars soll Laenge des erkannten Textes sein
    assert result.payload["n_chars"] == len("Hallo Welt. Dies ist ein Testtext.")
    assert "/mnt/qnap_public/Dokumente/test.pdf" in result.result_summary
    assert "Zeichen" in result.result_summary


@pytest.mark.asyncio
async def test_process_custom_pfad(monkeypatch):
    """body["pfad"] wird korrekt an den Service weitergereicht."""
    custom_pfad = "/mnt/qnap_public/Dokumente/rechnungen/re_2026_042.pdf"
    captured_bodies: list[dict] = []

    def handler(req: httpx.Request) -> httpx.Response:
        import json as _json
        if "/api/v1/process" in str(req.url):
            captured_bodies.append(_json.loads(req.content))
            return httpx.Response(200, json={
                "text": "Rechnung 042",
                "doctype": "rechnung",
                "duration_ms": 500,
            })
        return httpx.Response(404)

    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        httpx, "AsyncClient",
        lambda **kw: real_client(
            transport=httpx.MockTransport(handler),
            **{k: v for k, v in kw.items() if k != "transport"},
        ),
    )
    monkeypatch.setenv("MOAG_OCREXPERT_BASE_URL", "http://mock-ocrexpert")

    from moag.actions.ocrexpert_process import handle_ocrexpert_process
    result = await handle_ocrexpert_process({"pfad": custom_pfad})

    assert result.status == "completed"
    assert len(captured_bodies) == 1
    assert captured_bodies[0]["pfad"] == custom_pfad
    assert custom_pfad in result.result_summary
    assert "rechnung" in result.result_summary.lower()


@pytest.mark.asyncio
async def test_process_failed_http_error(monkeypatch):
    """Service antwortet 500 → status=failed."""
    transport = _make_transport(status=500)
    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        httpx, "AsyncClient",
        lambda **kw: real_client(transport=transport, **{k: v for k, v in kw.items() if k != "transport"}),
    )
    monkeypatch.setenv("MOAG_OCREXPERT_BASE_URL", "http://mock-ocrexpert")

    from moag.actions.ocrexpert_process import handle_ocrexpert_process
    result = await handle_ocrexpert_process({})

    assert result.status == "failed"
    assert result.payload.get("status_code") == 500
    assert result.error is not None


@pytest.mark.asyncio
async def test_process_connect_error(monkeypatch):
    """Service nicht erreichbar → status=failed."""
    def handler(req: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused")

    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        httpx, "AsyncClient",
        lambda **kw: real_client(
            transport=httpx.MockTransport(handler),
            **{k: v for k, v in kw.items() if k != "transport"},
        ),
    )
    monkeypatch.setenv("MOAG_OCREXPERT_BASE_URL", "http://mock-ocrexpert")

    from moag.actions.ocrexpert_process import handle_ocrexpert_process
    result = await handle_ocrexpert_process({})

    assert result.status == "failed"
    assert result.error is not None


@pytest.mark.asyncio
async def test_process_no_text_field(monkeypatch):
    """Service liefert 200 ohne text-Feld → n_chars=0, kein Crash."""
    transport = _make_transport(body={"status": "ok", "doctype": "unbekannt"})
    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        httpx, "AsyncClient",
        lambda **kw: real_client(transport=transport, **{k: v for k, v in kw.items() if k != "transport"}),
    )
    monkeypatch.setenv("MOAG_OCREXPERT_BASE_URL", "http://mock-ocrexpert")

    from moag.actions.ocrexpert_process import handle_ocrexpert_process
    result = await handle_ocrexpert_process({})

    assert result.status == "completed"
    assert result.payload["n_chars"] == 0
    assert "0 Zeichen" in result.result_summary


@pytest.mark.asyncio
async def test_process_plain_text_response(monkeypatch):
    """Service antwortet Plain-Text statt JSON → wird toleriert."""
    transport = _make_transport(text="OCR-Verarbeitung abgeschlossen. Text: Hallo")
    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        httpx, "AsyncClient",
        lambda **kw: real_client(transport=transport, **{k: v for k, v in kw.items() if k != "transport"}),
    )
    monkeypatch.setenv("MOAG_OCREXPERT_BASE_URL", "http://mock-ocrexpert")

    from moag.actions.ocrexpert_process import handle_ocrexpert_process
    result = await handle_ocrexpert_process({})

    # Kein Crash, completed da HTTP 200
    assert result.status == "completed"
    assert "n_chars" in result.payload


@pytest.mark.asyncio
async def test_process_in_registry():
    """ocrexpert.process ist als implemented=True in der Registry eingetragen."""
    from moag.actions import ACTION_REGISTRY
    assert "ocrexpert.process" in ACTION_REGISTRY
    entry = ACTION_REGISTRY["ocrexpert.process"]
    assert entry.meta.implemented is True
    assert entry.meta.system_id == "ocrexpert"
    assert entry.meta.category == "operation"
    assert entry.meta.sub_area == "process"
    assert entry.meta.estimated_duration_s == 30
