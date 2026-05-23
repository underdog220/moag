"""Tests fuer Manifest-Admin-Routen (Default-Tausch, Pinning, Pretest)."""
from __future__ import annotations

import asyncio
import threading
from pathlib import Path
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from moag.api import create_app
from moag.manifest_admin import (
    DeleteOverrideBody,
    SetDefaultBody,
    SetOverrideBody,
    compute_default_impact,
    delete_core_override,
    get_admin_token,
    resolve_hub,
    set_core_default,
    set_core_override,
)
from moag.models import HubConfig, Settings
from moag.routes_manifest_admin import _get_pretest_store_for_tests
from moag.settings_store import SettingsStore


# ── Fixtures ──────────────────────────────────────────────────────────────────


def _make_store(token: str | None = "test-token") -> SettingsStore:
    store = SettingsStore.__new__(SettingsStore)
    store._settings = Settings(
        hubs=[
            HubConfig(id="vdr", name="VDR", url="http://mock-hub:18765"),
            HubConfig(id="nas", name="NAS-Legacy", url="http://mock-hub-nas:8765"),
        ],
        default_hub_id="vdr",
        cluster_enabled=True,
        voting_engines=[],
        voting_strategy="consensus",
        fallback_to_local=False,
        api_token=None,
        pipeline_log_enabled=False,
        doctype_text_gewicht=0.5,
        doctype_layout_gewicht=0.5,
        octoboss_admin_token=token,
    )
    store._path = None  # type: ignore[assignment]
    store._listeners = []
    store._lock = threading.Lock()
    return store


def _patch_async_client(monkeypatch: Any, post_responses: dict[str, Any], get_responses: dict[str, Any] | None = None) -> dict[str, list]:
    """Mock-AsyncClient mit getrennten Routes fuer GET und POST.

    Liefert ein recorder-dict {"posts": [...], "gets": [...]} zur Inspektion.
    """
    recorder: dict[str, list] = {"posts": [], "gets": []}

    class MockResp:
        def __init__(self, status: int, payload: Any) -> None:
            self.status_code = status
            self._payload = payload
            self.elapsed = __import__("datetime").timedelta(seconds=0.05)

        def json(self) -> Any:
            return self._payload

        @property
        def is_success(self) -> bool:
            return 200 <= self.status_code < 300

        @property
        def text(self) -> str:
            return str(self._payload)

    class MockAsyncClient:
        def __init__(self, *a: Any, **kw: Any) -> None:
            pass

        async def __aenter__(self) -> "MockAsyncClient":
            return self

        async def __aexit__(self, *a: Any) -> None:
            pass

        async def get(self, url: str, **kw: Any) -> "MockResp":
            recorder["gets"].append(url)
            for fragment, data in (get_responses or {}).items():
                if fragment in url:
                    if data is None:
                        return MockResp(404, {"detail": "not found"})
                    return MockResp(200, data)
            return MockResp(404, {"detail": "not found"})

        async def post(self, url: str, json: Any = None, headers: dict | None = None, **kw: Any) -> "MockResp":
            recorder["posts"].append({"url": url, "json": json, "headers": headers})
            for fragment, data in post_responses.items():
                if fragment in url:
                    if isinstance(data, tuple):
                        return MockResp(data[0], data[1])
                    return MockResp(200, data)
            return MockResp(404, {"detail": "not found"})

    monkeypatch.setattr(httpx, "AsyncClient", MockAsyncClient)
    return recorder


# ── Hub-Aufloesung + Token ────────────────────────────────────────────────────


def test_resolve_hub_default() -> None:
    store = _make_store()
    url, hid = resolve_hub(store, hub_id=None)
    assert hid == "vdr"
    assert url == "http://mock-hub:18765"


def test_resolve_hub_explicit() -> None:
    store = _make_store()
    url, hid = resolve_hub(store, hub_id="nas")
    assert hid == "nas"
    assert url == "http://mock-hub-nas:8765"


def test_resolve_hub_unbekannt_wirft() -> None:
    store = _make_store()
    with pytest.raises(ValueError, match="nicht in Settings"):
        resolve_hub(store, hub_id="unbekannter-hub")


def test_get_admin_token_leer_wirft() -> None:
    store = _make_store(token=None)
    with pytest.raises(RuntimeError, match="octoboss_admin_token"):
        get_admin_token(store)


# ── Proxy-Calls (asyncio direkt) ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_set_core_default_blockt_ohne_pretest(monkeypatch: Any) -> None:
    store = _make_store()
    status, data = await set_core_default(
        store,
        SetDefaultBody(version="0.3.9", pretest_run_id=None),
    )
    assert status == 412
    assert "pretest_run_id" in data["detail"]


