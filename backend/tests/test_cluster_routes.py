"""
Tests fuer die Schwarm-Cluster-Status-Proxy-Routen.

Identisch zu OCRexpert-Version, aber mit moag.* Imports.
"""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from moag.api import create_app
from moag.events import EventBus
from moag.hub_client import HubClient
from moag.job_store import JobStore
from moag.models import HubStatus
from moag.settings_store import SettingsStore


# ── Test-Helpers ─────────────────────────────────────────────────────────────


class _FakeResponse:
    """Minimaler Stub fuer httpx.Response."""

    def __init__(
        self,
        status_code: int = 200,
        json_body: Any = None,
        text: str = "",
        content_type: str = "application/json",
    ) -> None:
        self.status_code = status_code
        self._json = json_body
        self.text = text
        self.headers = {"content-type": content_type}

    @property
    def is_success(self) -> bool:
        return 200 <= self.status_code < 300

    def json(self) -> Any:
        return self._json


class _FakeAsyncClient:
    """Drop-In-Replacement fuer httpx.AsyncClient."""

    def __init__(
        self,
        *,
        get_handler=None,
        post_handler=None,
        **_kwargs: Any,
    ) -> None:
        self._get_handler = get_handler
        self._post_handler = post_handler

    async def __aenter__(self) -> "_FakeAsyncClient":
        return self

    async def __aexit__(self, *exc_info: Any) -> None:
        return None

    async def get(self, url: str, headers: dict[str, str] | None = None) -> _FakeResponse:
        if self._get_handler is None:
            raise httpx.ConnectError("no get_handler in test")
        return self._get_handler(url, headers or {})

    async def post(
        self,
        url: str,
        headers: dict[str, str] | None = None,
        json: Any = None,
    ) -> _FakeResponse:
        if self._post_handler is None:
            raise httpx.ConnectError("no post_handler in test")
        return self._post_handler(url, headers or {}, json or {})


# Hub-0.9.3-Schema-Fixtures

HUB_093_STATUS_RESPONSE = {
    "self_info": {
        "instance_id": "ad1b56a5-282c-40df-aa92-1a0b08aedfc0",
        "mode": "primary",
        "epoch": 5,
        "operator_priority": 20,
        "node_count": 3,
        "compute_score": 320,
        "primary_id": "ad1b56a5-282c-40df-aa92-1a0b08aedfc0",
        "primary_address": "192.168.200.71:18765",
        "last_election": "2026-05-08T07:32:00Z",
    },
    "peers": [
        {
            "id": "nas-uuid-002",
            "address": "192.168.200.169",
            "port": 8765,
            "mode": "replica",
            "online": True,
            "last_beacon": "2026-05-08T12:01:00Z",
        },
        {
            "id": "vdr-uuid-001",
            "address": "192.168.200.71",
            "port": 18765,
            "mode": "primary",
            "online": True,
            "last_beacon": "2026-05-08T12:01:05Z",
        },
    ],
    "primary": {
        "id": "ad1b56a5-282c-40df-aa92-1a0b08aedfc0",
        "address": "192.168.200.71:18765",
    },
    "last_election": {
        "timestamp": "2026-05-08T07:32:00Z",
        "winner_id": "ad1b56a5-282c-40df-aa92-1a0b08aedfc0",
        "reason": "manuell via /admin/election-trigger",
    },
    "election_eligible": True,
    "cooldown_remaining_s": 0.0,
}


@pytest.fixture
def gui_factory(tmp_path: Path, monkeypatch):
    """Factory: liefert (TestClient, settings_store, monkeypatch-Hooks)."""
    settings_store = SettingsStore(tmp_path / "settings.json")
    job_store = JobStore(tmp_path / "jobs.db")
    event_bus = EventBus()
    hub_client = HubClient(event_bus=event_bus, timeout=0.5, poll_interval=600.0)

    async def fake_poll_hub(hub):
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

    state: dict[str, Any] = {"get": None, "post": None}

    def install(get_handler=None, post_handler=None) -> None:
        state["get"] = get_handler
        state["post"] = post_handler

    def fake_async_client(*args: Any, **kwargs: Any) -> _FakeAsyncClient:
        return _FakeAsyncClient(
            get_handler=state["get"],
            post_handler=state["post"],
            **kwargs,
        )

    monkeypatch.setattr(
        "moag.routes_cluster.httpx.AsyncClient", fake_async_client
    )

    with TestClient(app) as c:
        yield c, settings_store, install


# ── /api/cluster/status ──────────────────────────────────────────────────────


