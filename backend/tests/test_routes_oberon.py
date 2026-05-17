"""
Smoke-Tests fuer /api/v1/oberon/* Routes.

Jede Route wird einmal mit gemockter Oberon-Antwort geprueft:
  - Status 200
  - Payload-Struktur (stichprobenartig)
  - Stub-Fallback wenn kein Token konfiguriert
"""
from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import httpx
import pytest
from fastapi.testclient import TestClient

from moag.api import create_app
from moag.settings_store import SettingsStore


# ── Fixtures ─────────────────────────────────────────────────────────────────


@pytest.fixture
def app_no_token(tmp_path):
    """App ohne Oberon-Token — alle Routen liefern Stub-Antwort."""
    settings_path = tmp_path / "settings.json"
    store = SettingsStore(settings_path)
    # Kein oberon_token in Default-Settings -> Stub-Modus
    return create_app(settings_store=store, enable_pipeline=False)


@pytest.fixture
def app_with_token(tmp_path):
    """App mit Oberon-Token — Routen leiten an Oberon weiter."""
    settings_path = tmp_path / "settings.json"
    store = SettingsStore(settings_path)
    # Token setzen
    from moag.models import SettingsUpdate
    store.update(SettingsUpdate(oberon_token="test-token"))
    return create_app(settings_store=store, enable_pipeline=False)


# ── Helpers fuer Mocked-Responses ────────────────────────────────────────────


def _make_mock_cockpit_client(get_return):
    """Erstellt einen Mock-CockpitClient der _get() immer get_return zurueckliefert."""
    mock = MagicMock()
    mock.__enter__ = MagicMock(return_value=mock)
    mock.__exit__ = MagicMock(return_value=False)
    mock.get_providers = MagicMock(return_value=get_return)
    mock.get_calls = MagicMock(return_value=get_return)
    mock.get_cost = MagicMock(return_value=get_return)
    mock.get_audit = MagicMock(return_value=get_return)
    mock.get_smoke = MagicMock(return_value=get_return)
    return mock


# ── Stub-Modus (kein Token) ───────────────────────────────────────────────────


def test_providers_stub(app_no_token):
    """Ohne Token: /providers liefert Stub-Antwort."""
    with TestClient(app_no_token) as client:
        resp = client.get("/api/v1/oberon/providers")
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("stub") is True
    assert "message" in data


def test_calls_stub(app_no_token):
    """Ohne Token: /calls liefert Stub-Antwort."""
    with TestClient(app_no_token) as client:
        resp = client.get("/api/v1/oberon/calls")
    assert resp.status_code == 200
    assert resp.json().get("stub") is True


def test_cost_stub(app_no_token):
    """Ohne Token: /cost liefert Stub-Antwort."""
    with TestClient(app_no_token) as client:
        resp = client.get("/api/v1/oberon/cost")
    assert resp.status_code == 200
    assert resp.json().get("stub") is True


def test_audit_stub(app_no_token):
    """Ohne Token: /audit liefert Stub-Antwort."""
    with TestClient(app_no_token) as client:
        resp = client.get("/api/v1/oberon/audit")
    assert resp.status_code == 200
    assert resp.json().get("stub") is True


def test_smoke_stub(app_no_token):
    """Ohne Token: /smoke liefert Stub-Antwort."""
    with TestClient(app_no_token) as client:
        resp = client.get("/api/v1/oberon/smoke")
    assert resp.status_code == 200
    assert resp.json().get("stub") is True


def test_instances_stub(app_no_token):
    """Ohne Token: /instances liefert Stub-Antwort."""
    with TestClient(app_no_token) as client:
        resp = client.get("/api/v1/oberon/instances")
    assert resp.status_code == 200
    assert resp.json().get("stub") is True


def test_pii_tuning_stub(app_no_token):
    """Ohne Token: /pii-tuning liefert Stub-Antwort."""
    with TestClient(app_no_token) as client:
        resp = client.get("/api/v1/oberon/pii-tuning")
    assert resp.status_code == 200
    assert resp.json().get("stub") is True


def test_db_broker_stub(app_no_token):
    """Ohne Token: /db-broker/status liefert Stub-Antwort."""
    with TestClient(app_no_token) as client:
        resp = client.get("/api/v1/oberon/db-broker/status")
    assert resp.status_code == 200
    assert resp.json().get("stub") is True


