"""
Smoke-Tests fuer die FastAPI-Endpoints.

Pipeline-Hooks werden hier NICHT installiert (enable_pipeline=False),
weil MOAG noch keinen echten Pipeline-Adapter hat (TODO Phase 1.5).
"""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from moag.api import create_app
from moag.events import EventBus
from moag.hub_client import HubClient
from moag.job_store import JobStore
from moag.settings_store import SettingsStore


@pytest.fixture
def client(tmp_path: Path, monkeypatch):
    settings_store = SettingsStore(tmp_path / "settings.json")
    job_store = JobStore(tmp_path / "jobs.db")
    event_bus = EventBus()
    hub_client = HubClient(event_bus=event_bus, timeout=0.5, poll_interval=600.0)

    # ENV-Cleanup
    for _env_key in ("MOAG_DOCTYPE_TEXT_GEWICHT", "MOAG_DOCTYPE_LAYOUT_GEWICHT"):
        monkeypatch.delenv(_env_key, raising=False)

    # HubClient soll im Test KEINE realen Hubs anrufen
    async def fake_poll_hub(hub):
        from moag.models import HubStatus
        return HubStatus(
            id=hub.id, name=hub.name, url=hub.url,
            reachable=True, latency_ms=1,
            nodes_total=0, nodes_connected=0, engines_count=0,
            is_default=(hub.id == settings_store.get().default_hub_id),
            last_check=datetime.now(timezone.utc),
        )
    monkeypatch.setattr(hub_client, "_poll_hub", fake_poll_hub)

    app = create_app(
        settings_store=settings_store,
        job_store=job_store,
        event_bus=event_bus,
        hub_client=hub_client,
        enable_pipeline=False,
        upload_dir=tmp_path / "uploads",
    )
    with TestClient(app) as c:
        yield c


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"
    assert "version" in data
    assert "build" in data
    assert data["pipeline_ready"] is False  # weil enable_pipeline=False


def test_list_hubs(client):
    r = client.get("/api/cluster/hubs")
    assert r.status_code == 200
    data = r.json()
    assert "hubs" in data
    assert len(data["hubs"]) >= 1


def test_get_hub_unknown_404(client):
    r = client.get("/api/cluster/hubs/does-not-exist")
    assert r.status_code == 404


def test_set_default_hub(client):
    # Ersten Hub-ID aus den Defaults holen
    r0 = client.get("/api/cluster/hubs")
    hubs = r0.json()["hubs"]
    assert len(hubs) >= 1
    first_id = hubs[0]["id"]

    r = client.post(f"/api/cluster/hubs/{first_id}/default")
    assert r.status_code == 200
    settings = r.json()
    assert settings["default_hub_id"] == first_id


def test_set_default_hub_invalid_returns_404(client):
    r = client.post("/api/cluster/hubs/no-such-hub/default")
    assert r.status_code == 404


def test_list_nodes_empty(client):
    r = client.get("/api/cluster/nodes")
    assert r.status_code == 200
    assert r.json() == {"nodes": []}


def test_get_node_404(client):
    r = client.get("/api/cluster/nodes/abc")
    assert r.status_code == 404


def test_engine_matrix_empty(client):
    r = client.get("/api/cluster/engines")
    assert r.status_code == 200
    data = r.json()
    assert data == {"engines": [], "nodes": [], "available": []}


def test_edge_log(client):
    r = client.get("/api/cluster/edge-log")
    assert r.status_code == 200
    data = r.json()
    assert "events" in data
    # Beim Start gibt es einen edge-log-Eintrag "MOAG gestartet"
    assert any("gestartet" in e.get("message", "") for e in data["events"])


def test_settings_endpoints(client):
    r = client.get("/api/settings")
    assert r.status_code == 200
    s = r.json()
    assert "hubs" in s
    assert "default_hub_id" in s
    assert "settings_path" in s

    # Update
    r2 = client.post("/api/settings", json={"voting_strategy": "best"})
    assert r2.status_code == 200
    assert r2.json()["voting_strategy"] == "best"


