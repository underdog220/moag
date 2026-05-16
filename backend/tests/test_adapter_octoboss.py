"""
Smoke-Tests fuer octoboss-Adapter.
"""
from __future__ import annotations

import pytest
import httpx

from moag.adapters import octoboss
from moag.schemas import SystemStatus


@pytest.mark.asyncio
async def test_returns_system_status_unreachable(monkeypatch):
    """Ohne echten OctoBoss: SystemStatus mit ok=False, score=0."""
    def handler(req: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused")

    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real_client(transport=transport, **kw))

    status = await octoboss.get_status(base_url="http://127.0.0.1:8765")
    assert isinstance(status, SystemStatus)
    assert status.system_id == "octoboss"
    assert status.ok is False
    assert status.score == 0


@pytest.mark.asyncio
async def test_reachable_no_nodes(monkeypatch):
    """OctoBoss erreichbar aber keine Nodes -> ok=True, score=60."""
    def handler(req: httpx.Request) -> httpx.Response:
        if "/health" in str(req.url):
            return httpx.Response(200, json={"status": "ok"})
        if "/seti/nodes" in str(req.url):
            return httpx.Response(200, json={"nodes": []})
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real_client(transport=transport, **kw))

    status = await octoboss.get_status(base_url="http://127.0.0.1:8765")
    assert status.ok is True
    assert status.score == 60


@pytest.mark.asyncio
async def test_reachable_with_nodes(monkeypatch):
    """OctoBoss mit 2 verbundenen Nodes -> score=100."""
    nodes_payload = {"nodes": [
        {"node_id": "n1", "hostname": "A", "connected": True, "engines": ["tess"]},
        {"node_id": "n2", "hostname": "B", "connected": True, "engines": ["easy"]},
    ]}

    def handler(req: httpx.Request) -> httpx.Response:
        if "/health" in str(req.url):
            return httpx.Response(200, json={"status": "ok"})
        if "/seti/nodes" in str(req.url):
            return httpx.Response(200, json=nodes_payload)
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real_client(transport=transport, **kw))

    status = await octoboss.get_status(base_url="http://127.0.0.1:8765")
    assert status.ok is True
    assert status.score == 100
    assert status.metrics.get("nodes_connected") == 2
