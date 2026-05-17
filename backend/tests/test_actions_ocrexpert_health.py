"""
Smoke-Tests fuer ocrexpert.health.check Aktion.
"""
from __future__ import annotations

import httpx
import pytest

from moag.schemas import ActionTriggerResponse


@pytest.mark.asyncio
async def test_ocrexpert_health_completed(monkeypatch):
    """Mocked OCRexpert Health-Response -> Aktion liefert completed mit payload."""
    def handler(req: httpx.Request) -> httpx.Response:
        if "/api/v1/health" in str(req.url):
            return httpx.Response(200, json={
                "status": "ok",
                "version": "0.7.1",
                "engines_local": ["tesseract", "surya"],
                "engines_octoboss": ["tesseract"],
                "octoboss_reachable": True,
                "libreoffice_available": True,
                "shadow_writable": True,
            })
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient

    monkeypatch.setattr(
        httpx, "AsyncClient",
        lambda **kw: real_client(transport=transport, **{k: v for k, v in kw.items() if k != "transport"}),
    )
    monkeypatch.setenv("MOAG_OCREXPERT_BASE_URL", "http://mock-ocrexpert")

    from moag.actions.ocrexpert_health import handle_ocrexpert_health
    result = await handle_ocrexpert_health({})

    assert isinstance(result, ActionTriggerResponse)
    assert result.action_id == "ocrexpert.health.check"
    assert result.status == "completed"
    assert result.payload["status"] == "ok"
    assert result.payload["octoboss_reachable"] is True
    assert len(result.payload["engines_local"]) == 2
    assert result.result_summary is not None
    assert "0.7.1" in result.result_summary


@pytest.mark.asyncio
async def test_ocrexpert_health_unreachable(monkeypatch):
    """OCRexpert nicht erreichbar -> Aktion liefert failed."""
    def handler(req: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused")

    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient

    monkeypatch.setattr(
        httpx, "AsyncClient",
        lambda **kw: real_client(transport=transport, **{k: v for k, v in kw.items() if k != "transport"}),
    )
    monkeypatch.setenv("MOAG_OCREXPERT_BASE_URL", "http://mock-ocrexpert")

    from moag.actions.ocrexpert_health import handle_ocrexpert_health
    result = await handle_ocrexpert_health({})

    assert result.status == "failed"
    assert result.error is not None


@pytest.mark.asyncio
async def test_ocrexpert_health_http_error(monkeypatch):
    """OCRexpert antwortet 503 -> Aktion liefert failed mit status_code im payload."""
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(503, text="Service Unavailable")

    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient

    monkeypatch.setattr(
        httpx, "AsyncClient",
        lambda **kw: real_client(transport=transport, **{k: v for k, v in kw.items() if k != "transport"}),
    )
    monkeypatch.setenv("MOAG_OCREXPERT_BASE_URL", "http://mock-ocrexpert")

    from moag.actions.ocrexpert_health import handle_ocrexpert_health
    result = await handle_ocrexpert_health({})

    assert result.status == "failed"
    assert result.payload.get("status_code") == 503