def test_status_mock_query_returns_stub_without_hub_call(gui_factory):
    client, _, install = gui_factory
    called: dict[str, int] = {"get": 0}

    def get_handler(url: str, headers: dict[str, str]) -> _FakeResponse:
        called["get"] += 1
        return _FakeResponse(json_body={})

    install(get_handler=get_handler)
    r = client.get("/api/cluster/status?mock=true")
    assert r.status_code == 200
    data = r.json()
    assert data["mode"] == "standalone"
    assert data["instance_id"].startswith("stub-")
    # Im Mock-Modus darf KEIN Hub-Call gemacht werden
    assert called["get"] == 0
    assert "election_eligible" in data
    assert "cooldown_remaining_s" in data


def test_status_proxies_to_hub_093_format(gui_factory):
    """Hub 0.9.3 liefert ClusterStatusResponse mit self_info-Wrapper."""
    client, settings_store, install = gui_factory
    # api_token in Settings setzen, damit auth-Header geprueft werden kann
    from moag.models import SettingsUpdate
    settings_store.update(SettingsUpdate(api_token="moag-test-token"))

    captured: dict[str, str] = {}

    def get_handler(url: str, headers: dict[str, str]) -> _FakeResponse:
        captured["url"] = url
        captured["auth"] = headers.get("Authorization", "")
        return _FakeResponse(json_body=HUB_093_STATUS_RESPONSE)

    install(get_handler=get_handler)
    r = client.get("/api/cluster/status")
    assert r.status_code == 200
    data = r.json()
    assert data["instance_id"] == "ad1b56a5-282c-40df-aa92-1a0b08aedfc0"
    assert data["mode"] == "primary"
    assert data["epoch"] == 5
    assert data["node_count"] == 3
    assert data["compute_score"] == 320
    assert data["operator_priority"] == 20
    assert data["priority"] == 20
    assert data["primary_id"] == "ad1b56a5-282c-40df-aa92-1a0b08aedfc0"
    assert data["primary_address"] == "192.168.200.71:18765"
    assert data["last_election"]["winner_id"] == "ad1b56a5-282c-40df-aa92-1a0b08aedfc0"
    assert data["election_eligible"] is True
    assert data["cooldown_remaining_s"] == 0.0
    assert data["raw_hub_response"]["self_info"]["instance_id"] == data["instance_id"]
    assert "/admin/cluster/status" in captured["url"]
    assert captured["auth"].startswith("Bearer ")


def test_status_falls_back_to_stub_on_hub_error(gui_factory):
    client, _, install = gui_factory

    def get_handler(url: str, headers: dict[str, str]) -> _FakeResponse:
        raise httpx.ConnectError("connection refused")

    install(get_handler=get_handler)
    r = client.get("/api/cluster/status")
    assert r.status_code == 200
    data = r.json()
    assert data["mode"] == "standalone"
    assert data["instance_id"].startswith("stub-")


def test_status_propagates_unknown_hub_fields_as_pass_through(gui_factory):
    client, _, install = gui_factory

    def get_handler(url: str, headers: dict[str, str]) -> _FakeResponse:
        return _FakeResponse(
            json_body={
                **HUB_093_STATUS_RESPONSE,
                "future_field_zeta": "neuartig",
                "swarm_v3_metric": 42,
            }
        )

    install(get_handler=get_handler)
    r = client.get("/api/cluster/status")
    assert r.status_code == 200
    data = r.json()
    assert data["instance_id"] == "ad1b56a5-282c-40df-aa92-1a0b08aedfc0"
    assert data["raw_hub_response"]["future_field_zeta"] == "neuartig"
    assert data["raw_hub_response"]["swarm_v3_metric"] == 42


# ── /api/cluster/peers ───────────────────────────────────────────────────────


def test_peers_mock_query(gui_factory):
    client, _, _ = gui_factory
    r = client.get("/api/cluster/peers?mock=true")
    assert r.status_code == 200
    data = r.json()
    assert "peers" in data
    assert isinstance(data["peers"], list)
    assert len(data["peers"]) >= 1


