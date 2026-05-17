"""
Smoke-Tests fuer ocrexpert-Adapter.
"""
from __future__ import annotations

import pytest
import httpx

from moag.adapters import ocrexpert
from moag.schemas import SystemStatus


@pytest.mark.asyncio
async def test_unreachable_returns_ok_false(monkeypatch):
    """Kein erreichbarer OCRexpert -> ok=False, score=0."""
    def handler(req: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused")

    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real_client(transport=transport, **kw))

    status = await ocrexpert.get_status(base_url="http://127.0.0.1:17820")
    assert isinstance(status, SystemStatus)
    assert status.system_id == "ocrexpert"
    assert status.ok is False
    assert status.score == 0


@pytest.mark.asyncio
async def test_reachable_full_stack(monkeypatch):
    """OCRexpert mit voller Telemetrie (status=ok + alle Capabilities) -> score=100."""
    def handler(req: httpx.Request) -> httpx.Response:
        if "/api/v1/health" in str(req.url):
            return httpx.Response(200, json={
                "status": "ok",
                "version": "0.7.1",
                "engines_local": ["tesseract", "surya", "paddle"],
                "engines_octoboss": ["tesseract"],
                "octoboss_reachable": True,
                "libreoffice_available": True,
                "shadow_writable": True,
            })
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real_client(transport=transport, **kw))

    status = await ocrexpert.get_status(base_url="http://127.0.0.1:17810")
    assert status.ok is True
    assert status.score == 100
    assert status.metrics["engines_local_count"] == 3
    assert status.metrics["octoboss_reachable"] is True
    assert "OctoBoss erreichbar" in status.summary


@pytest.mark.asyncio
async def test_reachable_degraded_no_octoboss(monkeypatch):
    """OCRexpert erreichbar aber OctoBoss + LibreOffice weg -> score=70 (40+25+5)."""
    def handler(req: httpx.Request) -> httpx.Response:
        if "/api/v1/health" in str(req.url):
            return httpx.Response(200, json={
                "status": "ok",
                "version": "0.7.1",
                "engines_local": ["tesseract"],
                "engines_octoboss": [],
                "octoboss_reachable": False,
                "libreoffice_available": False,
                "shadow_writable": True,
            })
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real_client(transport=transport, **kw))

    status = await ocrexpert.get_status(base_url="http://127.0.0.1:17810")
    # 40 (ok) + 25 (engines_local>0) + 0 (kein octoboss) + 0 (kein libreoffice) + 5 (shadow)
    assert status.score == 70
    assert status.ok is True
    assert "offline" in status.summary  # OctoBoss offline


@pytest.mark.asyncio
async def test_has_fetched_at(monkeypatch):
    def handler(req: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused")
    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real_client(transport=transport, **kw))

    status = await ocrexpert.get_status(base_url="http://127.0.0.1:17820")
    assert status.fetched_at is not None
