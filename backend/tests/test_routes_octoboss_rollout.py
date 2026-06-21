"""
Tests fuer den Aggregations-Endpoint GET /api/v1/octoboss/rollout/status.

Read-only — der OctoBoss-Hub wird per httpx.MockTransport gemockt. Es wird
verifiziert, dass der Endpoint die drei Sektionen (ROLLOUT / LETZTER TEST /
VERBESSERUNG) korrekt aus den Sub-Quellen zusammensetzt und bei Teilausfaellen
degradiert statt zu scheitern.
"""
from __future__ import annotations

import httpx
from fastapi.testclient import TestClient

from moag.api import create_app
from moag.settings_store import SettingsStore
from moag.models import HubConfig, Settings


def _make_store() -> SettingsStore:
    import threading

    store = SettingsStore.__new__(SettingsStore)
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
    store._lock = threading.Lock()
    return store


def _client_with_handler(monkeypatch, handler) -> TestClient:
    real_async_client = httpx.AsyncClient
    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda **kw: real_async_client(
            transport=httpx.MockTransport(handler),
            **{k: v for k, v in kw.items() if k != "transport"},
        ),
    )
    app = create_app(settings_store=_make_store(), enable_pipeline=False)
    return TestClient(app, raise_server_exceptions=True)


# ── Mock-Daten ─────────────────────────────────────────────────────────────────

_INVENTORY = {
    "schema": "manifest-inventory-v1",
    "active_hub_id": "test-hub",
    "hubs": [
        {
            "id": "test-hub",
            "url": "http://mock-hub:18765",
            "is_active": True,
            "error": None,
            "inventory": {
                "core": {
                    "default": "0.3.9-rc5.29",
                    "versions": [{"version": "0.3.9-rc5.29"}],
                    "overrides": [{"node_id": "n2", "version": "0.3.9-rc5.28"}],
                },
                "bootstrapper": {},
                "modules": {
                    "by_node": [
                        {"node_id": "n1", "hostname": "WhiteStar", "connected": True},
                        {"node_id": "n2", "hostname": "WorkRyzen", "connected": True},
                    ]
                },
            },
        }
    ],
}

_SETI_NODES = {
    "nodes": [
        {
            "node_id": "n1",
            "hostname": "WhiteStar",
            "connected": True,
            "agent_version": "0.9.47",
            "last_heartbeat": None,
        },
        {
            "node_id": "n2",
            "hostname": "WorkRyzen",
            "connected": True,
            "agent_version": "0.9.47",
            "last_heartbeat": None,
        },
    ]
}

_RUNS = {
    "runs": [
        {
            "run_id": "run-1",
            "started_at": "2026-06-21T07:00:00Z",
            "status": "completed",
            "summary": {"total": 5, "passed": 5, "failed": 0, "skipped": 0},
        }
    ],
    "count": 1,
    "active_run_id": None,
}

_RUN_DETAIL = {
    "run_id": "run-1",
    "results": [
        {
            "subject": "qwen2.5vl",
            "node_id": "n1",
            "domain": "llm_vision",
            "metric_key": "score",
            "metric_value": 0.86,
            "metric_string": "0.86",
            "passed": True,
        }
    ],
}

_MATRIX = {
    "subjects": ["qwen2.5vl", "llama3.1"],
    "nodes": ["n1", "n2"],
    "matrix": {
        "qwen2.5vl": {
            "n1": {
                "domain": "llm_vision",
                "metric_key": "score",
                "metric_value": 0.86,
                "metric_string": "0.86",
                "passed": True,
                "stale": False,
                "trend": "up",
                "created_at": "2026-06-21T07:00:00Z",
            }
        },
        "llama3.1": {
            "n2": {
                "domain": "llm_text",
                "metric_key": "tok_s",
                "metric_value": 71.0,
                "metric_string": "71.0 tok/s",
                "passed": True,
                "stale": False,
                "trend": "stable",
                "created_at": "2026-06-21T07:00:00Z",
            }
        },
    },
}


def _full_handler(req: httpx.Request) -> httpx.Response:
    url = str(req.url)
    # Spezifischere Pfade zuerst pruefen (runs/{id} vor runs).
    if "/api/v1/benchmarks/runs/run-1" in url:
        return httpx.Response(200, json=_RUN_DETAIL)
    if "/api/v1/benchmarks/runs" in url:
        return httpx.Response(200, json=_RUNS)
    if "/api/v1/benchmarks/matrix" in url:
        return httpx.Response(200, json=_MATRIX)
    if "/api/v1/manifest/inventory" in url:
        return httpx.Response(200, json=_INVENTORY)
    if "/seti/nodes" in url:
        return httpx.Response(200, json=_SETI_NODES)
    return httpx.Response(404, json={"detail": "not found"})