@pytest.mark.asyncio
async def test_set_core_default_proxy_mit_token(monkeypatch: Any) -> None:
    store = _make_store(token="my-secret")
    recorder = _patch_async_client(monkeypatch, {
        "/api/v1/admin/seti/core/default": {"ok": True, "previous_default": "0.3.8", "new_default": "0.3.9"},
    })
    status, data = await set_core_default(
        store,
        SetDefaultBody(version="0.3.9", pretest_run_id="some-run-id"),
    )
    assert status == 200
    assert data["new_default"] == "0.3.9"
    # Bearer-Header wurde gesetzt
    last_post = recorder["posts"][-1]
    assert last_post["headers"]["Authorization"] == "Bearer my-secret"
    assert last_post["json"] == {"version": "0.3.9"}


@pytest.mark.asyncio
async def test_set_core_override_proxy(monkeypatch: Any) -> None:
    store = _make_store()
    recorder = _patch_async_client(monkeypatch, {
        "/api/v1/admin/seti/core/override": {"ok": True, "node_id": "n1", "version": "0.3.8"},
    })
    status, data = await set_core_override(
        store,
        SetOverrideBody(node_id="n1", version="0.3.8"),
    )
    assert status == 200
    assert recorder["posts"][-1]["json"] == {"node_id": "n1", "version": "0.3.8"}


@pytest.mark.asyncio
async def test_delete_core_override_sendet_null(monkeypatch: Any) -> None:
    """Override loeschen ⇒ Body version=null."""
    store = _make_store()
    recorder = _patch_async_client(monkeypatch, {
        "/api/v1/admin/seti/core/override": {"ok": True},
    })
    await delete_core_override(store, DeleteOverrideBody(node_id="n1"))
    assert recorder["posts"][-1]["json"] == {"node_id": "n1", "version": None}


# ── Impact-Berechnung ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_compute_default_impact(monkeypatch: Any) -> None:
    store = _make_store()
    _patch_async_client(monkeypatch, post_responses={}, get_responses={
        "/api/v1/seti/core/versions": {
            "versions": ["0.3.9"],
            "default": "0.3.8",
            "overrides": {"node-a": "0.3.7"},  # node-a ist gepinnt
        },
        "/seti/nodes": {
            "nodes": [
                {"node_id": "node-a", "connected": True},
                {"node_id": "node-b", "connected": True},
                {"node_id": "node-c", "connected": False},
            ],
        },
    })

    impact = await compute_default_impact(store, target_version="0.3.9", hub_id=None)
    assert impact.nodes_total == 3
    assert impact.nodes_pinned == 1
    assert impact.nodes_affected == 2
    assert impact.current_default == "0.3.8"
    assert impact.overrides == [{"node_id": "node-a", "version": "0.3.7"}]


# ── Route-Integration ─────────────────────────────────────────────────────────


def test_route_impact(monkeypatch: Any) -> None:
    store = _make_store()
    _patch_async_client(monkeypatch, post_responses={}, get_responses={
        "/api/v1/seti/core/versions": {
            "versions": ["0.3.9"],
            "default": "0.3.8",
            "overrides": {},
        },
        "/seti/nodes": {"nodes": [{"node_id": "n1"}, {"node_id": "n2"}]},
    })
    app = create_app(settings_store=store, enable_pipeline=False)
    client = TestClient(app)
    r = client.get("/api/v1/manifest/admin/core/default/impact?version=0.3.9")
    assert r.status_code == 200
    body = r.json()
    assert body["nodes_total"] == 2
    assert body["nodes_affected"] == 2
    assert body["nodes_pinned"] == 0


def test_route_default_block_ohne_pretest(monkeypatch: Any) -> None:
    """Default-Tausch ohne pretest_run_id → 412."""
    store = _make_store()
    app = create_app(settings_store=store, enable_pipeline=False)
    client = TestClient(app)
    r = client.post(
        "/api/v1/manifest/admin/core/default",
        json={"version": "0.3.9"},
    )
    assert r.status_code == 412
    assert "Pretest" in r.json()["detail"]


def test_route_default_block_bei_unbekannter_pretest_id(monkeypatch: Any) -> None:
    """Unbekannte pretest_run_id → 412 'nicht gefunden'."""
    store = _make_store()
    app = create_app(settings_store=store, enable_pipeline=False)
    client = TestClient(app)
    r = client.post(
        "/api/v1/manifest/admin/core/default",
        json={"version": "0.3.9", "pretest_run_id": "ghost-id"},
    )
    assert r.status_code == 412
    assert "nicht gefunden" in r.json()["detail"]