def test_settings_hubs_replace(client):
    new_hubs = [
        {"id": "x", "name": "X", "url": "http://x"},
        {"id": "y", "name": "Y", "url": "http://y"},
    ]
    r = client.post("/api/settings/hubs", json=new_hubs)
    assert r.status_code == 200
    hubs = r.json()["hubs"]
    assert len(hubs) == 2
    assert {h["id"] for h in hubs} == {"x", "y"}


def test_upload_blocked_when_pipeline_disabled(client, tmp_path: Path):
    """enable_pipeline=False → POST /api/jobs/upload muss 403 zurueckgeben."""
    fake_pdf = tmp_path / "fake.pdf"
    fake_pdf.write_bytes(b"%PDF-1.4\n%%EOF\n")
    with fake_pdf.open("rb") as fh:
        r = client.post(
            "/api/jobs/upload",
            files=[("files", ("fake.pdf", fh, "application/pdf"))],
        )
    assert r.status_code == 403


def test_jobs_list_empty(client):
    r = client.get("/api/jobs")
    assert r.status_code == 200
    data = r.json()
    assert data["jobs"] == []
    assert data["total"] == 0


def test_get_job_404(client):
    r = client.get("/api/jobs/does-not-exist")
    assert r.status_code == 404


def test_job_text_with_no_data(client):
    """Wir legen einen Job direkt an und fragen den Text."""
    js: JobStore = client.app.state.job_store
    js.create("moag-textt", "x.pdf", page_total=1)
    r = client.get("/api/jobs/moag-textt/text")
    assert r.status_code == 200
    assert "noch kein OCR-Text" in r.text


def test_job_pdf_404_when_file_missing(client):
    js: JobStore = client.app.state.job_store
    js.create("moag-no-file", "x.pdf", file_path="/non/existent.pdf")
    r = client.get("/api/jobs/moag-no-file/pdf")
    assert r.status_code == 404


def test_retry_blocked_when_pipeline_disabled(client):
    js: JobStore = client.app.state.job_store
    js.create("moag-retry", "x.pdf")
    r = client.post("/api/jobs/moag-retry/retry")
    assert r.status_code == 403


def test_ab_compare_phase1_stub(client):
    js: JobStore = client.app.state.job_store
    js.create("moag-ab", "x.pdf")
    r = client.get("/api/jobs/moag-ab/ab-compare")
    assert r.status_code == 200
    assert r.json()["available"] is False


def test_charts_throughput(client):
    r = client.get("/api/charts/throughput?range=24h")
    assert r.status_code == 200
    assert "datapoints" in r.json()


def test_charts_doctype_distribution(client):
    js: JobStore = client.app.state.job_store
    js.create("moag-d1", "a.pdf")
    js.mark_done("moag-d1", doctype="Rechnung")
    js.create("moag-d2", "b.pdf")
    js.mark_done("moag-d2", doctype="Rechnung")
    js.create("moag-d3", "c.pdf")
    js.mark_done("moag-d3", doctype="Mietvertrag")
    r = client.get("/api/charts/doctype-distribution")
    assert r.status_code == 200
    data = r.json()
    cur = data["current"]
    assert any(d["doctype"] == "Rechnung" and d["count"] == 2 for d in cur)


def test_charts_failure_rate(client):
    js: JobStore = client.app.state.job_store
    js.create("moag-ok", "a.pdf")
    js.mark_done("moag-ok", doctype="X")
    js.create("moag-bad", "b.pdf")
    js.mark_failed("moag-bad", "boom")
    r = client.get("/api/charts/failure-rate")
    assert r.status_code == 200
    data = r.json()
    assert any(t["type"].startswith("boom") for t in data["top_errors"])