# ── Tests ──────────────────────────────────────────────────────────────────────


def test_rollout_status_happy_path(monkeypatch):
    """Alle Quellen liefern → drei Sektionen korrekt befuellt."""
    client = _client_with_handler(monkeypatch, _full_handler)
    resp = client.get("/api/v1/octoboss/rollout/status")
    assert resp.status_code == 200
    data = resp.json()

    assert data["schema"] == "octoboss-rollout-status-v1"

    # ROLLOUT
    roll = data["rollout"]
    assert roll["core_default"] == "0.3.9-rc5.29"
    assert roll["core_ist_tracked"] is False  # ehrliche Luecke
    assert "agent_version" in roll["core_ist_note"]
    nodes = {n["node_id"]: n for n in roll["nodes"]}
    assert nodes["n1"]["soll"] == "0.3.9-rc5.29"
    assert nodes["n1"]["soll_source"] == "default"
    # n2 hat einen Override → Soll = override-Version
    assert nodes["n2"]["soll"] == "0.3.9-rc5.28"
    assert nodes["n2"]["soll_source"] == "override"
    assert nodes["n1"]["agent_version"] == "0.9.47"

    # LETZTER TEST
    bench = data["last_test"]["benchmark_run"]
    assert bench["run_id"] == "run-1"
    assert bench["verdict"] == "GREEN"  # failed == 0
    assert any(s["subject"] == "qwen2.5vl" for s in bench["subjects"])
    # Pretest ehrlich als Luecke gekennzeichnet
    assert data["last_test"]["pretest"] is None
    assert "Folge-TODO" in data["last_test"]["pretest_note"]

    # VERBESSERUNG
    imp = {row["subject"]: row for row in data["improvement"]}
    assert imp["qwen2.5vl"]["symbol"] == "▲"
    assert imp["qwen2.5vl"]["trend"] == "up"
    assert imp["llama3.1"]["symbol"] == "="
    assert imp["llama3.1"]["trend"] == "stable"


def test_rollout_status_red_verdict(monkeypatch):
    """summary.failed > 0 → Verdikt RED."""
    runs_red = {
        "runs": [
            {
                "run_id": "run-2",
                "started_at": "2026-06-21T08:00:00Z",
                "status": "completed",
                "summary": {"total": 5, "passed": 3, "failed": 2, "skipped": 0},
            }
        ],
        "count": 1,
        "active_run_id": None,
    }

    def handler(req: httpx.Request) -> httpx.Response:
        url = str(req.url)
        if "/api/v1/benchmarks/runs/run-2" in url:
            return httpx.Response(200, json={"run_id": "run-2", "results": []})
        if "/api/v1/benchmarks/runs" in url:
            return httpx.Response(200, json=runs_red)
        if "/api/v1/benchmarks/matrix" in url:
            return httpx.Response(200, json=_MATRIX)
        if "/api/v1/manifest/inventory" in url:
            return httpx.Response(200, json=_INVENTORY)
        if "/seti/nodes" in url:
            return httpx.Response(200, json=_SETI_NODES)
        return httpx.Response(404, json={"detail": "not found"})

    client = _client_with_handler(monkeypatch, handler)
    resp = client.get("/api/v1/octoboss/rollout/status")
    assert resp.status_code == 200
    assert resp.json()["last_test"]["benchmark_run"]["verdict"] == "RED"


def test_rollout_status_degrades_on_partial_failure(monkeypatch):
    """Faellt eine Quelle aus (hier: Benchmarks 503), bleibt der Endpoint 200
    und markiert den betroffenen Block mit error statt total zu scheitern."""

    def handler(req: httpx.Request) -> httpx.Response:
        url = str(req.url)
        if "/api/v1/benchmarks" in url:
            return httpx.Response(503, json={"detail": "bench-db down"})
        if "/api/v1/manifest/inventory" in url:
            return httpx.Response(200, json=_INVENTORY)
        if "/seti/nodes" in url:
            return httpx.Response(200, json=_SETI_NODES)
        return httpx.Response(404, json={"detail": "not found"})

    client = _client_with_handler(monkeypatch, handler)
    resp = client.get("/api/v1/octoboss/rollout/status")
    assert resp.status_code == 200
    data = resp.json()
    # ROLLOUT funktioniert weiter
    assert data["rollout"]["core_default"] == "0.3.9-rc5.29"
    # LETZTER TEST + VERBESSERUNG degradiert mit error-Markierung
    assert data["last_test"]["benchmark_run"] is None
    assert data["last_test"]["error"] is not None
    assert data["improvement"] == []
    assert data["improvement_error"] is not None
