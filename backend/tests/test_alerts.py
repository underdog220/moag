"""
Tests fuer das Alert-Center:
  - derive_alerts (Severity-Logik, Schwelle, Sortierung)
  - alert_key (Stabilitaet / Zustandsbindung)
  - AlertAckStore (ack / unack / acked_at / prune)
  - /api/v1/alerts + ack/unack-Endpoints (mit gemockten Adaptern)
"""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from moag.alerts import WARNING_SCORE_THRESHOLD, alert_key, derive_alerts
from moag.alert_ack_store import AlertAckStore
from moag.api import create_app
from moag.events import EventBus
from moag.hub_client import HubClient
from moag.job_store import JobStore
from moag.schemas import SystemStatus
from moag.settings_store import SettingsStore


def _st(system_id: str, ok: bool, score: int, summary: str = "s", error=None) -> SystemStatus:
    return SystemStatus(
        system_id=system_id, ok=ok, score=score, summary=summary,
        metrics={}, fetched_at=datetime.now(timezone.utc), error=error,
    )


# ── derive_alerts ────────────────────────────────────────────────────────────

def test_derive_alerts_healthy_system_no_alert():
    assert derive_alerts([_st("oberon", True, 90)]) == []


def test_derive_alerts_critical_for_not_ok():
    alerts = derive_alerts([_st("custos", False, 0, "down")])
    assert len(alerts) == 1
    assert alerts[0].severity == "critical"
    assert alerts[0].system_name == "Custos"
    assert alerts[0].group == "Compliance & Test"


def test_derive_alerts_warning_for_degraded():
    alerts = derive_alerts([_st("octoboss", True, WARNING_SCORE_THRESHOLD - 1)])
    assert len(alerts) == 1
    assert alerts[0].severity == "warning"


def test_derive_alerts_threshold_boundary_is_healthy():
    # genau an der Schwelle => gesund, kein Alert
    assert derive_alerts([_st("oberon", True, WARNING_SCORE_THRESHOLD)]) == []


def test_derive_alerts_sorts_critical_before_warning():
    alerts = derive_alerts([_st("octoboss", True, 20), _st("custos", False, 0)])
    assert [a.severity for a in alerts] == ["critical", "warning"]


def test_alert_key_stable_and_state_bound():
    k1 = alert_key("custos", "critical", "down")
    assert k1 == alert_key("custos", "critical", "down")          # stabil
    assert k1 != alert_key("custos", "warning", "down")           # severity-Wechsel
    assert k1 != alert_key("custos", "critical", "anderer fehler")  # summary-Wechsel


# ── AlertAckStore ────────────────────────────────────────────────────────────

def test_ack_store_ack_and_query(tmp_path: Path):
    store = AlertAckStore(tmp_path / "alerts.db")
    store.ack("k1", "custos", "critical", "down")
    acked = store.acked_at(["k1", "k2"])
    assert "k1" in acked and "k2" not in acked
    store.close()


def test_ack_store_unack(tmp_path: Path):
    store = AlertAckStore(tmp_path / "alerts.db")
    store.ack("k1", "custos", "critical", "down")
    assert store.unack("k1") is True
    assert store.unack("k1") is False           # idempotent
    assert store.acked_at(["k1"]) == {}
    store.close()


def test_ack_store_prune_removes_inactive(tmp_path: Path):
    store = AlertAckStore(tmp_path / "alerts.db")
    store.ack("k1", "custos", "critical", "down")
    store.ack("k2", "oberon", "warning", "lahm")
    removed = store.prune(["k1"])               # k2 nicht mehr aktiv
    assert removed == 1
    assert set(store.acked_at(["k1", "k2"]).keys()) == {"k1"}
    store.close()


# ── Endpoint-Integration ─────────────────────────────────────────────────────