def test_websocket_receives_events(client):
    """WebSocket-Subscriber muss Events empfangen koennen."""
    bus: EventBus = client.app.state.event_bus
    with client.websocket_connect("/ws/events") as ws:
        bus.publish("settings_changed", default_hub_id="vdr")
        found = False
        for _ in range(5):
            ev = ws.receive_json()
            if ev.get("type") == "settings_changed":
                found = True
                break
        assert found


def test_websocket_settings_change_pushed(client):
    """POST /api/settings -> settings_changed WS-Event."""
    with client.websocket_connect("/ws/events") as ws:
        client.post("/api/settings", json={"voting_strategy": "majority"})
        found = False
        for _ in range(10):
            ev = ws.receive_json()
            if ev.get("type") == "settings_changed":
                found = True
                break
        assert found, "settings_changed wurde nicht gepusht"


def test_upload_pipeline_enabled_creates_job(tmp_path: Path, monkeypatch):
    """Mit enable_pipeline=True wird der Background-Task gestartet — wir patchen ihn weg."""
    settings_store = SettingsStore(tmp_path / "s.json")
    job_store = JobStore(tmp_path / "j.db")
    event_bus = EventBus()
    hub_client = HubClient(event_bus=event_bus, timeout=0.5, poll_interval=600.0)

    async def fake_poll_hub(hub):
        from moag.models import HubStatus
        return HubStatus(
            id=hub.id, name=hub.name, url=hub.url,
            reachable=False, latency_ms=None, nodes_total=0,
            nodes_connected=0, engines_count=0, is_default=False,
            last_check=datetime.now(timezone.utc),
        )
    monkeypatch.setattr(hub_client, "_poll_hub", fake_poll_hub)

    # Pipeline-Wrapper patchen, damit kein echter HTTP-Adapter-Aufruf kommt
    from moag import api as api_mod
    monkeypatch.setattr(api_mod, "_run_pipeline_job", lambda *a, **kw: None)

    app = create_app(
        settings_store=settings_store, job_store=job_store,
        event_bus=event_bus, hub_client=hub_client,
        enable_pipeline=True, upload_dir=tmp_path / "u",
    )
    with TestClient(app) as c:
        fake = tmp_path / "x.pdf"
        fake.write_bytes(b"%PDF-1.4\n%%EOF\n")
        with fake.open("rb") as fh:
            r = c.post(
                "/api/jobs/upload",
                files=[("files", ("x.pdf", fh, "application/pdf"))],
            )
        assert r.status_code == 200
        data = r.json()
        assert data["accepted"] == 1
        jid = data["job_ids"][0]
        r2 = c.get(f"/api/jobs/{jid}")
        assert r2.status_code == 200


def test_upload_rejects_unknown_extension(tmp_path: Path, monkeypatch):
    settings_store = SettingsStore(tmp_path / "s.json")
    job_store = JobStore(tmp_path / "j.db")
    event_bus = EventBus()
    hub_client = HubClient(event_bus=event_bus, timeout=0.5, poll_interval=600.0)

    async def fake_poll_hub(hub):
        from moag.models import HubStatus
        return HubStatus(
            id=hub.id, name=hub.name, url=hub.url,
            reachable=False, latency_ms=None, nodes_total=0,
            nodes_connected=0, engines_count=0, is_default=False,
            last_check=datetime.now(timezone.utc),
        )
    monkeypatch.setattr(hub_client, "_poll_hub", fake_poll_hub)

    from moag import api as api_mod
    monkeypatch.setattr(api_mod, "_run_pipeline_job", lambda *a, **kw: None)

    app = create_app(
        settings_store=settings_store, job_store=job_store,
        event_bus=event_bus, hub_client=hub_client,
        enable_pipeline=True, upload_dir=tmp_path / "u",
    )
    with TestClient(app) as c:
        fake = tmp_path / "evil.exe"
        fake.write_bytes(b"MZ")
        with fake.open("rb") as fh:
            r = c.post(
                "/api/jobs/upload",
                files=[("files", ("evil.exe", fh, "application/octet-stream"))],
            )
        assert r.status_code == 200
        data = r.json()
        assert data["accepted"] == 0
        assert len(data["rejected"]) == 1


