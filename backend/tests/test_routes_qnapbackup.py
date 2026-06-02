"""
Tests fuer /api/v1/qnapbackup Proxy-Routen.

Alle Tests nutzen httpx.MockTransport + TestClient der FastAPI-App.
Der qnapbackup-Dienst wird nicht wirklich angesprochen.
"""
from __future__ import annotations

import httpx
import pytest
from fastapi.testclient import TestClient

from moag.api import create_app


# ── Fixtures ──────────────────────────────────────────────────────────────────


@pytest.fixture
def client(monkeypatch):
    """TestClient ohne Pipeline (schneller)."""
    app = create_app(enable_pipeline=False)
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c


def _patch_qnapbackup(monkeypatch, handler_fn):
    """Patcht httpx.AsyncClient so dass qnapbackup-Calls abgefangen werden."""
    transport = httpx.MockTransport(handler_fn)
    real_client = httpx.AsyncClient

    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda **kw: real_client(transport=transport, **{k: v for k, v in kw.items() if k != "transport"}),
    )


# ── /api/v1/qnapbackup/status ─────────────────────────────────────────────────


def test_status_proxied(client, monkeypatch):
    """GET /api/v1/qnapbackup/status leitet an /api/v1/status weiter und liefert JSON."""
    mock_payload = {
        "ok": True,
        "score": 85,
        "summary": "Backup OK",
        "metrics": {
            "last_backup_at": "2026-06-01T03:00:00Z",
            "free_space_bytes": 1099511627776,
            "errors_24h": 0,
        },
        "fetched_at": "2026-06-02T08:00:00Z",
    }

    def handler(req: httpx.Request) -> httpx.Response:
        if "/api/v1/status" in str(req.url):
            return httpx.Response(200, json=mock_payload)
        return httpx.Response(404, json={"detail": "not found"})

    _patch_qnapbackup(monkeypatch, handler)
    resp = client.get("/api/v1/qnapbackup/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert data["score"] == 85
    assert "metrics" in data


def test_status_upstream_error_returns_http_error(client, monkeypatch):
    """GET /api/v1/qnapbackup/status liefert HTTP-Status wenn Upstream nicht 2xx."""
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(503, json={"detail": "Service Unavailable"})

    _patch_qnapbackup(monkeypatch, handler)
    resp = client.get("/api/v1/qnapbackup/status")
    assert resp.status_code == 503


def test_status_connect_error_returns_502(client, monkeypatch):
    """GET /api/v1/qnapbackup/status liefert 502 wenn qnapbackup nicht erreichbar."""
    def handler(req: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused")

    _patch_qnapbackup(monkeypatch, handler)
    resp = client.get("/api/v1/qnapbackup/status")
    assert resp.status_code == 502
    assert "502" in str(resp.status_code)


def test_status_timeout_returns_504(client, monkeypatch):
    """GET /api/v1/qnapbackup/status liefert 504 bei Timeout."""
    def handler(req: httpx.Request) -> httpx.Response:
        raise httpx.TimeoutException("timeout", request=req)

    _patch_qnapbackup(monkeypatch, handler)
    resp = client.get("/api/v1/qnapbackup/status")
    assert resp.status_code == 504


# ── /api/v1/qnapbackup/backups/recent ────────────────────────────────────────


def test_backups_recent_default_limit(client, monkeypatch):
    """GET /api/v1/qnapbackup/backups/recent liefert items-Liste (Default limit=20)."""
    mock_payload = {
        "items": [
            {
                "id": "bak-001",
                "started_at": "2026-06-01T02:00:00Z",
                "finished_at": "2026-06-01T03:00:00Z",
                "duration_seconds": 3600,
                "shares": ["Dokumente", "Fotos"],
                "bytes_transferred": 5368709120,
                "status": "success",
                "warnings": [],
            }
        ]
    }

    captured_params: list[str] = []

    def handler(req: httpx.Request) -> httpx.Response:
        if "/api/v1/backups/recent" in str(req.url):
            captured_params.append(str(req.url))
            return httpx.Response(200, json=mock_payload)
        return httpx.Response(404)

    _patch_qnapbackup(monkeypatch, handler)
    resp = client.get("/api/v1/qnapbackup/backups/recent")
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert len(data["items"]) == 1
    # Default-Limit 20 muss im Request erscheinen
    assert "limit=20" in captured_params[0]


def test_backups_recent_custom_limit(client, monkeypatch):
    """GET /api/v1/qnapbackup/backups/recent?limit=5 reicht limit durch."""
    captured_params: list[str] = []

    def handler(req: httpx.Request) -> httpx.Response:
        if "/api/v1/backups/recent" in str(req.url):
            captured_params.append(str(req.url))
            return httpx.Response(200, json={"items": []})
        return httpx.Response(404)

    _patch_qnapbackup(monkeypatch, handler)
    resp = client.get("/api/v1/qnapbackup/backups/recent?limit=5")
    assert resp.status_code == 200
    assert "limit=5" in captured_params[0]


def test_backups_recent_limit_clamping_min(client, monkeypatch):
    """limit=0 wird von FastAPI als Validierungsfehler (422) abgewiesen."""
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"items": []})

    _patch_qnapbackup(monkeypatch, handler)
    resp = client.get("/api/v1/qnapbackup/backups/recent?limit=0")
    assert resp.status_code == 422


def test_backups_recent_limit_clamping_max(client, monkeypatch):
    """limit=101 wird von FastAPI als Validierungsfehler (422) abgewiesen."""
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"items": []})

    _patch_qnapbackup(monkeypatch, handler)
    resp = client.get("/api/v1/qnapbackup/backups/recent?limit=101")
    assert resp.status_code == 422


def test_backups_recent_connect_error_returns_502(client, monkeypatch):
    """GET /api/v1/qnapbackup/backups/recent liefert 502 bei ConnectError."""
    def handler(req: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused")

    _patch_qnapbackup(monkeypatch, handler)
    resp = client.get("/api/v1/qnapbackup/backups/recent")
    assert resp.status_code == 502


def test_backups_recent_timeout_returns_504(client, monkeypatch):
    """GET /api/v1/qnapbackup/backups/recent liefert 504 bei Timeout."""
    def handler(req: httpx.Request) -> httpx.Response:
        raise httpx.TimeoutException("timeout", request=req)

    _patch_qnapbackup(monkeypatch, handler)
    resp = client.get("/api/v1/qnapbackup/backups/recent")
    assert resp.status_code == 504
