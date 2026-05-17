"""
Smoke-Tests fuer octoboss.cluster.status Aktion.
"""
from __future__ import annotations

import httpx
import pytest

from moag.schemas import ActionTriggerResponse


@pytest.mark.asyncio
async def test_octoboss_cluster_status_completed(monkeypatch):
    """Mocked OctoBoss Cluster-Status-Response -> Aktion liefert completed."""
    def handler(req: httpx.Request) -> httpx.Response:
        if "/admin/cluster/status" in str(req.url):
            return httpx.Response(200, json={
                "mode": "LEADER",
                "epoch": 42,
                "primary_id": "node-alpha",
                "nodes_count": 3,
            })
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient

    monkeypatch.setattr(
        httpx, "AsyncClient",
        lambda **kw: real_client(transport=transport, **{k: v for k, v in kw.items() if k != "transport"}),
    )
    monkeypatch.setenv("MOAG_OCTOBOSS_BASE_URL", "http://mock-octoboss")

    from moag.actions.octoboss_cluster_status import handle_octoboss_cluster_status
    result = await handle_octoboss_cluster_status({})

    assert isinstance(result, ActionTriggerResponse)
    assert result.action_id == "octoboss.cluster.status"
    assert result.status == "completed"
    assert result.payload["mode"] == "LEADER"
    assert result.payload["epoch"] == 42
    assert result.payload["primary_id"] == "node-alpha"
    assert result.result_summary is not None
    assert "LEADER" in result.result_summary
    assert "node-alpha" in result.result_summary


@pytest.mark.asyncio
async def test_octoboss_cluster_status_unreachable(monkeypatch):
    """OctoBoss nicht erreichbar -> Aktion liefert failed."""
    def handler(req: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused")

    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient

    monkeypatch.setattr(
        httpx, "AsyncClient",
        lambda **kw: real_client(transport=transport, **{k: v for k, v in kw.items() if k != "transport"}),
    )
    monkeypatch.setenv("MOAG_OCTOBOSS_BASE_URL", "http://mock-octoboss")

    from moag.actions.octoboss_cluster_status import handle_octoboss_cluster_status
    result = await handle_octoboss_cluster_status({})

    assert result.status == "failed"
    assert result.error is not None


@pytest.mark.asyncio
async def test_octoboss_cluster_status_no_nodes_count_fallback(monkeypatch):
    """OctoBoss gibt nodes-Liste statt nodes_count -> Fallback-Zaehllogik."""
    def handler(req: httpx.Request) -> httpx.Response:
        if "/admin/cluster/status" in str(req.url):
            return httpx.Response(200, json={
                "mode": "FOLLOWER",
                "epoch": 10,
                "nodes": [{"id": "n1"}, {"id": "n2"}],
                # kein nodes_count-Feld
            })
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient

    monkeypatch.setattr(
        httpx, "AsyncClient",
        lambda **kw: real_client(transport=transport, **{k: v for k, v in kw.items() if k != "transport"}),
    )
    monkeypatch.setenv("MOAG_OCTOBOSS_BASE_URL", "http://mock-octoboss")

    from moag.actions.octoboss_cluster_status import handle_octoboss_cluster_status
    result = await handle_octoboss_cluster_status({})

    assert result.status == "completed"
    assert result.payload["nodes_count"] == 2
    assert "FOLLOWER" in result.result_summary