def test_health_pipeline_ready_with_pipeline_enabled(tmp_path: Path, monkeypatch):
    settings_store = SettingsStore(tmp_path / "s.json")
    job_store = JobStore(tmp_path / "j.db")
    event_bus = EventBus()
    hub_client = HubClient(event_bus=event_bus, timeout=0.5, poll_interval=600.0)

    async def fake_poll_hub(hub):
        from moag.models import HubStatus
        return HubStatus(
            id=hub.id, name=hub.name, url=hub.url, reachable=False, latency_ms=None,
            nodes_total=0, nodes_connected=0, engines_count=0, is_default=False,
            last_check=datetime.now(timezone.utc),
        )
    monkeypatch.setattr(hub_client, "_poll_hub", fake_poll_hub)

    app = create_app(
        settings_store=settings_store, job_store=job_store,
        event_bus=event_bus, hub_client=hub_client,
        enable_pipeline=True, upload_dir=tmp_path / "u",
    )
    with TestClient(app) as c:
        r = c.get("/api/health")
        assert r.status_code == 200
        assert r.json()["pipeline_ready"] is True


def test_hub_test_proxy_success(client, monkeypatch):
    """Server-side-Hub-Reachability-Probe."""

    class _FakeResp:
        def __init__(self, code: int):
            self.status_code = code
            self.is_success = 200 <= code < 300

    class _FakeAsyncClient:
        def __init__(self, *a, **kw): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return None
        async def get(self, url, headers=None):
            assert url.endswith("/health")
            return _FakeResp(200)

    monkeypatch.setattr(httpx, "AsyncClient", _FakeAsyncClient)
    r = client.post("/api/cluster/hubs/test", json={"url": "http://1.2.3.4:8765"})
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["status_code"] == 200
    assert isinstance(body["latency_ms"], int)


def test_hub_test_proxy_timeout(client, monkeypatch):
    """Timeout-Pfad liefert ok=False mit klarer Fehlermeldung."""

    class _FakeAsyncClient:
        def __init__(self, *a, **kw): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return None
        async def get(self, url, headers=None):
            raise httpx.TimeoutException("simulated")

    monkeypatch.setattr(httpx, "AsyncClient", _FakeAsyncClient)
    r = client.post("/api/cluster/hubs/test", json={"url": "http://1.2.3.4:8765"})
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is False
    assert "Timeout" in (body["error"] or "")


def test_spa_fallback_serves_index_for_react_routes(tmp_path: Path, monkeypatch):
    """Deep-Links auf React-Router-Routen muessen index.html zurueckliefern."""
    static_dir = tmp_path / "static"
    static_dir.mkdir()
    (static_dir / "index.html").write_text("<html><body id='spa-shell'></body></html>", encoding="utf-8")
    (static_dir / "favicon.ico").write_bytes(b"\x00\x00\x01\x00")
    assets_dir = static_dir / "assets"
    assets_dir.mkdir()
    (assets_dir / "main.js").write_text("// js bundle", encoding="utf-8")

    settings_store = SettingsStore(tmp_path / "s.json")
    job_store = JobStore(tmp_path / "j.db")
    event_bus = EventBus()
    hub_client = HubClient(event_bus=event_bus, timeout=0.5, poll_interval=600.0)

    async def fake_poll_hub(hub):
        from moag.models import HubStatus
        return HubStatus(
            id=hub.id, name=hub.name, url=hub.url, reachable=False, latency_ms=None,
            nodes_total=0, nodes_connected=0, engines_count=0, is_default=False,
            last_check=datetime.now(timezone.utc),
        )
    monkeypatch.setattr(hub_client, "_poll_hub", fake_poll_hub)

    app = create_app(
        settings_store=settings_store, job_store=job_store,
        event_bus=event_bus, hub_client=hub_client,
        enable_pipeline=False, upload_dir=tmp_path / "u",
        static_dir=static_dir,
    )
    with TestClient(app) as c:
        # Root
        r = c.get("/")
        assert r.status_code == 200
        assert "spa-shell" in r.text
        # React-Router-Routen liefern dieselbe Shell
        for route in ("/dashboard", "/jobs", "/jobs/moag-abc-123", "/charts", "/settings"):
            r = c.get(route)
            assert r.status_code == 200, f"{route} -> {r.status_code}"
            assert "spa-shell" in r.text, f"{route} liefert nicht die SPA-Shell"
        # Direkte Datei-Pfade durchreichen
        r = c.get("/favicon.ico")
        assert r.status_code == 200
        # Assets via /assets-Mount
        r = c.get("/assets/main.js")
        assert r.status_code == 200
        assert "js bundle" in r.text
        # /api/* muss 404 bleiben
        r = c.get("/api/no-such-endpoint")
        assert r.status_code == 404
        assert "json" in r.headers.get("content-type", "")


