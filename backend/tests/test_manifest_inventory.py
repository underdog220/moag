"""Tests fuer Manifest-Inventory-Aggregation.

Mock-Strategie: AsyncClient durch MockAsyncClient ersetzen, der URL-Fragmente
auf vorgegebene JSON-Responses mappt.
"""
from __future__ import annotations

import asyncio
import threading
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from moag.api import create_app
from moag.manifest_inventory import (
    _build_drift,
    _extract_module_list,
    gather_all_inventories,
    gather_hub_inventory,
)
from moag.models import HubConfig, Settings
from moag.settings_store import SettingsStore


# ── Fixtures (gleiches Muster wie test_manifest_health.py) ───────────────────


def _make_settings_store(hubs: list[HubConfig], default_id: str) -> SettingsStore:
    store = SettingsStore.__new__(SettingsStore)
    store._settings = Settings(
        hubs=hubs,
        default_hub_id=default_id,
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
    store._lock = threading.Lock()
    return store


def _patch_async_client(
    monkeypatch: Any,
    responses: dict[str, Any],
) -> None:
    """Patcht httpx.AsyncClient — Fragment-Match auf Response-Dict.

    None als Wert ⇒ HTTP 404.
    String als Wert ⇒ HTTP 500 mit Body.
    """

    def handler(req: httpx.Request) -> httpx.Response:
        url_str = str(req.url)
        for fragment, data in responses.items():
            if fragment in url_str:
                if data is None:
                    return httpx.Response(404, json={"detail": "not found"})
                if isinstance(data, str):
                    return httpx.Response(500, text=data)
                return httpx.Response(200, json=data)
        return httpx.Response(404, json={"detail": "not found"})

    class MockAsyncClient:
        def __init__(self, *a: Any, **kw: Any) -> None:
            pass

        async def __aenter__(self) -> "MockAsyncClient":
            return self

        async def __aexit__(self, *a: Any) -> None:
            pass

        async def get(self, url: str, **kw: Any) -> httpx.Response:
            req = httpx.Request("GET", url)
            return handler(req)

    monkeypatch.setattr(httpx, "AsyncClient", MockAsyncClient)


# ── Helfer-Tests ──────────────────────────────────────────────────────────────


def test_extract_module_list_aus_detail() -> None:
    """installed_modules_detail wird sauber zu (name, version, status) gemappt."""
    node = {
        "installed_modules_detail": [
            {"name": "ocr-worker", "version": "0.4.2", "status": "running"},
            {"name": "ollama-worker", "version": "0.3.1", "status": "stopped"},
        ]
    }
    mods = _extract_module_list(node)
    assert mods == [
        {"name": "ocr-worker", "version": "0.4.2", "status": "running"},
        {"name": "ollama-worker", "version": "0.3.1", "status": "stopped"},
    ]


def test_extract_module_list_fallback_auf_active_modules() -> None:
    """Wenn nur active_modules vorliegt, Versionen werden mit '?' belegt."""
    node = {"active_modules": ["ocr-worker", "hw-monitor"]}
    mods = _extract_module_list(node)
    assert mods == [
        {"name": "ocr-worker", "version": "?", "status": "active"},
        {"name": "hw-monitor", "version": "?", "status": "active"},
    ]


def test_extract_module_list_leer_bei_fehlendem_feld() -> None:
    assert _extract_module_list({}) == []


def test_build_drift_findet_versions_unterschied() -> None:
    """Zwei Nodes mit unterschiedlicher ocr-worker-Version → Drift-Eintrag."""
    by_node = [
        {
            "node_id": "node-a",
            "modules": [
                {"name": "ocr-worker", "version": "0.4.2"},
                {"name": "hw-monitor", "version": "0.2.0"},
            ],
        },
        {
            "node_id": "node-b",
            "modules": [
                {"name": "ocr-worker", "version": "0.4.1"},
                {"name": "hw-monitor", "version": "0.2.0"},
            ],
        },
    ]
    drift = _build_drift(by_node)
    assert len(drift) == 1
    assert drift[0]["module"] == "ocr-worker"
    assert drift[0]["version_count"] == 2
    assert drift[0]["versions"] == {
        "0.4.2": ["node-a"],
        "0.4.1": ["node-b"],
    }


def test_build_drift_ignoriert_einheitliche_module() -> None:
    """Wenn alle Nodes dieselbe Version haben, kein Drift-Eintrag."""
    by_node = [
        {"node_id": "a", "modules": [{"name": "ocr-worker", "version": "0.4.2"}]},
        {"node_id": "b", "modules": [{"name": "ocr-worker", "version": "0.4.2"}]},
    ]
    assert _build_drift(by_node) == []


# ── Hub-Inventar (vollstaendiger Pfad) ────────────────────────────────────────


@pytest.mark.asyncio
async def test_gather_hub_inventory_glueck_pfad(monkeypatch: Any) -> None:
    """Alle drei Datenquellen liefern saubere Antworten."""
    _patch_async_client(monkeypatch, {
        "/api/v1/seti/core/versions": {
            "versions": ["0.3.8-rc4", "0.3.9-rc5.10b"],
            "default": "0.3.9-rc5.10b",
            "overrides": {"11111111-1111-1111-1111-111111111111": "0.3.8-rc4"},
            "asset_inventory_versions": ["0.3.8-rc4", "0.3.9-rc5.10b"],
        },
        "/seti/distribute/info": {
            "bootstrapper_version": "0.3.9-rc5",
            "bootstrapper_sha256": "f" * 64,
            "bootstrapper_size_bytes": 679_000,
            "binaries": {
                "bootstrapper": {"available": True},
            },
        },
        "/seti/nodes": {
            "nodes": [
                {
                    "node_id": "node-a",
                    "hostname": "ryzen",
                    "connected": True,
                    "node_pool": "production",
                    "installed_modules_detail": [
                        {"name": "ocr-worker", "version": "0.4.2", "status": "running"},
                        {"name": "hw-monitor", "version": "0.2.0", "status": "running"},
                    ],
                },
                {
                    "node_id": "node-b",
                    "hostname": "intel",
                    "connected": True,
                    "node_pool": "production",
                    "installed_modules_detail": [
                        {"name": "ocr-worker", "version": "0.4.1", "status": "running"},
                        {"name": "hw-monitor", "version": "0.2.0", "status": "running"},
                    ],
                },
            ],
        },
    })

    inv = await gather_hub_inventory("http://mock-hub:18765")
    # Core
    assert inv["core"]["default"] == "0.3.9-rc5.10b"
    assert inv["core"]["supports_versions_api"] is True
    assert len(inv["core"]["versions"]) == 2
    assert inv["core"]["overrides"] == [
        {"node_id": "11111111-1111-1111-1111-111111111111", "version": "0.3.8-rc4"},
    ]
    # Bootstrapper
    assert inv["bootstrapper"]["default"] == "0.3.9-rc5"
    assert inv["bootstrapper"]["sha256"] == "f" * 64
    assert inv["bootstrapper"]["supports_versions_api"] is False
    assert inv["bootstrapper"]["cr_pending"] == "2026-05-23-bootstrapper-admin-api"
    # Modules
    assert inv["modules"]["node_count"] == 2
    assert inv["modules"]["module_count"] == 2  # ocr-worker + hw-monitor
    assert len(inv["modules"]["drift"]) == 1  # ocr-worker driftet
    assert inv["modules"]["drift"][0]["module"] == "ocr-worker"


@pytest.mark.asyncio
async def test_gather_hub_inventory_core_versions_404_fallback(monkeypatch: Any) -> None:
    """Wenn /core/versions 404, Fallback auf /core/desired (nur default)."""
    _patch_async_client(monkeypatch, {
        "/api/v1/seti/core/versions": None,  # 404
        "/api/v1/seti/core/desired": {
            "version": "0.3.9-rc5.10b",
            "sha256": "a" * 64,
        },
        "/seti/distribute/info": {
            "bootstrapper_version": "0.3.9-rc5",
            "bootstrapper_sha256": "b" * 64,
            "bootstrapper_size_bytes": 1000,
            "binaries": {"bootstrapper": {"available": True}},
        },
        "/seti/nodes": {"nodes": []},
    })

    inv = await gather_hub_inventory("http://mock-hub:18765")
    assert inv["core"]["default"] == "0.3.9-rc5.10b"
    assert inv["core"]["supports_versions_api"] is False
    assert inv["core"]["versions"] == []
    assert "nicht verfuegbar" in (inv["core"]["error"] or "")


@pytest.mark.asyncio
async def test_gather_hub_inventory_alles_offline(monkeypatch: Any) -> None:
    """Hub vollstaendig nicht erreichbar → alle Sub-Blocks mit error."""
    _patch_async_client(monkeypatch, {})  # alles 404

    inv = await gather_hub_inventory("http://mock-hub:18765")
    assert inv["core"]["error"] is not None
    assert inv["bootstrapper"]["error"] is not None
    assert inv["modules"]["error"] is not None


# ── Multi-Hub-Wrapper ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_gather_all_inventories_schema(monkeypatch: Any) -> None:
    """Multi-Hub-Aggregation liefert das versprochene Schema."""
    _patch_async_client(monkeypatch, {
        "/api/v1/seti/core/versions": {
            "versions": ["0.3.9"],
            "default": "0.3.9",
            "overrides": {},
            "asset_inventory_versions": [],
        },
        "/seti/distribute/info": {
            "bootstrapper_version": "0.3.9",
            "binaries": {"bootstrapper": {"available": True, "sha256": "x" * 64, "size": 1}},
        },
        "/seti/nodes": {"nodes": []},
    })

    result = await gather_all_inventories([
        ("vdr", "http://vdr:18765", True),
        ("nas", "http://nas:8765", False),
    ])
    assert result["schema"] == "manifest-inventory-v1"
    assert result["active_hub_id"] == "vdr"
    assert len(result["hubs"]) == 2
    assert result["hubs"][0]["is_active"] is True
    assert result["hubs"][1]["is_active"] is False


# ── Route /api/v1/manifest/inventory ──────────────────────────────────────────


def test_route_inventory_liefert_v1_schema(monkeypatch: Any) -> None:
    """Integration: HTTP-Pfad gegen die Route."""
    store = _make_settings_store(
        hubs=[HubConfig(id="vdr", name="VDR", url="http://mock-hub:18765")],
        default_id="vdr",
    )
    _patch_async_client(monkeypatch, {
        "/api/v1/seti/core/versions": {
            "versions": ["0.3.9"],
            "default": "0.3.9",
            "overrides": {},
            "asset_inventory_versions": [],
        },
        "/seti/distribute/info": {
            "bootstrapper_version": "0.3.9",
            "binaries": {"bootstrapper": {"available": True, "sha256": "x" * 64, "size": 1}},
        },
        "/seti/nodes": {"nodes": []},
    })

    app = create_app(settings_store=store, enable_pipeline=False)
    client = TestClient(app)
    r = client.get("/api/v1/manifest/inventory")
    assert r.status_code == 200
    body = r.json()
    assert body["schema"] == "manifest-inventory-v1"
    assert body["active_hub_id"] == "vdr"
    assert len(body["hubs"]) == 1
    assert body["hubs"][0]["inventory"]["core"]["default"] == "0.3.9"
