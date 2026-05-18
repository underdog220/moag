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
    """GET /api/v1/manifest/health liefert 200 mit manifests.bootstrapper + manifests.core."""
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
    assert data["summary"]["overall_status"] in ("green", "yellow", "red")


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