def test_overview_endpoint(client):
    """/api/v1/overview liefert alle 7 System-Status-Objekte.

    SonOfSETI wurde 2026-05-17 als Top-Karte entfernt (Nodes werden ueber
    OctoBoss-Drilldown sichtbar). Der Adapter `adapters/sonofseti.py` bleibt.
    """
    r = client.get("/api/v1/overview")
    assert r.status_code == 200
    data = r.json()
    assert "systems" in data
    assert "fetched_at" in data
    systems = data["systems"]
    ids = {s["system_id"] for s in systems}
    expected = {"oberon", "octoboss", "ocrexpert",
                "nasdominator", "qnapbackup", "custos", "panopticor"}
    assert ids == expected
    assert "sonofseti" not in ids


def test_aggregator_health_endpoint(client):
    """/api/v1/aggregator/health liefert das Frontend-Schema fuer TopBar.tsx.

    Vertrag (siehe frontend/src/components/TopBar.tsx Z. 12-22):
      overall_score: int
      alert_count:   int
      groups:        Array von {name, score, systems[].{name, score, ok}}
      computed_at:   ISO-Timestamp
    """
    r = client.get("/api/v1/aggregator/health")
    assert r.status_code == 200
    data = r.json()
    # Top-Level-Felder
    assert "overall_score" in data and isinstance(data["overall_score"], int)
    assert "alert_count" in data and isinstance(data["alert_count"], int)
    assert "computed_at" in data
    assert 0 <= data["overall_score"] <= 100
    # groups als Array (nicht Dict — kritisch fuer Frontend .map())
    groups = data["groups"]
    assert isinstance(groups, list), "groups muss Array sein (Frontend .map())"
    assert len(groups) == 3
    group_names = [g["name"] for g in groups]
    assert "KI-Backbone" in group_names
    assert "Infrastruktur" in group_names
    assert "Compliance & Test" in group_names
    # Jede Group: name + score + systems mit name/score/ok
    for g in groups:
        assert "name" in g and "score" in g and "systems" in g
        assert isinstance(g["systems"], list)
        for s in g["systems"]:
            assert "name" in s and "score" in s and "ok" in s
            assert isinstance(s["ok"], bool)


def test_settings_doctype_gewichte_round_trip(client):
    """Save+Reload propagiert die neuen Doctype-Gewichts-Felder."""
    r = client.post("/api/settings", json={
        "doctype_text_gewicht": 0.6,
        "doctype_layout_gewicht": 0.4,
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["doctype_text_gewicht"] == 0.6
    assert body["doctype_layout_gewicht"] == 0.4
    r2 = client.get("/api/settings")
    assert r2.status_code == 200
    assert r2.json()["doctype_text_gewicht"] == 0.6