def test_route_default_block_bei_red_verdict(monkeypatch: Any) -> None:
    """Pretest mit RED-Verdict → 412 'nur bei GREEN'."""
    store = _make_store()
    pretest_store = _get_pretest_store_for_tests()
    pretest_store.add("red-id", {"verdict": "red"})

    app = create_app(settings_store=store, enable_pipeline=False)
    client = TestClient(app)
    r = client.post(
        "/api/v1/manifest/admin/core/default",
        json={"version": "0.3.9", "pretest_run_id": "red-id"},
    )
    assert r.status_code == 412
    assert "GREEN" in r.json()["detail"]


def test_route_default_apply_bei_green(monkeypatch: Any) -> None:
    """Pretest GREEN → Apply geht durch."""
    store = _make_store(token="real-token")
    pretest_store = _get_pretest_store_for_tests()
    pretest_store.add("green-id", {"verdict": "green"})

    _patch_async_client(monkeypatch, post_responses={
        "/api/v1/admin/seti/core/default": {"ok": True, "new_default": "0.3.9"},
    })
    app = create_app(settings_store=store, enable_pipeline=False)
    client = TestClient(app)
    r = client.post(
        "/api/v1/manifest/admin/core/default",
        json={"version": "0.3.9", "pretest_run_id": "green-id"},
    )
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_route_override_setzen_und_loeschen(monkeypatch: Any) -> None:
    store = _make_store(token="tok")
    _patch_async_client(monkeypatch, post_responses={
        "/api/v1/admin/seti/core/override": {"ok": True},
    })
    app = create_app(settings_store=store, enable_pipeline=False)
    client = TestClient(app)

    r1 = client.post(
        "/api/v1/manifest/admin/core/override",
        json={"node_id": "n1", "version": "0.3.7"},
    )
    assert r1.status_code == 200

    r2 = client.post(
        "/api/v1/manifest/admin/core/override/delete",
        json={"node_id": "n1"},
    )
    assert r2.status_code == 200


# ── Pretest-Lifecycle ─────────────────────────────────────────────────────────


def test_route_pretest_start_und_callback(monkeypatch: Any, tmp_path: Path) -> None:
    """POST /pretest → Spec-File angelegt + pending; Callback aendert auf green."""
    # Spec-File-Pfad umleiten, um C:\code\Panopticor\requests\open nicht zu beruehren
    monkeypatch.setattr(
        "moag.manifest_admin._PANOPTICOR_OPEN_DIR",
        tmp_path,
    )
    store = _make_store()
    _patch_async_client(monkeypatch, post_responses={}, get_responses={
        "/api/v1/seti/core/versions": {
            "versions": ["0.3.9"],
            "default": "0.3.8",
            "overrides": {},
        },
        "/seti/nodes": {"nodes": [{"node_id": "n1"}]},
    })

    app = create_app(settings_store=store, enable_pipeline=False)
    client = TestClient(app)

    # 1) Pretest starten
    r = client.post(
        "/api/v1/manifest/admin/pretest",
        json={"target_version": "0.3.9", "target_kind": "core"},
    )
    assert r.status_code == 200
    body = r.json()
    spec_id = body["spec_id"]
    assert body["verdict"] == "pending"
    assert "spec_path" in body
    assert Path(body["spec_path"]).exists()
    assert "0.3.9" in Path(body["spec_path"]).read_text(encoding="utf-8")

    # 2) Status vor Callback
    r = client.get(f"/api/v1/manifest/admin/pretest/{spec_id}")
    assert r.status_code == 200
    assert r.json()["verdict"] == "pending"

    # 3) Callback liefert GREEN
    r = client.post(
        "/api/v1/manifest/admin/pretest-callback",
        json={"spec_id": spec_id, "verdict": "green"},
    )
    assert r.status_code == 200

    # 4) Status nach Callback
    r = client.get(f"/api/v1/manifest/admin/pretest/{spec_id}")
    assert r.json()["verdict"] == "green"


def test_route_pretest_callback_unbekannt(monkeypatch: Any) -> None:
    store = _make_store()
    app = create_app(settings_store=store, enable_pipeline=False)
    client = TestClient(app)
    r = client.post(
        "/api/v1/manifest/admin/pretest-callback",
        json={"spec_id": "ghost", "verdict": "green"},
    )
    assert r.status_code == 404
