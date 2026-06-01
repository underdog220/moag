"""
Tests fuer den OpenAPI-Browser-Router (routes_openapi.py).

Strategie:
  - Eigene Mini-FastAPI-App mit eingehaengtem Router (keine create_app-Overhead).
  - SettingsStore(tmp_path) fuer isolierte Settings.
  - httpx-Requests werden per monkeypatch gemockt.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from moag.routes_openapi import build_openapi_router
from moag.settings_store import SettingsStore


# ── Hilfs-Spec fuer Mock-Responses ────────────────────────────────────────────

FAKE_OPENAPI_SPEC = {
    "openapi": "3.1.0",
    "info": {"title": "FakeSystem", "version": "1.0.0"},
    "paths": {
        "/api/health": {
            "get": {
                "summary": "Health-Check",
                "tags": ["health"],
            }
        },
        "/api/v1/items": {
            "get": {
                "summary": "Item-Liste",
                "tags": ["items"],
            },
            "post": {
                "summary": "Item anlegen",
                "tags": ["items"],
            },
        },
    },
}


# ── Fixtures ───────────────────────────────────────────────────────────────────

@pytest.fixture
def settings_store(tmp_path: Path) -> SettingsStore:
    """Isolierter SettingsStore mit Default-Werten."""
    return SettingsStore(tmp_path / "settings.json")


@pytest.fixture
def app(settings_store: SettingsStore) -> FastAPI:
    """Mini-FastAPI-App mit eingehaengtem OpenAPI-Browser-Router."""
    fastapi_app = FastAPI(title="Test-MOAG", version="0.0.1")
    fastapi_app.include_router(build_openapi_router(settings_store))
    return fastapi_app


@pytest.fixture
def client(app: FastAPI) -> TestClient:
    """TestClient fuer die Mini-App."""
    with TestClient(app) as c:
        yield c


# ── Tests: /targets ────────────────────────────────────────────────────────────

def test_targets_liefert_liste(client: TestClient) -> None:
    """GET /api/v1/openapi/targets muss eine nicht-leere Liste liefern."""
    r = client.get("/api/v1/openapi/targets")
    assert r.status_code == 200
    targets = r.json()
    assert isinstance(targets, list)
    assert len(targets) > 0


def test_targets_enthaelt_bekannte_ids(client: TestClient) -> None:
    """Targets-Liste muss moag, oberon, octoboss, ocrexpert, nasdominator, custos, panopticor enthalten."""
    r = client.get("/api/v1/openapi/targets")
    ids = {t["id"] for t in r.json()}
    expected = {"moag", "oberon", "octoboss", "ocrexpert", "nasdominator", "custos", "panopticor"}
    assert expected == ids


def test_targets_schema(client: TestClient) -> None:
    """Jeder Target-Eintrag hat id, name, url."""
    r = client.get("/api/v1/openapi/targets")
    for t in r.json():
        assert "id" in t
        assert "name" in t
        assert "url" in t


# ── Tests: /moag (MOAG-eigene Spec) ───────────────────────────────────────────

def test_moag_target_reachable(client: TestClient) -> None:
    """GET /api/v1/openapi/moag muss reachable=true liefern."""
    r = client.get("/api/v1/openapi/moag")
    assert r.status_code == 200
    data = r.json()
    assert data["reachable"] is True
    assert data["target"] == "moag"


def test_moag_target_hat_endpoints(client: TestClient) -> None:
    """MOAG-eigene Spec enthaelt mind. einen Endpoint (den /openapi/targets-Endpoint selbst)."""
    r = client.get("/api/v1/openapi/moag")
    data = r.json()
    assert isinstance(data["endpoints"], list)
    assert data["endpoint_count"] >= 1
    assert len(data["endpoints"]) == data["endpoint_count"]


def test_moag_endpoint_schema(client: TestClient) -> None:
    """Jeder Endpoint-Eintrag hat path, method, summary, tags."""
    r = client.get("/api/v1/openapi/moag")
    for ep in r.json()["endpoints"]:
        assert "path" in ep
        assert "method" in ep
        assert "summary" in ep
        assert "tags" in ep


# ── Tests: Sub-System erreichbar (gemockt) ────────────────────────────────────

def test_subsystem_reachable_mit_mock(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Ein erreichbares Sub-System liefert reachable=true + geparste Endpoints."""
    # httpx.AsyncClient.get mocken — gibt FAKE_OPENAPI_SPEC zurueck
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.is_success = True
    mock_resp.json.return_value = FAKE_OPENAPI_SPEC

    async def fake_get(url: str, **kwargs: Any):
        return mock_resp

    mock_client_instance = MagicMock()
    mock_client_instance.get = fake_get
    mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
    mock_client_instance.__aexit__ = AsyncMock(return_value=False)

    import httpx
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: mock_client_instance)

    r = client.get("/api/v1/openapi/oberon")
    assert r.status_code == 200
    data = r.json()
    assert data["reachable"] is True
    assert data["target"] == "oberon"
    # FAKE_OPENAPI_SPEC hat 3 Operationen (2x GET + 1x POST in /api/v1/items und /api/health)
    assert data["endpoint_count"] == 3
    assert len(data["endpoints"]) == 3
    methods = {ep["method"] for ep in data["endpoints"]}
    assert "GET" in methods
    assert "POST" in methods


