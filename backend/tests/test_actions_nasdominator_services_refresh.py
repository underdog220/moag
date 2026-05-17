"""
Tests fuer nasdominator.services.refresh Aktion (Phase 3 — echt implementiert).

Prueft: Registry-Eintrag, implemented=True, Handler-Aufruf mit MockTransport.
"""
from __future__ import annotations

import pytest
import httpx

import moag.actions  # noqa: F401 -- Registry befuellen
from moag.actions.registry import ACTION_REGISTRY
from moag.schemas import ActionTriggerResponse


def test_action_in_registry():
    """nasdominator.services.refresh muss in der Registry sein."""
    assert "nasdominator.services.refresh" in ACTION_REGISTRY


def test_action_implemented_true():
    """nasdominator.services.refresh muss implemented=True haben."""
    meta = ACTION_REGISTRY["nasdominator.services.refresh"].meta
    assert meta.implemented is True, (
        f"nasdominator.services.refresh hat implemented={meta.implemented} (erwartet True)"
    )


def test_action_metadata():
    """Metadaten-Pruefung: system_id, category, sub_area."""
    meta = ACTION_REGISTRY["nasdominator.services.refresh"].meta
    assert meta.system_id == "nasdominator"
    assert meta.category == "diagnose"
    assert meta.sub_area == "services"
    assert meta.requires_confirm is False
    assert meta.is_destructive is False


@pytest.mark.asyncio
async def test_handler_sync_success(monkeypatch):
    """Handler liefert status=completed wenn Sync erfolgreich."""
    def http_handler(req: httpx.Request) -> httpx.Response:
        if req.method == "POST" and "/api/services/sync" in str(req.url.path):
            return httpx.Response(200, json={"synced": True, "services_checked": 3})
        return httpx.Response(404)

    transport = httpx.MockTransport(http_handler)
    real_client = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real_client(transport=transport, **kw))

    defn = ACTION_REGISTRY["nasdominator.services.refresh"]
    result = await defn.handler({"base_url": "http://127.0.0.1:9090"})

    assert isinstance(result, ActionTriggerResponse)
    assert result.action_id == "nasdominator.services.refresh"
    assert result.status == "completed"
    assert result.duration_ms is not None


@pytest.mark.asyncio
async def test_handler_sync_endpoint_missing_fallback(monkeypatch):
    """Handler faellt auf Adapter-Refresh zurueck wenn Sync-Endpoint 404 liefert."""
    def http_handler(req: httpx.Request) -> httpx.Response:
        path = str(req.url.path)
        # Sync-Endpoint fehlt
        if req.method == "POST" and "/api/services/sync" in path:
            return httpx.Response(404, json={"detail": "Not Found"})
        # Auth-Status (public)
        if path == "/api/auth/status":
            return httpx.Response(200, json={"setup_complete": True})
        # Dashboard
        if path == "/api/dashboard":
            return httpx.Response(200, json={
                "system": {"cpu_usage": 20.0},
                "raid": [], "containers": [],
            })
        if path == "/api/services/monitored":
            return httpx.Response(200, json=[{"name": "Oberon", "status": "up"}])
        return httpx.Response(404)

    transport = httpx.MockTransport(http_handler)
    real_client = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real_client(transport=transport, **kw))

    defn = ACTION_REGISTRY["nasdominator.services.refresh"]
    result = await defn.handler({"base_url": "http://127.0.0.1:9090"})

    assert isinstance(result, ActionTriggerResponse)
    assert result.status == "completed"
    assert result.payload.get("fallback") is not None


@pytest.mark.asyncio
async def test_handler_auth_required(monkeypatch):
    """Handler liefert status=failed wenn Auth fehlt."""
    def http_handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"detail": "Nicht angemeldet"})

    transport = httpx.MockTransport(http_handler)
    real_client = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real_client(transport=transport, **kw))

    defn = ACTION_REGISTRY["nasdominator.services.refresh"]
    result = await defn.handler({"base_url": "http://127.0.0.1:9090"})

    assert isinstance(result, ActionTriggerResponse)
    assert result.status == "failed"
    assert result.error == "auth_required"


@pytest.mark.asyncio
async def test_handler_unreachable(monkeypatch):
    """Handler liefert status=failed bei Verbindungsfehler."""
    def http_handler(req: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused")

    transport = httpx.MockTransport(http_handler)
    real_client = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real_client(transport=transport, **kw))

    defn = ACTION_REGISTRY["nasdominator.services.refresh"]
    result = await defn.handler({"base_url": "http://127.0.0.1:9090"})

    assert isinstance(result, ActionTriggerResponse)
    assert result.status == "failed"
    assert result.error is not None