@pytest.fixture
def alert_client(tmp_path: Path, monkeypatch):
    """Client mit gemockten Adaptern: custos down (critical), octoboss degradiert
    (warning), Rest gesund."""
    statuses = {
        "oberon":       _st("oberon", True, 90),
        "octoboss":     _st("octoboss", True, 30),   # < Schwelle => warning
        "ocrexpert":    _st("ocrexpert", True, 80),
        "nasdominator": _st("nasdominator", True, 75),
        "qnapbackup":   _st("qnapbackup", True, 60),
        "custos":       _st("custos", False, 0, "down"),  # critical
        "panopticor":   _st("panopticor", True, 55),
    }

    def _mk(sid: str):
        async def _gs(*_a, **_k):
            return statuses[sid]
        return _gs

    for sid in statuses:
        monkeypatch.setattr(f"moag.adapters.{sid}.get_status", _mk(sid))

    settings_store = SettingsStore(tmp_path / "settings.json")
    job_store = JobStore(tmp_path / "jobs.db")
    ack_store = AlertAckStore(tmp_path / "alerts.db")
    event_bus = EventBus()
    hub_client = HubClient(event_bus=event_bus, timeout=0.5, poll_interval=600.0)

    async def fake_poll_hub(hub):
        from moag.models import HubStatus
        return HubStatus(
            id=hub.id, name=hub.name, url=hub.url, reachable=True, latency_ms=1,
            nodes_total=0, nodes_connected=0, engines_count=0,
            is_default=(hub.id == settings_store.get().default_hub_id),
            last_check=datetime.now(timezone.utc),
        )
    monkeypatch.setattr(hub_client, "_poll_hub", fake_poll_hub)

    app = create_app(
        settings_store=settings_store,
        job_store=job_store,
        alert_ack_store=ack_store,
        event_bus=event_bus,
        hub_client=hub_client,
        enable_pipeline=False,
        upload_dir=tmp_path / "uploads",
    )
    with TestClient(app) as c:
        yield c


def test_get_alerts_lists_critical_and_warning(alert_client):
    r = alert_client.get("/api/v1/alerts")
    assert r.status_code == 200
    body = r.json()
    assert body["critical_count"] == 1
    assert body["warning_count"] == 1
    assert body["unacknowledged_count"] == 2
    sids = {a["system_id"]: a for a in body["alerts"]}
    assert sids["custos"]["severity"] == "critical"
    assert sids["octoboss"]["severity"] == "warning"
    # critical steht vor warning
    assert body["alerts"][0]["severity"] == "critical"


def test_ack_alert_marks_acknowledged(alert_client):
    alerts = alert_client.get("/api/v1/alerts").json()["alerts"]
    key = next(a["key"] for a in alerts if a["system_id"] == "custos")

    r = alert_client.post(f"/api/v1/alerts/{key}/ack")
    assert r.status_code == 200
    assert r.json()["acknowledged"] is True

    body = alert_client.get("/api/v1/alerts").json()
    custos = next(a for a in body["alerts"] if a["system_id"] == "custos")
    assert custos["acknowledged"] is True
    assert custos["acknowledged_at"] is not None
    assert body["acknowledged_count"] == 1
    assert body["unacknowledged_count"] == 1   # nur noch octoboss offen


def test_ack_unknown_key_returns_404(alert_client):
    r = alert_client.post("/api/v1/alerts/deadbeefdeadbeef/ack")
    assert r.status_code == 404


def test_unack_restores_open_state(alert_client):
    alerts = alert_client.get("/api/v1/alerts").json()["alerts"]
    key = next(a["key"] for a in alerts if a["system_id"] == "custos")
    alert_client.post(f"/api/v1/alerts/{key}/ack")

    r = alert_client.post(f"/api/v1/alerts/{key}/unack")
    assert r.status_code == 200
    assert r.json()["was_acked"] is True

    body = alert_client.get("/api/v1/alerts").json()
    custos = next(a for a in body["alerts"] if a["system_id"] == "custos")
    assert custos["acknowledged"] is False
    assert body["acknowledged_count"] == 0