def test_peers_extracts_from_hub_093_cluster_status(gui_factory):
    client, _, install = gui_factory
    captured: dict[str, str] = {}

    def get_handler(url: str, headers: dict[str, str]) -> _FakeResponse:
        captured["url"] = url
        return _FakeResponse(json_body=HUB_093_STATUS_RESPONSE)

    install(get_handler=get_handler)
    r = client.get("/api/cluster/peers")
    assert r.status_code == 200
    data = r.json()
    assert len(data["peers"]) == 2
    ids = {p["instance_id"] for p in data["peers"]}
    assert ids == {"nas-uuid-002", "vdr-uuid-001"}
    modes = {p["mode"] for p in data["peers"]}
    assert {"primary", "replica"} <= modes
    nas = next(p for p in data["peers"] if p["instance_id"] == "nas-uuid-002")
    assert nas["url"] == "http://192.168.200.169:8765"
    assert nas["port"] == 8765
    assert nas["online"] is True
    assert "/admin/cluster/status" in captured["url"]
    assert "/mesh/peers" not in captured["url"]


def test_peers_empty_when_hub_has_no_peers(gui_factory):
    client, _, install = gui_factory

    def get_handler(url: str, headers: dict[str, str]) -> _FakeResponse:
        return _FakeResponse(
            json_body={
                **HUB_093_STATUS_RESPONSE,
                "peers": [],
            }
        )

    install(get_handler=get_handler)
    r = client.get("/api/cluster/peers")
    assert r.status_code == 200
    data = r.json()
    assert data["peers"] == []


# ── /api/cluster/election/trigger ───────────────────────────────────────────


def test_election_trigger_mock_returns_accepted(gui_factory):
    client, _, _ = gui_factory
    r = client.post(
        "/api/cluster/election/trigger?mock=true",
        json={"reason": "operator manual"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["accepted"] is True
    assert "Mock" in (data.get("message") or "")


def test_election_trigger_rejects_without_token(gui_factory):
    """Wenn weder lokaler api_token noch Bearer-Header da sind: 403."""
    client, settings_store, _ = gui_factory
    from moag.models import SettingsUpdate
    settings_store.update(SettingsUpdate(api_token=""))

    r = client.post("/api/cluster/election/trigger", json={})
    assert r.status_code == 403


def test_election_trigger_proxies_to_hub_093_format(gui_factory):
    client, settings_store, install = gui_factory
    # Token setzen, damit election-trigger nicht mit 403 abbricht
    from moag.models import SettingsUpdate
    settings_store.update(SettingsUpdate(api_token="moag-test-token"))

    captured: dict[str, Any] = {}

    def post_handler(
        url: str, headers: dict[str, str], json_body: dict
    ) -> _FakeResponse:
        captured["url"] = url
        captured["auth"] = headers.get("Authorization", "")
        captured["body"] = json_body
        return _FakeResponse(
            json_body={
                "winner": "ad1b56a5-282c-40df-aa92-1a0b08aedfc0",
                "i_am_winner": True,
                "epoch": 6,
                "peers_asked": 2,
                "peers_responded": 2,
                "reason": "manuell via /admin/election-trigger",
                "detail": "",
            }
        )

    install(post_handler=post_handler)
    r = client.post(
        "/api/cluster/election/trigger",
        json={"reason": "test trigger"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["accepted"] is True
    assert data["election_id"] == "ad1b56a5-282c-40df-aa92-1a0b08aedfc0@6"
    assert data["winner"] == "ad1b56a5-282c-40df-aa92-1a0b08aedfc0"
    assert data["i_am_winner"] is True
    assert data["epoch"] == 6
    assert data["peers_asked"] == 2
    assert data["peers_responded"] == 2
    assert "/admin/election-trigger" in captured["url"]
    assert captured["auth"].startswith("Bearer ")
    assert captured["body"]["reason"] == "test trigger"


def test_election_trigger_propagates_hub_error(gui_factory):
    client, settings_store, install = gui_factory
    from moag.models import SettingsUpdate
    settings_store.update(SettingsUpdate(api_token="moag-test-token"))

    def post_handler(
        url: str, headers: dict[str, str], json_body: dict
    ) -> _FakeResponse:
        return _FakeResponse(
            status_code=429, text="cooldown", content_type="text/plain"
        )

    install(post_handler=post_handler)
    r = client.post("/api/cluster/election/trigger", json={})
    assert r.status_code == 429


def test_election_trigger_timeout_returns_504(gui_factory):
    client, settings_store, install = gui_factory
    from moag.models import SettingsUpdate
    settings_store.update(SettingsUpdate(api_token="moag-test-token"))

    def post_handler(
        url: str, headers: dict[str, str], json_body: dict
    ) -> _FakeResponse:
        raise httpx.TimeoutException("timeout")

    install(post_handler=post_handler)
    r = client.post("/api/cluster/election/trigger", json={})
    assert r.status_code == 504
