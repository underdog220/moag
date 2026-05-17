"""
Tests fuer /api/v1/octoboss Proxy-Routen.

Alle Tests nutzen httpx.MockTransport + TestClient der FastAPI-App.
Der OctoBoss-Hub wird nicht wirklich angesprochen.
"""
from __future__ import annotations

import json

import httpx
import pytest
from fastapi.testclient import TestClient

from moag.api import create_app
from moag.settings_store import SettingsStore
from moag.models import HubConfig


# ── Fixtures ──────────────────────────────────────────────────────────────────


def make_app_with_mock_hub(monkeypatch, hub_responses: dict[str, object]):
    """
    Erstellt TestClient der MOAG-App mit gemocktem OctoBoss-Hub.

    hub_responses: Mapping von URL-Pfad-Substring → JSON-Dict oder None (404).
    """
    store = SettingsStore.__new__(SettingsStore)
    from moag.models import Settings
    store._settings = Settings(
        hubs=[HubConfig(id="test-hub", name="TestHub", url="http://mock-hub:18765")],
        default_hub_id="test-hub",
        cluster_enabled=True,
        voting_engines=[],
        voting_strategy="consensus",
        fallback_to_local=False,
        api_token=None,
        pipeline_log_enabled=False,
        doctype_text_gewicht=0.5,
        doctype_layout_gewicht=0.5,
    )
    store._path = None  # type: ignore[assignment]
    store._listeners = []
    import threading
    store._lock = threading.Lock()

    def handler(req: httpx.Request) -> httpx.Response:
        url_str = str(req.url)
        for path_fragment, response_data in hub_responses.items():
            if path_fragment in url_str:
                if response_data is None:
                    return httpx.Response(404, json={"detail": "not found"})
                return httpx.Response(200, json=response_data)
        return httpx.Response(404, json={"detail": "not found"})

    real_async_client = httpx.AsyncClient

    monkeypatch.setattr(
        httpx, "AsyncClient",
        lambda **kw: real_async_client(
            transport=httpx.MockTransport(handler),
            **{k: v for k, v in kw.items() if k != "transport"},
        ),
    )

    app = create_app(settings_store=store, enable_pipeline=False)
    return TestClient(app, raise_server_exceptions=True)


# ── Tests ─────────────────────────────────────────────────────────────────────


def test_nodes_proxied(monkeypatch):
    """GET /api/v1/octoboss/nodes leitet an /seti/nodes weiter."""
    mock_nodes = [
        {"node_id": "n1", "hostname": "alpha", "connected": True},
        {"node_id": "n2", "hostname": "beta", "connected": False},
    ]
    client = make_app_with_mock_hub(monkeypatch, {"/seti/nodes": mock_nodes})
    resp = client.get("/api/v1/octoboss/nodes")
    assert resp.status_code == 200
    data = resp.json()
    # Hub kann Liste oder Dict zurueckliefern — wir geben durch was kommt
    assert isinstance(data, (list, dict))


def test_node_detail_proxied(monkeypatch):
    """GET /api/v1/octoboss/nodes/{node_id} leitet an /seti/nodes/{node_id} weiter."""
    mock_detail = {"node_id": "n1", "hostname": "alpha", "connected": True}
    client = make_app_with_mock_hub(monkeypatch, {"/seti/nodes/n1": mock_detail})
    resp = client.get("/api/v1/octoboss/nodes/n1")
    assert resp.status_code == 200
    assert resp.json()["node_id"] == "n1"


def test_overview_proxied(monkeypatch):
    """GET /api/v1/octoboss/overview leitet an /seti/overview weiter."""
    mock_overview = {"nodes_total": 3, "nodes_connected": 2, "engines": ["tesseract"]}
    client = make_app_with_mock_hub(monkeypatch, {"/seti/overview": mock_overview})
    resp = client.get("/api/v1/octoboss/overview")
    assert resp.status_code == 200
    assert resp.json()["nodes_total"] == 3


def test_jobs_proxied(monkeypatch):
    """GET /api/v1/octoboss/jobs leitet an /jobs weiter (mit limit-Parameter)."""
    mock_jobs = {"jobs": [], "total": 0}
    client = make_app_with_mock_hub(monkeypatch, {"/jobs": mock_jobs})
    resp = client.get("/api/v1/octoboss/jobs?limit=10")
    assert resp.status_code == 200
    assert "jobs" in resp.json()


