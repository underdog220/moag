"""
Tests fuer HubClient — Multi-Hub-Polling mit httpx-Mock.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone

import httpx
import pytest
from pytest import MonkeyPatch

from moag.events import EventBus
from moag.hub_client import HubClient
from moag.models import HubConfig, HubStatus


def _make_mock_transport(routes: dict[str, tuple[int, dict | str | None]]):
    """Erstellt ein httpx.MockTransport, das auf URL-Praefixe reagiert."""
    def handler(req: httpx.Request) -> httpx.Response:
        for prefix, (status, body) in routes.items():
            if str(req.url).startswith(prefix):
                if body is None:
                    return httpx.Response(status)
                if isinstance(body, dict):
                    return httpx.Response(status, json=body)
                return httpx.Response(status, content=body)
        return httpx.Response(404, text="not found")
    return httpx.MockTransport(handler)


@pytest.mark.asyncio
async def test_poll_reachable_hub(monkeypatch: MonkeyPatch):
    """Hub liefert /health 200 + /seti/nodes mit 2 Knoten."""
    nodes_payload = {"nodes": [
        {
            "node_id": "n1", "hostname": "WorkRyzen", "connected": True,
            "last_heartbeat": "2026-05-06T10:00:00Z",
            "hardware": {"gpu_load_percent": 22, "cpu_load_percent": 14, "ram_free_gb": 24.0,
                         "gpu_name": "RTX 4070", "cpu_model": "Ryzen 9"},
            "engines": ["tesseract", "easyocr"],
            "modules": [{"name": "ocr-multi", "version": "1.0.3"}],
            "last_known_ip": "192.168.200.11",
        },
        {
            "node_id": "n2", "hostname": "Ryzenstrike", "connected": False,
            "engines": [],
        },
    ]}
    transport = _make_mock_transport({
        "http://hub-a/health":       (200, ""),
        "http://hub-a/seti/nodes":   (200, nodes_payload),
    })
    real_client = httpx.AsyncClient
    def fake_async_client(**kw):
        return real_client(transport=transport, **kw)
    monkeypatch.setattr(httpx, "AsyncClient", fake_async_client)

    bus = EventBus()
    client = HubClient(event_bus=bus, timeout=1.0, poll_interval=60.0)
    client.configure(
        [HubConfig(id="a", name="Hub-A", url="http://hub-a")],
        default_hub_id="a",
    )
    cache = await client.poll_once()
    status = cache["a"]
    assert status.reachable is True
    assert status.nodes_total == 2
    assert status.nodes_connected == 1
    assert status.engines_count == 2  # nur connected node, hat 2 engines

    # Nodes-Cache stimmt
    nodes = client.get_nodes()
    assert len(nodes) == 2
    assert nodes[0].hostname == "WorkRyzen"
    assert nodes[0].hardware.gpu_load_percent == 22


@pytest.mark.asyncio
async def test_poll_unreachable_hub(monkeypatch: MonkeyPatch):
    """Hub timed out / connection refused — wird als reachable=False markiert."""
    def handler(req: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused")

    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real_client(transport=transport, **kw))

    bus = EventBus()
    client = HubClient(event_bus=bus, timeout=0.5, poll_interval=60.0)
    client.configure(
        [HubConfig(id="dead", name="Tot", url="http://dead")],
        default_hub_id="dead",
    )
    cache = await client.poll_once()
    assert cache["dead"].reachable is False
    assert "refused" in (cache["dead"].error or "").lower()


@pytest.mark.asyncio
async def test_poll_hub_404_for_nodes_endpoint(monkeypatch: MonkeyPatch):
    """Hub-Healthcheck ok, aber /seti/nodes 404 — Hub bleibt reachable, nodes leer."""
    transport = _make_mock_transport({
        "http://hub-b/health": (200, ""),
        # Kein /seti/nodes — Default 404
    })
    real_client = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real_client(transport=transport, **kw))

    client = HubClient(timeout=1.0, poll_interval=60.0)
    client.configure(
        [HubConfig(id="b", name="B", url="http://hub-b")],
        default_hub_id="b",
    )
    cache = await client.poll_once()
    assert cache["b"].reachable is True
    assert cache["b"].nodes_total == 0


@pytest.mark.asyncio
async def test_event_bus_pushes_status_change(monkeypatch: MonkeyPatch):
    """Wenn ein Hub von reachable=False auf True wechselt, soll ein WS-Event raus."""
    state = {"alive": False}

    def handler(req: httpx.Request) -> httpx.Response:
        if "/health" in str(req.url):
            if state["alive"]:
                return httpx.Response(200)
            raise httpx.ConnectError("dead")
        if "/seti/nodes" in str(req.url):
            return httpx.Response(200, json={"nodes": []})
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real_client(transport=transport, **kw))

    bus = EventBus()
    client = HubClient(event_bus=bus, timeout=0.5, poll_interval=60.0)
    client.configure(
        [HubConfig(id="x", name="X", url="http://hub-x")],
        default_hub_id="x",
    )
    await client.poll_once()
    state["alive"] = True
    await client.poll_once()
    types = [e["type"] for e in bus.backlog()]
    assert types.count("hub_status_changed") >= 2  # 1x initial down, 1x up


@pytest.mark.asyncio
async def test_engine_matrix(monkeypatch: MonkeyPatch):
    """Engine-Matrix korrekt aufgebaut."""
    nodes_payload = {"nodes": [
        {"node_id": "n1", "hostname": "A", "connected": True, "engines": ["tess", "easy"]},
        {"node_id": "n2", "hostname": "B", "connected": True, "engines": ["tess", "paddle"]},
    ]}
    transport = _make_mock_transport({
        "http://hub-m/health": (200, ""),
        "http://hub-m/seti/nodes": (200, nodes_payload),
    })
    real_client = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real_client(transport=transport, **kw))

    client = HubClient(timeout=1.0, poll_interval=60.0)
    client.configure(
        [HubConfig(id="m", name="M", url="http://hub-m")],
        default_hub_id="m",
    )
    await client.poll_once()
    matrix = client.get_engine_matrix()
    assert sorted(matrix.engines) == ["easy", "paddle", "tess"]
    assert matrix.nodes == ["A", "B"]
    eng_idx = {e: i for i, e in enumerate(matrix.engines)}
    assert matrix.available[eng_idx["easy"]] == ["ok", "missing"]
    assert matrix.available[eng_idx["paddle"]] == ["missing", "ok"]
    assert matrix.available[eng_idx["tess"]] == ["ok", "ok"]


@pytest.mark.asyncio
async def test_get_status_before_poll(monkeypatch: MonkeyPatch):
    """get_status() vor dem ersten Poll soll keinen Crash machen."""
    client = HubClient(timeout=0.5, poll_interval=60.0)
    client.configure(
        [HubConfig(id="z", name="Z", url="http://nowhere")],
        default_hub_id="z",
    )
    sts = client.get_status()
    assert len(sts) == 1
    assert sts[0].reachable is False


@pytest.mark.asyncio
async def test_start_stop(monkeypatch: MonkeyPatch):
    """start() laeuft initial einmal poll_once, stop() raeumt auf."""
    transport = _make_mock_transport({
        "http://hub-s/health": (200, ""),
        "http://hub-s/seti/nodes": (200, {"nodes": []}),
    })
    real_client = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real_client(transport=transport, **kw))

    client = HubClient(timeout=0.5, poll_interval=0.05)
    client.configure(
        [HubConfig(id="s", name="S", url="http://hub-s")],
        default_hub_id="s",
    )
    await client.start()
    # Loop laeuft kurz, dann stoppen
    await asyncio.sleep(0.15)
    await client.stop()
    assert client.get_status_by_id("s").reachable is True


@pytest.mark.asyncio
async def test_configure_replaces_hubs():
    client = HubClient(timeout=0.5, poll_interval=60.0)
    client.configure([HubConfig(id="a", name="A", url="http://a")], "a")
    # Status-Cache vorbelegen, damit der Reset getestet wird
    client._status_cache["a"] = HubStatus(  # type: ignore[attr-defined]
        id="a", name="A", url="http://a", reachable=True, latency_ms=1,
        nodes_total=1, nodes_connected=1, engines_count=2, is_default=True,
        last_check=datetime.now(timezone.utc),
    )
    # Neuer Hub statt 'a' -> alter Cache muss raus
    client.configure([HubConfig(id="b", name="B", url="http://b")], "b")
    assert "a" not in client._status_cache  # type: ignore[attr-defined]
