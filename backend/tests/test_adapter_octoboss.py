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
    """OctoBoss erreichbar aber keine Nodes -> ok=False, score=30 (Sonderfall)."""
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
    assert status.score == 30
    assert status.ok is False  # score 30 < 40 -> nicht ok


@pytest.mark.asyncio
async def test_reachable_with_perfect_nodes(monkeypatch):
    """2 Nodes mit voller Telemetrie (connected + Ollama + Hardware + IDLE) -> score=100."""
    nodes_payload = {"nodes": [
        {
            "node_id": "n1", "hostname": "A", "connected": True, "mode": "IDLE",
            "ollama": {"running": True},
            "hardware": {"gpu_name": "RTX 4070", "gpu_load_percent": 12, "cpu_load_percent": 5, "ram_free_gb": 16.0},
        },
        {
            "node_id": "n2", "hostname": "B", "connected": True, "mode": "ACTIVE",
            "ollama": {"running": True},
            "hardware": {"gpu_name": "RTX 3060", "gpu_load_percent": 22, "cpu_load_percent": 8, "ram_free_gb": 12.0},
        },
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
    assert status.metrics.get("nodes_ollama_running") == 2
    assert status.metrics.get("nodes_hardware_present") == 2
    assert status.metrics.get("nodes_mode_ok") == 2


@pytest.mark.asyncio
async def test_reachable_connected_but_no_compute(monkeypatch):
    """Nodes connected aber ohne Ollama/Hardware/Mode-Telemetrie -> niedriger Score (~50)."""
    nodes_payload = {"nodes": [
        {
            "node_id": "n1", "hostname": "A", "connected": True, "mode": "IDLE",
            "ollama": {"running": False},
            "hardware": {"gpu_name": "", "gpu_load_percent": None, "cpu_load_percent": None, "ram_free_gb": None},
        },
        {
            "node_id": "n2", "hostname": "B", "connected": True, "mode": "IDLE",
            "ollama": {"running": False},
            "hardware": {"gpu_name": "", "gpu_load_percent": None, "cpu_load_percent": None, "ram_free_gb": None},
        },
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
    # 40% connected (2/2=1.0) + 30% ollama (0) + 20% hardware (0) + 10% mode_ok (2/2=1.0)
    # = 0.40 * 1.0 + 0.10 * 1.0 = 0.50 -> Score 50
    assert status.score == 50
    assert status.ok is True  # 50 >= 40
    assert status.metrics.get("nodes_ollama_running") == 0
    assert status.metrics.get("nodes_hardware_present") == 0
    assert "0/2 Ollama" in status.summary