def test_jobs_state_filter(monkeypatch):
    """GET /api/v1/octoboss/jobs?state=running wird mit state-Parameter weitergeleitet."""
    mock_jobs = {"jobs": [{"id": "j1", "state": "running"}], "total": 1}
    client = make_app_with_mock_hub(monkeypatch, {"/jobs": mock_jobs})
    resp = client.get("/api/v1/octoboss/jobs?state=running")
    assert resp.status_code == 200


def test_assets_proxied(monkeypatch):
    """GET /api/v1/octoboss/assets leitet an /api/v1/assets weiter."""
    mock_assets = {"assets": [{"name": "llama3.2:3b", "type": "model"}]}
    client = make_app_with_mock_hub(monkeypatch, {"/api/v1/assets": mock_assets})
    resp = client.get("/api/v1/octoboss/assets")
    assert resp.status_code == 200
    assert "assets" in resp.json()


def test_cluster_status_proxied(monkeypatch):
    """GET /api/v1/octoboss/cluster/status leitet an /admin/cluster/status weiter."""
    mock_status = {"mode": "PRIMARY", "epoch": 7, "instance_id": "abc"}
    client = make_app_with_mock_hub(monkeypatch, {"/admin/cluster/status": mock_status})
    resp = client.get("/api/v1/octoboss/cluster/status")
    assert resp.status_code == 200
    assert resp.json()["mode"] == "PRIMARY"


def test_cluster_peers_proxied(monkeypatch):
    """GET /api/v1/octoboss/cluster/peers leitet an /api/v1/mesh/peers weiter."""
    mock_peers = {"peers": [{"id": "p1", "address": "10.0.0.1"}]}
    client = make_app_with_mock_hub(monkeypatch, {"/api/v1/mesh/peers": mock_peers})
    resp = client.get("/api/v1/octoboss/cluster/peers")
    assert resp.status_code == 200
    assert "peers" in resp.json()


def test_ocr_status_proxied(monkeypatch):
    """GET /api/v1/octoboss/ocr/status leitet an /ocr/status weiter."""
    mock_ocr = {"status": "ready", "engines": ["tesseract"]}
    client = make_app_with_mock_hub(monkeypatch, {"/ocr/status": mock_ocr})
    resp = client.get("/api/v1/octoboss/ocr/status")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ready"


def test_llm_models_proxied(monkeypatch):
    """GET /api/v1/octoboss/llm/models leitet an /v1/models weiter."""
    mock_models = {
        "object": "list",
        "data": [{"id": "llama3.2:3b", "object": "model"}],
    }
    client = make_app_with_mock_hub(monkeypatch, {"/v1/models": mock_models})
    resp = client.get("/api/v1/octoboss/llm/models")
    assert resp.status_code == 200
    assert "data" in resp.json()


def test_hub_unreachable_returns_502(monkeypatch):
    """Wenn der Hub nicht erreichbar ist: HTTP 502."""
    def handler(req: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused")

    real_async_client = httpx.AsyncClient
    monkeypatch.setattr(
        httpx, "AsyncClient",
        lambda **kw: real_async_client(
            transport=httpx.MockTransport(handler),
            **{k: v for k, v in kw.items() if k != "transport"},
        ),
    )

    store = SettingsStore.__new__(SettingsStore)
    from moag.models import Settings
    store._settings = Settings(
        hubs=[HubConfig(id="test-hub", name="TestHub", url="http://mock-hub:18765")],
        default_hub_id="test-hub",
        cluster_enabled=True,
        voting_engines=[],
        voting_strategy="consensus",
        fallback_to_local=False,
        api_token=None,
        pipeline_log_enabled=False,
        doctype_text_gewicht=0.5,
        doctype_layout_gewicht=0.5,
    )
    store._path = None  # type: ignore[assignment]
    store._listeners = []
    import threading
    store._lock = threading.Lock()

    app = create_app(settings_store=store, enable_pipeline=False)
    client = TestClient(app, raise_server_exceptions=False)

    resp = client.get("/api/v1/octoboss/nodes")
    assert resp.status_code == 502
