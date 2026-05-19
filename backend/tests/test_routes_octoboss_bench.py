"""
Tests fuer /api/v1/octoboss/benchmarks/* Proxy-Routen.

Nutzt dasselbe httpx.MockTransport-Pattern wie test_routes_octoboss.py.
"""
from __future__ import annotations

import httpx
import pytest
from fastapi.testclient import TestClient

from moag.api import create_app
from moag.settings_store import SettingsStore
from moag.models import HubConfig


# ── Fixtures ──────────────────────────────────────────────────────────────────


def make_bench_client(monkeypatch, hub_responses: dict[str, object]):
    """
    Erstellt TestClient der MOAG-App mit gemocktem OctoBoss-Hub.

    hub_responses: Mapping von URL-Pfad-Substring → JSON-Dict oder None (404).
    """
    store = SettingsStore.__new__(SettingsStore)
    from moag.models import Settings
    store._settings = Settings(
        hubs=[HubConfig(id="bench-hub", name="BenchHub", url="http://mock-hub:18765")],
        default_hub_id="bench-hub",
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
    import threading
    store._lock = threading.Lock()

    def handler(req: httpx.Request) -> httpx.Response:
        url_str = str(req.url)
        for path_fragment, response_data in hub_responses.items():
            if path_fragment in url_str:
                if response_data is None:
                    return httpx.Response(404, json={"detail": "not found"})
                return httpx.Response(200, json=response_data)
        return httpx.Response(404, json={"detail": "not found"})

    real_async_client = httpx.AsyncClient
    monkeypatch.setattr(
        httpx, "AsyncClient",
        lambda **kw: real_async_client(
            transport=httpx.MockTransport(handler),
            **{k: v for k, v in kw.items() if k != "transport"},
        ),
    )

    app = create_app(settings_store=store, enable_pipeline=False)
    return TestClient(app, raise_server_exceptions=True)


def make_bench_client_503(monkeypatch):
    """Erstellt TestClient bei dem der Hub immer 503 zurueckliefert (DB nicht verfuegbar)."""
    store = SettingsStore.__new__(SettingsStore)
    from moag.models import Settings
    store._settings = Settings(
        hubs=[HubConfig(id="bench-hub", name="BenchHub", url="http://mock-hub:18765")],
        default_hub_id="bench-hub",
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
    import threading
    store._lock = threading.Lock()

    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(503, json={"detail": "Benchmark-DB nicht verfuegbar"})

    real_async_client = httpx.AsyncClient
    monkeypatch.setattr(
        httpx, "AsyncClient",
        lambda **kw: real_async_client(
            transport=httpx.MockTransport(handler),
            **{k: v for k, v in kw.items() if k != "transport"},
        ),
    )

    app = create_app(settings_store=store, enable_pipeline=False)
    return TestClient(app, raise_server_exceptions=False)


# ── Mock-Daten ─────────────────────────────────────────────────────────────────

MOCK_MATRIX = {
    "subjects": ["tesseract", "llava:13b"],
    "nodes": ["Ryzenstrike", "WhiteStar"],
    "matrix": {
        "tesseract": {
            "Ryzenstrike": {
                "domain": "ocr",
                "metric_key": "char_accuracy",
                "metric_value": 0.97,
                "metric_string": "97.0%",
                "passed": True,
                "error_text": None,
                "age_hours": 2.5,
                "stale": False,
                "trend": "stable",
                "created_at": "2026-05-19T08:00:00Z",
            }
        },
        "llava:13b": {
            "WhiteStar": {
                "domain": "llm_vision",
                "metric_key": "pass",
                "metric_value": 1.0,
                "metric_string": "pass",
                "passed": True,
                "error_text": None,
                "age_hours": 1.0,
                "stale": False,
                "trend": "up",
                "created_at": "2026-05-19T09:00:00Z",
            }
        },
    },
}

MOCK_HISTORY = {
    "results": [
        {
            "id": "r1",
            "subject": "tesseract",
            "node_id": "Ryzenstrike",
            "domain": "ocr",
            "metric_key": "char_accuracy",
            "metric_value": 0.97,
            "passed": True,
            "created_at": "2026-05-19T08:00:00Z",
        }
    ],
    "count": 1,
}

MOCK_RUNS = {
    "runs": [
        {
            "run_id": "550e8400-e29b-41d4-a716-446655440000",
            "started_at": "2026-05-19T08:00:00Z",
            "status": "completed",
            "scope_filters": {},
            "summary": {"total": 2, "passed": 2, "failed": 0, "skipped": 0},
        }
    ],
    "count": 1,
    "active_run_id": None,
}

MOCK_RUN_DETAIL = {
    "run": {
        "run_id": "550e8400-e29b-41d4-a716-446655440000",
        "started_at": "2026-05-19T08:00:00Z",
        "status": "completed",
    },
    "results": [
        {
            "subject": "tesseract",
            "node_id": "Ryzenstrike",
            "passed": True,
            "metric_value": 0.97,
        }
    ],
    "result_count": 1,
}

MOCK_RUN_STARTED = {
    "run_id": "660e8400-e29b-41d4-a716-446655440001",
    "started_at": "2026-05-19T10:00:00Z",
    "scope_filters": {},
    "message": "Benchmark-Run gestartet",
}


# ── Tests ─────────────────────────────────────────────────────────────────────


def test_benchmark_matrix_proxied(monkeypatch):
    """GET /api/v1/octoboss/benchmarks/matrix leitet an /api/v1/benchmarks/matrix weiter."""
    client = make_bench_client(monkeypatch, {"/api/v1/benchmarks/matrix": MOCK_MATRIX})
    resp = client.get("/api/v1/octoboss/benchmarks/matrix")
    assert resp.status_code == 200
    data = resp.json()
    assert "subjects" in data
    assert "nodes" in data
    assert "matrix" in data
    assert "tesseract" in data["subjects"]


def test_benchmark_history_proxied(monkeypatch):
    """GET /api/v1/octoboss/benchmarks/history leitet an /api/v1/benchmarks/history weiter."""
    client = make_bench_client(monkeypatch, {"/api/v1/benchmarks/history": MOCK_HISTORY})
    resp = client.get("/api/v1/octoboss/benchmarks/history?limit=50&subject=tesseract")
    assert resp.status_code == 200
    data = resp.json()
    assert "results" in data
    assert data["count"] == 1


def test_benchmark_history_query_params_passthrough(monkeypatch):
    """Query-Parameter werden an OctoBoss weitergeleitet (node_id, domain, subject, metric_key)."""
    received_params: list[dict] = []

    def handler(req: httpx.Request) -> httpx.Response:
        if "/api/v1/benchmarks/history" in str(req.url):
            received_params.append(dict(req.url.params))
            return httpx.Response(200, json=MOCK_HISTORY)
        return httpx.Response(404, json={"detail": "not found"})

    store = SettingsStore.__new__(SettingsStore)
    from moag.models import Settings
    store._settings = Settings(
        hubs=[HubConfig(id="bench-hub", name="BenchHub", url="http://mock-hub:18765")],
        default_hub_id="bench-hub",
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
    import threading
    store._lock = threading.Lock()

    real_async_client = httpx.AsyncClient
    import pytest as _pytest
    # Direkt monkeypatchen ohne extra Fixture
    import moag.routes_octoboss as rmod
    original = httpx.AsyncClient

    httpx.AsyncClient = lambda **kw: real_async_client(
        transport=httpx.MockTransport(handler),
        **{k: v for k, v in kw.items() if k != "transport"},
    )
    try:
        app = create_app(settings_store=store, enable_pipeline=False)
        client = TestClient(app, raise_server_exceptions=True)
        resp = client.get(
            "/api/v1/octoboss/benchmarks/history"
            "?node_id=Ryzenstrike&domain=ocr&subject=tesseract&metric_key=char_accuracy"
        )
        assert resp.status_code == 200
        assert len(received_params) == 1
        p = received_params[0]
        assert p.get("node_id") == "Ryzenstrike"
        assert p.get("domain") == "ocr"
        assert p.get("subject") == "tesseract"
        assert p.get("metric_key") == "char_accuracy"
    finally:
        httpx.AsyncClient = original


def test_benchmark_runs_proxied(monkeypatch):
    """GET /api/v1/octoboss/benchmarks/runs liefert runs + active_run_id."""
    client = make_bench_client(monkeypatch, {"/api/v1/benchmarks/runs": MOCK_RUNS})
    resp = client.get("/api/v1/octoboss/benchmarks/runs")
    assert resp.status_code == 200
    data = resp.json()
    assert "runs" in data
    assert "active_run_id" in data
    assert data["active_run_id"] is None


def test_benchmark_run_detail_proxied(monkeypatch):
    """GET /api/v1/octoboss/benchmarks/runs/{run_id} liefert Run-Detail + results."""
    run_id = "550e8400-e29b-41d4-a716-446655440000"
    client = make_bench_client(
        monkeypatch, {f"/api/v1/benchmarks/runs/{run_id}": MOCK_RUN_DETAIL}
    )
    resp = client.get(f"/api/v1/octoboss/benchmarks/runs/{run_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert "run" in data
    assert "results" in data
    assert data["result_count"] == 1


def test_benchmark_run_post_proxied(monkeypatch):
    """POST /api/v1/octoboss/benchmarks/run startet einen Run (202-Proxy)."""
    # Hub gibt 200 zurueck (MockTransport unterstuetzt keine 202-Kette direkt,
    # aber _proxy_post behandelt beide als Erfolg)
    client = make_bench_client(
        monkeypatch, {"/api/v1/benchmarks/run": MOCK_RUN_STARTED}
    )
    resp = client.post("/api/v1/octoboss/benchmarks/run", json={})
    assert resp.status_code == 200
    data = resp.json()
    assert "run_id" in data
    assert data["message"] == "Benchmark-Run gestartet"


def test_benchmark_matrix_503_passthrough(monkeypatch):
    """Wenn OctoBoss Benchmark-DB nicht verfuegbar ist (503), gibt MOAG 503 zurueck."""
    client = make_bench_client_503(monkeypatch)
    resp = client.get("/api/v1/octoboss/benchmarks/matrix")
    assert resp.status_code == 503
    data = resp.json()
    assert "Benchmark-DB" in data.get("detail", "")