def test_contract_stub(app_no_token):
    """Ohne Token: /contract/capabilities liefert Stub-Antwort."""
    with TestClient(app_no_token) as client:
        resp = client.get("/api/v1/oberon/contract/capabilities")
    assert resp.status_code == 200
    assert resp.json().get("stub") is True


def test_platform_status_stub(app_no_token):
    """Ohne Token: /platform/status liefert Stub-Antwort."""
    with TestClient(app_no_token) as client:
        resp = client.get("/api/v1/oberon/platform/status")
    assert resp.status_code == 200
    assert resp.json().get("stub") is True


# ── Mit Token: Upstream-Calls werden an Cockpit/Platform weitergeleitet ──────


def _providers_response_mock():
    """Erstellt ein Mock-ProvidersResponse."""
    from moag.clients.oberon_cockpit_schemas import ProviderEntry, ProvidersResponse
    from datetime import datetime, timezone
    return ProvidersResponse(
        providers=[
            ProviderEntry(
                id="anthropic",
                name="Anthropic",
                type="anthropic",
                status="healthy",
                is_default=True,
            )
        ]
    )


def test_providers_with_token(app_with_token):
    """Mit Token: /providers ruft CockpitClient auf und gibt Ergebnis zurueck."""
    mock_providers = _providers_response_mock()

    import moag.routes_oberon as _ro

    mock_client = MagicMock()
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    mock_client.get_providers = MagicMock(return_value=mock_providers)

    with patch.object(_ro, "_build_cockpit_client", return_value=mock_client):
        with TestClient(app_with_token) as client:
            resp = client.get("/api/v1/oberon/providers")

    assert resp.status_code == 200
    data = resp.json()
    assert "providers" in data
    assert len(data["providers"]) == 1
    assert data["providers"][0]["id"] == "anthropic"


def test_smoke_with_token(app_with_token):
    """Mit Token: /smoke ruft CockpitClient auf und gibt Smoke-Ergebnis zurueck."""
    from moag.clients.oberon_cockpit_schemas import SmokeCheck, SmokeSummary, SmokeResponse
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    mock_smoke = SmokeResponse(
        suites=[
            SmokeCheck(name="dsgvo-status", status="PASS", last_run=now, latency_ms=5, error=None),
        ],
        summary=SmokeSummary.model_validate({"pass": 1, "warn": 0, "fail": 0, "total": 1, "verdict": "PASS"}),
    )

    import moag.routes_oberon as _ro

    mock_client = MagicMock()
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    mock_client.get_smoke = MagicMock(return_value=mock_smoke)

    with patch.object(_ro, "_build_cockpit_client", return_value=mock_client):
        with TestClient(app_with_token) as client:
            resp = client.get("/api/v1/oberon/smoke")

    assert resp.status_code == 200
    data = resp.json()
    assert "suites" in data
    assert data["summary"]["verdict"] == "PASS"


def test_calls_since_invalid(app_with_token):
    """Ungueltige since-Zeit -> HTTP 400."""
    import moag.routes_oberon as _ro
    mock_client = MagicMock()
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)

    with patch.object(_ro, "_build_cockpit_client", return_value=mock_client):
        with TestClient(app_with_token) as client:
            resp = client.get("/api/v1/oberon/calls?since=kein-datum")
    assert resp.status_code == 400


def test_platform_instances_with_token(app_with_token):
    """Mit Token: /instances ruft OberonPlatformClient auf."""
    mock_instances = [{"id": "inst-1", "mode": "devloop", "context_size": 4096}]

    import moag.routes_oberon as _ro

    mock_client = MagicMock()
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    mock_client.get_instances = MagicMock(return_value=mock_instances)

    with patch.object(_ro, "_build_platform_client", return_value=mock_client):
        with TestClient(app_with_token) as client:
            resp = client.get("/api/v1/oberon/instances")

    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert data[0]["id"] == "inst-1"


def test_cockpit_unavailable_502(app_with_token):
    """Oberon nicht erreichbar -> HTTP 502."""
    from moag.clients.oberon_cockpit_client import CockpitUnavailable

    import moag.routes_oberon as _ro

    mock_client = MagicMock()
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    mock_client.get_providers = MagicMock(side_effect=CockpitUnavailable("Timeout"))

    with patch.object(_ro, "_build_cockpit_client", return_value=mock_client):
        with TestClient(app_with_token) as client:
            resp = client.get("/api/v1/oberon/providers")

    assert resp.status_code == 502
