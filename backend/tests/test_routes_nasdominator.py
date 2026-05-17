"""
Smoke-Tests fuer NasDominator-Routen (/api/v1/nasdominator/*).

Testet: Health, Services, Metrics, Containers — jeweils mit Mock-Adapter.
"""
from __future__ import annotations

import pytest
import httpx
from fastapi.testclient import TestClient

from moag.api import create_app


@pytest.fixture
def client(tmp_path, monkeypatch):
    """TestClient mit Mock-Adapter fuer NasDominator."""
    app = create_app(enable_pipeline=False)
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c


def _mock_nasdom(monkeypatch, handler_fn):
    """Patcht httpx.AsyncClient so dass NasDominator-Calls abgefangen werden."""
    transport = httpx.MockTransport(handler_fn)
    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        httpx, "AsyncClient",
        lambda **kw: real_client(transport=transport, **kw),
    )


# ── /api/v1/nasdominator/health ───────────────────────────────────────────────

def test_health_returns_system_status(client, monkeypatch):
    """GET /api/v1/nasdominator/health liefert SystemStatus-kompatibles JSON."""
    def handler(req: httpx.Request) -> httpx.Response:
        path = str(req.url.path)
        if path == "/api/auth/status":
            return httpx.Response(200, json={"setup_complete": True})
        if path == "/api/dashboard":
            return httpx.Response(200, json={
                "system": {"cpu_usage": 30.0, "ram_usage": 50.0},
                "raid": [], "containers": [],
            })
        if path == "/api/services/monitored":
            return httpx.Response(200, json=[
                {"name": "Oberon", "status": "up"},
            ])
        return httpx.Response(404)

    _mock_nasdom(monkeypatch, handler)
    resp = client.get("/api/v1/nasdominator/health")
    assert resp.status_code == 200
    data = resp.json()
    assert "system_id" in data
    assert data["system_id"] == "nasdominator"
    assert "score" in data
    assert "ok" in data
    assert "summary" in data


def test_health_unreachable_returns_502(client, monkeypatch):
    """GET /api/v1/nasdominator/health liefert 502 wenn NasDom nicht erreichbar."""
    def handler(req: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused")

    _mock_nasdom(monkeypatch, handler)
    resp = client.get("/api/v1/nasdominator/health")
    assert resp.status_code == 502


# ── /api/v1/nasdominator/services ────────────────────────────────────────────

def test_services_returns_list(client, monkeypatch):
    """GET /api/v1/nasdominator/services liefert services-Liste."""
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=[
            {"name": "Oberon", "status": "up"},
            {"name": "Postgres", "status": "up"},
        ])

    _mock_nasdom(monkeypatch, handler)
    resp = client.get("/api/v1/nasdominator/services")
    assert resp.status_code == 200
    data = resp.json()
    assert "services" in data
    assert len(data["services"]) == 2


def test_services_auth_required(client, monkeypatch):
    """GET /api/v1/nasdominator/services liefert 200 mit auth_required=True bei 401."""
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"detail": "Nicht angemeldet"})

    _mock_nasdom(monkeypatch, handler)
    resp = client.get("/api/v1/nasdominator/services")
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("auth_required") is True


# ── /api/v1/nasdominator/metrics ─────────────────────────────────────────────

def test_metrics_returns_data(client, monkeypatch):
    """GET /api/v1/nasdominator/metrics liefert Metrik-Dict."""
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"cpu_percent": 12.5, "ram_percent": 44.0})

    _mock_nasdom(monkeypatch, handler)
    resp = client.get("/api/v1/nasdominator/metrics")
    assert resp.status_code == 200
    data = resp.json()
    assert "metrics" in data
    assert data["metrics"]["cpu_percent"] == 12.5


def test_metrics_auth_required(client, monkeypatch):
    """GET /api/v1/nasdominator/metrics liefert 200 mit auth_required=True bei 401."""
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"detail": "Nicht angemeldet"})

    _mock_nasdom(monkeypatch, handler)
    resp = client.get("/api/v1/nasdominator/metrics")
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("auth_required") is True


# ── /api/v1/nasdominator/containers ──────────────────────────────────────────

def test_containers_returns_list(client, monkeypatch):
    """GET /api/v1/nasdominator/containers liefert Container-Liste."""
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=[
            {"name": "oberon", "status": "running"},
        ])

    _mock_nasdom(monkeypatch, handler)
    resp = client.get("/api/v1/nasdominator/containers")
    assert resp.status_code == 200
    data = resp.json()
    assert "containers" in data
    assert len(data["containers"]) == 1


def test_containers_auth_required(client, monkeypatch):
    """GET /api/v1/nasdominator/containers liefert 200 mit auth_required=True bei 401."""
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"detail": "Nicht angemeldet"})

    _mock_nasdom(monkeypatch, handler)
    resp = client.get("/api/v1/nasdominator/containers")
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("auth_required") is True
