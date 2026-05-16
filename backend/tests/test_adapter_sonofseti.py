"""
Smoke-Tests fuer sonofseti-Adapter.
"""
from __future__ import annotations

import pytest
import httpx

from moag.adapters import sonofseti
from moag.schemas import SystemStatus


@pytest.mark.asyncio
async def test_no_addresses_returns_ok_false():
    """Ohne node_addresses ist keine Abfrage moeglich — ok=False."""
    status = await sonofseti.get_status(node_addresses=[])
    assert isinstance(status, SystemStatus)
    assert status.system_id == "sonofseti"
    assert status.ok is False
    assert status.score == 0


@pytest.mark.asyncio
async def test_unreachable_node(monkeypatch):
    """Node nicht erreichbar -> ok=False, score=0."""
    def handler(req: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused")

    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real_client(transport=transport, **kw))

    status = await sonofseti.get_status(
        node_addresses=["192.168.200.99"],
        token="test-token",
    )
    assert status.ok is False
    assert status.score == 0


@pytest.mark.asyncio
async def test_reachable_node_healthy(monkeypatch):
    """Eine gesunde Node -> ok=True, score > 0."""
    def handler(req: httpx.Request) -> httpx.Response:
        url = str(req.url)
        if "/health" in url:
            return httpx.Response(200, json={"status": "ok", "mode": "worker"})
        if "/modules" in url:
            return httpx.Response(200, json={"modules": [
                {"name": "ocr-multi", "version": "1.0.3", "status": "ready"},
            ]})
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real_client(transport=transport, **kw))

    status = await sonofseti.get_status(
        node_addresses=["192.168.200.11"],
        token="test-token",
    )
    assert status.ok is True
    assert status.score > 0
    assert status.system_id == "sonofseti"