def test_subsystem_endpoints_pfade(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Geparste Endpoints enthalten die Pfade aus der Fake-Spec."""
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.is_success = True
    mock_resp.json.return_value = FAKE_OPENAPI_SPEC

    async def fake_get(url: str, **kwargs: Any):
        return mock_resp

    mock_client_instance = MagicMock()
    mock_client_instance.get = fake_get
    mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
    mock_client_instance.__aexit__ = AsyncMock(return_value=False)

    import httpx
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: mock_client_instance)

    r = client.get("/api/v1/openapi/ocrexpert")
    data = r.json()
    paths = {ep["path"] for ep in data["endpoints"]}
    assert "/api/health" in paths
    assert "/api/v1/items" in paths


# ── Tests: Sub-System nicht erreichbar ────────────────────────────────────────

def test_subsystem_timeout_liefert_reachable_false(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Timeout → HTTP 200 mit reachable=false, kein 500."""
    import httpx

    async def fake_get(url: str, **kwargs: Any):
        raise httpx.TimeoutException("Timeout", request=MagicMock())

    mock_client_instance = MagicMock()
    mock_client_instance.get = fake_get
    mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
    mock_client_instance.__aexit__ = AsyncMock(return_value=False)

    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: mock_client_instance)

    r = client.get("/api/v1/openapi/panopticor")
    assert r.status_code == 200
    data = r.json()
    assert data["reachable"] is False
    assert data["endpoints"] == []
    assert "Timeout" in data["error"]


def test_subsystem_http_fehler_liefert_reachable_false(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """HTTP 503 vom Sub-System → reachable=false mit Fehlerhinweis."""
    mock_resp = MagicMock()
    mock_resp.status_code = 503
    mock_resp.is_success = False

    async def fake_get(url: str, **kwargs: Any):
        return mock_resp

    mock_client_instance = MagicMock()
    mock_client_instance.get = fake_get
    mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
    mock_client_instance.__aexit__ = AsyncMock(return_value=False)

    import httpx
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: mock_client_instance)

    r = client.get("/api/v1/openapi/nasdominator")
    assert r.status_code == 200
    data = r.json()
    assert data["reachable"] is False
    assert "503" in data["error"]


def test_subsystem_401_liefert_reachable_false(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """HTTP 401 → reachable=false (Auth erforderlich, kein Crash)."""
    mock_resp = MagicMock()
    mock_resp.status_code = 401
    mock_resp.is_success = False

    async def fake_get(url: str, **kwargs: Any):
        return mock_resp

    mock_client_instance = MagicMock()
    mock_client_instance.get = fake_get
    mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
    mock_client_instance.__aexit__ = AsyncMock(return_value=False)

    import httpx
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: mock_client_instance)

    r = client.get("/api/v1/openapi/custos")
    assert r.status_code == 200
    data = r.json()
    assert data["reachable"] is False


def test_unbekanntes_target_liefert_reachable_false(client: TestClient) -> None:
    """Unbekanntes Target → HTTP 200 mit reachable=false (kein 404)."""
    r = client.get("/api/v1/openapi/nichtvorhanden")
    assert r.status_code == 200
    data = r.json()
    assert data["reachable"] is False
    assert data["target"] == "nichtvorhanden"


def test_endpoint_count_konsistent(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """endpoint_count muss mit len(endpoints) uebereinstimmen."""
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.is_success = True
    mock_resp.json.return_value = FAKE_OPENAPI_SPEC

    async def fake_get(url: str, **kwargs: Any):
        return mock_resp

    mock_client_instance = MagicMock()
    mock_client_instance.get = fake_get
    mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
    mock_client_instance.__aexit__ = AsyncMock(return_value=False)

    import httpx
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: mock_client_instance)

    r = client.get("/api/v1/openapi/octoboss")
    data = r.json()
    assert data["endpoint_count"] == len(data["endpoints"])
