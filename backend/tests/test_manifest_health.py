"""
Tests fuer Manifest-Health-Handler und Routen.

Alle Tests nutzen httpx.MockTransport um den Hub zu simulieren.
Kein echter Hub-Zugriff.
"""
from __future__ import annotations

import json
import threading
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from moag.api import create_app
from moag.manifest_health import (
    _validate_bootstrapper_schema,
    _validate_core_schema,
    get_manifest_health,
)
from moag.models import HubConfig, Settings
from moag.settings_store import SettingsStore


# ── Fixtures ──────────────────────────────────────────────────────────────────


def _make_settings_store(hub_url: str = "http://mock-hub:18765") -> SettingsStore:
    """Erstellt einen SettingsStore mit gemocktem Hub."""
    store = SettingsStore.__new__(SettingsStore)
    store._settings = Settings(
        hubs=[HubConfig(id="test-hub", name="TestHub", url=hub_url)],
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
    store._lock = threading.Lock()
    return store


def _make_app(monkeypatch: Any, hub_responses: dict[str, Any]) -> TestClient:
    """Erstellt TestClient mit gemocktem Hub."""
    store = _make_settings_store()

    def handler(req: httpx.Request) -> httpx.Response:
        url_str = str(req.url)
        for fragment, data in hub_responses.items():
            if fragment in url_str:
                if data is None:
                    return httpx.Response(404, json={"detail": "not found"})
                return httpx.Response(200, json=data)
        return httpx.Response(404, json={"detail": "not found"})

    real_async_client = httpx.AsyncClient

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

    app = create_app(settings_store=store, enable_pipeline=False)
    return TestClient(app)


# ── Schema-Validierung: Bootstrapper ──────────────────────────────────────────


def test_bootstrapper_schema_valid() -> None:
    """Gueltiges Bootstrapper-Manifest: alle Checks gruen."""
    raw = {
        "default_version": "0.3.9-rc5",
        "versions": {
            "0.3.9-rc5": {
                "url": "http://192.168.200.71:18765/seti/distribute/download/bootstrapper",
                "sha256": "a" * 64,
                "size": 679_000,
            }
        },
        "node_overrides": {},
    }
    checks = _validate_bootstrapper_schema(raw)
    statuses = {c["id"]: c["status"] for c in checks}
    assert statuses.get("schema-default-version") == "green"
    assert statuses.get("schema-versions") == "green"
    assert statuses.get("schema-version-entries") == "green"
    assert statuses.get("node-overrides-types") == "green"
    assert statuses.get("cross-ref") == "green"


def test_bootstrapper_schema_missing_default_version() -> None:
    """Fehlende default_version: schema-default-version = red."""
    raw = {
        "versions": {
            "0.3.9-rc5": {
                "url": "http://hub/bootstrapper",
                "sha256": "b" * 64,
                "size": 100,
            }
        },
    }
    checks = _validate_bootstrapper_schema(raw)
    statuses = {c["id"]: c["status"] for c in checks}
    assert statuses.get("schema-default-version") == "red"


def test_bootstrapper_schema_default_not_in_versions() -> None:
    """default_version fehlt in versions{}: cross-ref = red."""
    raw = {
        "default_version": "0.3.9-rc99",
        "versions": {
            "0.3.9-rc5": {
                "url": "http://hub/bootstrapper",
                "sha256": "c" * 64,
                "size": 100,
            }
        },
        "node_overrides": {},
    }
    checks = _validate_bootstrapper_schema(raw)
    statuses = {c["id"]: c["status"] for c in checks}
    assert statuses.get("cross-ref") == "red"


def test_bootstrapper_schema_node_overrides_not_string() -> None:
    """node_overrides-Wert ist Object statt String: node-overrides-types = red.

    Dieser Test repraesentiert den 'heute-morgen-Bug' — falsche node_overrides.
    """
    raw = {
        "default_version": "0.3.9-rc5",
        "versions": {
            "0.3.9-rc5": {
                "url": "http://hub/bootstrapper",
                "sha256": "d" * 64,
                "size": 100,
            }
        },
        "node_overrides": {
            "11111111-1111-1111-1111-111111111111": {
                "version": "0.3.9-rc5",
                "url": "http://hub/bootstrapper",
            }
        },
    }
    checks = _validate_bootstrapper_schema(raw)
    statuses = {c["id"]: c["status"] for c in checks}
    assert statuses.get("node-overrides-types") == "red"
    # Detail muss den Bug-Hinweis enthalten
    override_check = next(c for c in checks if c["id"] == "node-overrides-types")
    assert "dict" in override_check["detail"].lower() or "object" in override_check["detail"].lower() or "str" in override_check["detail"].lower()


def test_bootstrapper_schema_size_not_size_bytes() -> None:
    """Bootstrapper nutzt 'size', NICHT 'size_bytes'. Fehlender 'size': Fehler."""
    raw = {
        "default_version": "0.3.9-rc5",
        "versions": {
            "0.3.9-rc5": {
                "url": "http://hub/bootstrapper",
                "sha256": "e" * 64,
                # 'size' fehlt — absichtlich 'size_bytes' statt 'size'
                "size_bytes": 100,
            }
        },
        "node_overrides": {},
    }
    checks = _validate_bootstrapper_schema(raw)
    statuses = {c["id"]: c["status"] for c in checks}
    assert statuses.get("schema-version-entries") == "red"
    entry_check = next(c for c in checks if c["id"] == "schema-version-entries")
    assert "size" in entry_check["detail"].lower()


# ── Schema-Validierung: Core ──────────────────────────────────────────────────


def test_core_schema_valid() -> None:
    """Gueltiges Core-Manifest: alle Checks gruen."""
    raw = {
        "default_version": "0.3.1",
        "versions": {
            "0.3.1": {
                "sha256": "f" * 64,
                "size_bytes": 16_000_000,
                "released": "2026-05-18T12:00:00Z",
            }
        },
        "node_overrides": {},
    }
    checks = _validate_core_schema(raw)
    statuses = {c["id"]: c["status"] for c in checks}
    assert statuses.get("schema-default-version") == "green"
    assert statuses.get("schema-version-entries") == "green"
    assert statuses.get("node-overrides-types") == "green"
    assert statuses.get("cross-ref") == "green"


def test_core_schema_size_bytes_required() -> None:
    """Core nutzt 'size_bytes', NICHT 'size'. Fehlender 'size_bytes': Fehler."""
    raw = {
        "default_version": "0.3.1",
        "versions": {
            "0.3.1": {
                "sha256": "0" * 64,
                # 'size_bytes' fehlt — absichtlich 'size' statt 'size_bytes'
                "size": 16_000_000,
            }
        },
        "node_overrides": {},
    }
    checks = _validate_core_schema(raw)
    statuses = {c["id"]: c["status"] for c in checks}
    assert statuses.get("schema-version-entries") == "red"
    entry_check = next(c for c in checks if c["id"] == "schema-version-entries")
    assert "size_bytes" in entry_check["detail"]


def test_core_schema_node_overrides_object_is_error() -> None:
    """Core node_overrides-Wert ist Object: node-overrides-types = red."""
    raw = {
        "default_version": "0.3.1",
        "versions": {
            "0.3.1": {"sha256": "1" * 64, "size_bytes": 1000},
        },
        "node_overrides": {
            "22222222-2222-2222-2222-222222222222": {"version": "0.3.1"}
        },
    }
    checks = _validate_core_schema(raw)
    statuses = {c["id"]: c["status"] for c in checks}
    assert statuses.get("node-overrides-types") == "red"


# ── Routen-Tests (HTTP) ───────────────────────────────────────────────────────


def test_route_manifest_health_both(monkeypatch: Any) -> None:
    """GET /api/v1/manifest/health liefert 200 mit manifests.bootstrapper + manifests.core.

    Mock entspricht Production-Format: binaries.bootstrapper enthaelt KEIN sha256/size_bytes,
    SHA + size liegen Top-Level als bootstrapper_sha256 / bootstrapper_size_bytes.
    Mit Fix F1 muss schema-version-entries gruen sein.
    """
    hub_responses = {
        "seti/distribute/info": {
            "bootstrapper_version": "0.3.9-rc5",
            "bootstrapper_sha256": "a" * 64,
            "bootstrapper_size_bytes": 679_000,
            "binaries": {
                "bootstrapper": {
                    "available": True,
                    "version": "0.3.9-rc5",
                    "url": "http://mock-hub:18765/seti/distribute/download/bootstrapper",
                }
            },
        },
        "seti/core/desired": {
            "version": "0.3.1",
            "sha256": "b" * 64,
            "size_bytes": 16_000_000,
        },
    }
    client = _make_app(monkeypatch, hub_responses)
    resp = client.get("/api/v1/manifest/health")
    assert resp.status_code == 200
    data = resp.json()
    assert "manifests" in data
    assert "bootstrapper" in data["manifests"]
    assert "core" in data["manifests"]
    assert "summary" in data
    # Mit Top-Level-Fallback muss schema-version-entries gruen sein
    boot_checks = {c["id"]: c["status"] for c in data["manifests"]["bootstrapper"]["checks"]}
    assert boot_checks.get("schema-version-entries") == "green", (
        f"schema-version-entries nicht gruen (Field-Mapping-Bug?): {boot_checks}"
    )


def test_route_manifest_health_top_level_bootstrapper_fields_v0_4_17(monkeypatch: Any) -> None:
    """Production-Format v0.4.17+: binaries.bootstrapper enthaelt NUR available/version/url.

    SHA und size liegen Top-Level als bootstrapper_sha256 / bootstrapper_size_bytes.
    Reproduziert den Bug aus Bug-Klasse #79: pseudo_entry mappte nur binaries.bootstrapper{},
    sha256="" + size=0 → schema-version-entries war immer rot gegen Production-Hub.

    Fix F1: pseudo_entry liest Top-Level-Felder als Fallback.
    Dieser Test verifiziert dass schema-version-entries gruen ist und
    summary.overall_status fuer den Bootstrapper-Branch nicht rot ist.
    """
    hub_responses = {
        "seti/distribute/info": {
            # Top-Level-Felder (Production-Realitaet laut Hub VDR 18765)
            "bootstrapper_version": "0.3.9-rc5.11",
            "bootstrapper_sha256": "3faedd0a8b866b0436f53c51089a23970517e364336e1ef62cc12b46deb9f567",
            "bootstrapper_size_bytes": 4_669_952,
            # binaries.bootstrapper enthaelt KEIN sha256 / size_bytes
            "binaries": {
                "bootstrapper": {
                    "available": True,
                    "version": "0.3.9-rc5.11",
                    "url": "http://mock-hub:18765/seti/distribute/download/bootstrapper",
                }
            },
        },
    }
    client = _make_app(monkeypatch, hub_responses)
    resp = client.get("/api/v1/manifest/health?target=bootstrapper")
    assert resp.status_code == 200
    data = resp.json()
    assert "bootstrapper" in data["manifests"]

    boot_checks = {c["id"]: c["status"] for c in data["manifests"]["bootstrapper"]["checks"]}

    # schema-version-entries muss gruen sein — SHA + size korrekt gemappt
    assert boot_checks.get("schema-version-entries") == "green", (
        f"schema-version-entries rot — Top-Level-Fallback fehlt oder kaputt: {boot_checks}"
    )

    # Bootstrapper-Status darf nicht rot sein wenn Felder korrekt befuellt
    boot_status = data["manifests"]["bootstrapper"]["status"]
    assert boot_status != "red", (
        f"Bootstrapper-Status ist rot obwohl Manifest-Felder korrekt: {boot_status}\n"
        f"Checks: {boot_checks}"
    )


def test_route_manifest_health_bootstrapper_only(monkeypatch: Any) -> None:
    """GET /api/v1/manifest/health?target=bootstrapper liefert nur bootstrapper."""
    hub_responses = {
        "seti/distribute/info": {
            "bootstrapper_version": "0.3.9-rc5",
            "binaries": {"bootstrapper": {"available": True, "version": "0.3.9-rc5"}},
        },
    }
    client = _make_app(monkeypatch, hub_responses)
    resp = client.get("/api/v1/manifest/health?target=bootstrapper")
    assert resp.status_code == 200
    data = resp.json()
    assert "bootstrapper" in data["manifests"]
    assert "core" not in data["manifests"]


def test_route_manifest_health_hub_down(monkeypatch: Any) -> None:
    """Hub nicht erreichbar → HTTP 200, status = red in live-consistency."""
    hub_responses: dict = {}  # Alle Anfragen → 404

    client = _make_app(monkeypatch, hub_responses)
    resp = client.get("/api/v1/manifest/health?target=bootstrapper")
    assert resp.status_code == 200
    data = resp.json()
    # Status darf nicht green sein wenn Hub nicht antwortet
    boot_status = data["manifests"]["bootstrapper"]["status"]
    assert boot_status in ("yellow", "red")


def test_route_manifest_health_core_only(monkeypatch: Any) -> None:
    """GET /api/v1/manifest/health/core liefert nur core."""
    hub_responses = {
        "seti/core/desired": {
            "version": "0.3.1",
            "sha256": "c" * 64,
        },
    }
    client = _make_app(monkeypatch, hub_responses)
    resp = client.get("/api/v1/manifest/health/core")
    assert resp.status_code == 200
    data = resp.json()
    assert "core" in data["manifests"]
    assert "bootstrapper" not in data["manifests"]


def test_route_manifest_health_fetched_at(monkeypatch: Any) -> None:
    """Response enthaelt fetched_at Timestamp."""
    hub_responses = {
        "seti/distribute/info": {
            "bootstrapper_version": "0.3.9-rc5",
            "binaries": {"bootstrapper": {"available": True}},
        },
        "seti/core/desired": {"version": "0.3.1"},
    }
    client = _make_app(monkeypatch, hub_responses)
    resp = client.get("/api/v1/manifest/health")
    assert resp.status_code == 200
    data = resp.json()
    assert "fetched_at" in data
    assert data["fetched_at"]  # nicht leer


def test_route_manifest_health_bootstrapper_shortcut(monkeypatch: Any) -> None:
    """GET /api/v1/manifest/health/bootstrapper ist Shortcut fuer target=bootstrapper."""
    hub_responses = {
        "seti/distribute/info": {
            "bootstrapper_version": "0.3.9-rc5",
            "binaries": {"bootstrapper": {"available": True}},
        },
    }
    client = _make_app(monkeypatch, hub_responses)
    resp = client.get("/api/v1/manifest/health/bootstrapper")
    assert resp.status_code == 200
    data = resp.json()
    assert "bootstrapper" in data["manifests"]
    assert "core" not in data["manifests"]


def test_schema_bootstrapper_invalid_sha256() -> None:
    """Ungueltige SHA256 (nicht 64 Hex-Zeichen): schema-version-entries = red."""
    raw = {
        "default_version": "0.3.9-rc5",
        "versions": {
            "0.3.9-rc5": {
                "url": "http://hub/bootstrapper",
                "sha256": "notagoodhash",
                "size": 100,
            }
        },
        "node_overrides": {},
    }
    checks = _validate_bootstrapper_schema(raw)
    statuses = {c["id"]: c["status"] for c in checks}
    assert statuses.get("schema-version-entries") == "red"


def test_overall_status_red_when_any_red() -> None:
    """Wenn ein Check rot ist, ist der Gesamt-Status rot."""
    raw = {
        "default_version": "0.3.9-MISSING",
        "versions": {
            "0.3.9-rc5": {
                "url": "http://hub/b",
                "sha256": "a" * 64,
                "size": 100,
            }
        },
        "node_overrides": {},
    }
    checks = _validate_bootstrapper_schema(raw)
    from moag.manifest_health import _overall
    assert _overall(checks) == "red"


# ── /health/all — Multi-Hub-Endpoint ─────────────────────────────────────────


def _make_app_two_hubs(
    monkeypatch: Any,
    hub1_responses: dict[str, Any],
    hub2_responses: dict[str, Any],
) -> TestClient:
    """Erstellt TestClient mit zwei gemockten Hubs (vdr + nas)."""
    store = SettingsStore.__new__(SettingsStore)
    store._settings = Settings(
        hubs=[
            HubConfig(id="vdr", name="VDR-Production", url="http://mock-vdr:18765"),
            HubConfig(id="nas", name="NAS-Legacy", url="http://mock-nas:8765"),
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
    )
    store._path = None  # type: ignore[assignment]
    store._listeners = []
    store._lock = threading.Lock()

    def handler(req: httpx.Request) -> httpx.Response:
        url_str = str(req.url)
        # Welcher Hub wird angesprochen?
        if "mock-vdr" in url_str:
            responses = hub1_responses
        elif "mock-nas" in url_str:
            responses = hub2_responses
        else:
            return httpx.Response(404, json={"detail": "unbekannter host"})
        for fragment, data in responses.items():
            if fragment in url_str:
                if data is None:
                    return httpx.Response(404, json={"detail": "not found"})
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

    app = create_app(settings_store=store, enable_pipeline=False)
    return TestClient(app)


def test_health_all_schema_v1(monkeypatch: Any) -> None:
    """GET /api/v1/manifest/health/all liefert schema=manifest-health-all-v1."""
    hub_ok = {
        "seti/distribute/info": {
            "bootstrapper_version": "0.3.9-rc5",
            "binaries": {"bootstrapper": {"available": True, "version": "0.3.9-rc5"}},
        },
        "seti/core/desired": {"version": "0.3.1"},
    }
    client = _make_app_two_hubs(monkeypatch, hub_ok, hub_ok)
    resp = client.get("/api/v1/manifest/health/all")
    assert resp.status_code == 200
    data = resp.json()
    assert data["schema"] == "manifest-health-all-v1"
    assert "active_hub_id" in data
    assert data["active_hub_id"] == "vdr"
    assert "hubs" in data
    assert len(data["hubs"]) == 2


def test_health_all_active_hub_flag(monkeypatch: Any) -> None:
    """GET /api/v1/manifest/health/all: nur der aktive Hub hat is_active=true."""
    hub_ok = {
        "seti/distribute/info": {
            "bootstrapper_version": "0.3.9-rc5",
            "binaries": {"bootstrapper": {"available": True}},
        },
        "seti/core/desired": {"version": "0.3.1"},
    }
    client = _make_app_two_hubs(monkeypatch, hub_ok, hub_ok)
    resp = client.get("/api/v1/manifest/health/all")
    assert resp.status_code == 200
    data = resp.json()
    hubs_by_id = {h["id"]: h for h in data["hubs"]}
    assert hubs_by_id["vdr"]["is_active"] is True
    assert hubs_by_id["nas"]["is_active"] is False


def test_health_all_one_hub_timeout(monkeypatch: Any) -> None:
    """Wenn Hub 2 (nas) einen Timeout erzeugt, liefert health.error=timeout."""
    hub_ok = {
        "seti/distribute/info": {
            "bootstrapper_version": "0.3.9-rc5",
            "binaries": {"bootstrapper": {"available": True}},
        },
        "seti/core/desired": {"version": "0.3.1"},
    }

    import asyncio as _asyncio
    from moag import routes_manifest_health as rmh

    original_probe = rmh._probe_hub_with_timeout

    async def mock_probe(hub_id: str, hub_url: str, is_active: bool, timeout_s: float) -> dict:
        if hub_id == "nas":
            return {
                "id": hub_id,
                "url": hub_url,
                "is_active": is_active,
                "health": {"error": "timeout", "detail": f"Hub {hub_url} Timeout simuliert"},
            }
        return await original_probe(hub_id, hub_url, is_active, timeout_s)

    monkeypatch.setattr(rmh, "_probe_hub_with_timeout", mock_probe)

    # AsyncClient-Mock fuer den vdr-Hub (nas-Probe wird abgefangen)
    hub1_responses = hub_ok

    store = SettingsStore.__new__(SettingsStore)
    store._settings = Settings(
        hubs=[
            HubConfig(id="vdr", name="VDR-Production", url="http://mock-vdr:18765"),
            HubConfig(id="nas", name="NAS-Legacy", url="http://mock-nas:8765"),
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
    )
    store._path = None  # type: ignore[assignment]
    store._listeners = []
    store._lock = threading.Lock()

    def handler(req: httpx.Request) -> httpx.Response:
        url_str = str(req.url)
        for fragment, data in hub1_responses.items():
            if fragment in url_str:
                if data is None:
                    return httpx.Response(404, json={"detail": "not found"})
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

    app = create_app(settings_store=store, enable_pipeline=False)
    client = TestClient(app)

    resp = client.get("/api/v1/manifest/health/all")
    assert resp.status_code == 200
    data = resp.json()
    hubs_by_id = {h["id"]: h for h in data["hubs"]}
    # nas hat Timeout
    assert hubs_by_id["nas"]["health"]["error"] == "timeout"
    # vdr hat health.manifests (kein Fehler)
    assert "manifests" in hubs_by_id["vdr"]["health"]


def test_health_all_backward_compat_single_endpoint_unchanged(monkeypatch: Any) -> None:
    """GET /api/v1/manifest/health (alter Endpoint) funktioniert weiterhin."""
    hub_responses = {
        "seti/distribute/info": {
            "bootstrapper_version": "0.3.9-rc5",
            "binaries": {"bootstrapper": {"available": True, "version": "0.3.9-rc5"}},
        },
        "seti/core/desired": {
            "version": "0.3.1",
            "sha256": "b" * 64,
            "size_bytes": 16_000_000,
        },
    }
    client = _make_app(monkeypatch, hub_responses)
    resp = client.get("/api/v1/manifest/health")
    assert resp.status_code == 200
    data = resp.json()
    assert "manifests" in data
    assert "summary" in data
