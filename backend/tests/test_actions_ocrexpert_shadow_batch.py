"""
Smoke-Tests fuer ocrexpert.shadow.batch Aktion.
"""
from __future__ import annotations

import httpx
import pytest

from moag.schemas import ActionTriggerResponse


def _make_transport(status: int = 200, body: dict | None = None, text: str | None = None):
    """Hilfsfunktion: MockTransport der /api/v1/shadow/process bedient."""
    def handler(req: httpx.Request) -> httpx.Response:
        if "/api/v1/shadow/process" in str(req.url):
            if status == 200:
                if text is not None:
                    return httpx.Response(200, text=text)
                return httpx.Response(200, json=body or {"pdfa_pfad": "/mnt/qnap_public/Dokumente_pdfa/test.pdf"})
            return httpx.Response(status, text="Fehler")
        return httpx.Response(404)
    return httpx.MockTransport(handler)


@pytest.mark.asyncio
async def test_shadow_batch_completed_default_pfad(monkeypatch):
    """Happy-Path: Standard-Testpfad, Service liefert 200 mit pdfa_pfad."""
    transport = _make_transport(body={
        "pdfa_pfad": "/mnt/qnap_public/Dokumente_pdfa/test.pdf",
        "status": "ok",
    })
    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        httpx, "AsyncClient",
        lambda **kw: real_client(transport=transport, **{k: v for k, v in kw.items() if k != "transport"}),
    )
    monkeypatch.setenv("MOAG_OCREXPERT_BASE_URL", "http://mock-ocrexpert")

    from moag.actions.ocrexpert_shadow_batch import handle_ocrexpert_shadow_batch
    result = await handle_ocrexpert_shadow_batch({})

    assert isinstance(result, ActionTriggerResponse)
    assert result.action_id == "ocrexpert.shadow.batch"
    assert result.status == "completed"
    assert result.payload["pdfa_pfad"] == "/mnt/qnap_public/Dokumente_pdfa/test.pdf"
    assert "/mnt/qnap_public/Dokumente/test.pdf" in result.result_summary
    assert "PDF/A" in result.result_summary


@pytest.mark.asyncio
async def test_shadow_batch_custom_pfad(monkeypatch):
    """Body mit pfad-Key wird korrekt an den Service weitergereicht."""
    custom_pfad = "/mnt/qnap_public/Dokumente/rechnungen/re_2026_042.pdf"
    captured_bodies = []

    def handler(req: httpx.Request) -> httpx.Response:
        import json as _json
        if "/api/v1/shadow/process" in str(req.url):
            captured_bodies.append(_json.loads(req.content))
            return httpx.Response(200, json={"pdfa_pfad": "/mnt/pdfa/re_2026_042.pdf"})
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

    from moag.actions.ocrexpert_shadow_batch import handle_ocrexpert_shadow_batch
    result = await handle_ocrexpert_shadow_batch({"pfad": custom_pfad})

    assert result.status == "completed"
    assert len(captured_bodies) == 1
    # body.pfad (Legacy) wird auf source_path gemappt
    assert captured_bodies[0]["source_path"] == custom_pfad
    # shadow_path Default-Ableitung: /Dokumente/ -> /Dokumente_pdfa/
    assert "Dokumente_pdfa" in captured_bodies[0]["shadow_path"]
    assert custom_pfad in result.result_summary


@pytest.mark.asyncio
async def test_shadow_batch_failed_http_error(monkeypatch):
    """Service antwortet 500 → status=failed."""
    transport = _make_transport(status=500)
    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        httpx, "AsyncClient",
        lambda **kw: real_client(transport=transport, **{k: v for k, v in kw.items() if k != "transport"}),
    )
    monkeypatch.setenv("MOAG_OCREXPERT_BASE_URL", "http://mock-ocrexpert")

    from moag.actions.ocrexpert_shadow_batch import handle_ocrexpert_shadow_batch
    result = await handle_ocrexpert_shadow_batch({})

    assert result.status == "failed"
    assert result.payload.get("status_code") == 500
    assert result.error is not None


@pytest.mark.asyncio
async def test_shadow_batch_connect_error(monkeypatch):
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

    from moag.actions.ocrexpert_shadow_batch import handle_ocrexpert_shadow_batch
    result = await handle_ocrexpert_shadow_batch({})

    assert result.status == "failed"
    assert result.error is not None


@pytest.mark.asyncio
async def test_shadow_batch_plain_text_response(monkeypatch):
    """Service antwortet Plain-Text statt JSON → wird toleriert."""
    transport = _make_transport(text="Shadow-Verarbeitung abgeschlossen.")
    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        httpx, "AsyncClient",
        lambda **kw: real_client(transport=transport, **{k: v for k, v in kw.items() if k != "transport"}),
    )
    monkeypatch.setenv("MOAG_OCREXPERT_BASE_URL", "http://mock-ocrexpert")

    from moag.actions.ocrexpert_shadow_batch import handle_ocrexpert_shadow_batch
    result = await handle_ocrexpert_shadow_batch({})

    # Kein JSON-Fehler, completed da HTTP 200
    assert result.status == "completed"
    assert "pdfa_pfad" in result.payload
    assert result.payload["pdfa_pfad"] is None


@pytest.mark.asyncio
async def test_shadow_batch_in_registry():
    """ocrexpert.shadow.batch ist als implemented=True in der Registry eingetragen."""
    from moag.actions import ACTION_REGISTRY
    assert "ocrexpert.shadow.batch" in ACTION_REGISTRY
    entry = ACTION_REGISTRY["ocrexpert.shadow.batch"]
    assert entry.meta.implemented is True
    assert entry.meta.system_id == "ocrexpert"
