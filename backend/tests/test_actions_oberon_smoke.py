"""
Smoke-Tests fuer oberon.smoke Aktion.

MockTransport simuliert den Oberon-Cockpit-Smoke-Endpoint.
"""
from __future__ import annotations

import json
from unittest.mock import patch

import httpx
import pytest

from moag.schemas import ActionTriggerResponse


def _smoke_response_json() -> dict:
    return {
        "suites": [
            {"name": "dsgvo-status", "status": "PASS", "last_run": "2026-05-17T10:00:00Z", "latency_ms": 12, "error": None},
            {"name": "pii-detect",   "status": "PASS", "last_run": "2026-05-17T10:00:00Z", "latency_ms": 8,  "error": None},
            {"name": "ner-extract",  "status": "WARN", "last_run": "2026-05-17T10:00:00Z", "latency_ms": 5,  "error": "NER_MODE=OFF"},
            {"name": "octoboss-local","status": "PASS", "last_run": "2026-05-17T10:00:00Z", "latency_ms": 3,  "error": None},
            {"name": "oberon-postgres","status":"PASS", "last_run": "2026-05-17T10:00:00Z", "latency_ms": 15, "error": None},
            {"name": "local-llm-hub", "status": "PASS", "last_run": "2026-05-17T10:00:00Z", "latency_ms": 22, "error": None},
        ],
        "summary": {
            "pass": 5,
            "warn": 1,
            "fail": 0,
            "total": 6,
            "verdict": "WARN",
        },
    }


@pytest.mark.asyncio
async def test_oberon_smoke_completed(monkeypatch):
    """Mocked Oberon-Response -> Aktion liefert completed mit summary."""
    smoke_data = _smoke_response_json()

    def handler(req: httpx.Request) -> httpx.Response:
        if "/cockpit/smoke" in str(req.url):
            return httpx.Response(200, json=smoke_data)
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)

    # CockpitClient ist sync (httpx.Client) — wir patchen den Client-Konstruktor
    import moag.clients.oberon_cockpit_client as _cc
    original_client = _cc.httpx.Client

    def mock_client_factory(**kwargs):
        return original_client(transport=transport, **{k: v for k, v in kwargs.items() if k not in ("transport",)})

    monkeypatch.setattr(_cc.httpx, "Client", mock_client_factory)
    monkeypatch.setenv("MOAG_OBERON_TOKEN", "test-token")
    monkeypatch.setenv("MOAG_OBERON_BASE_URL", "http://mock-oberon")

    from moag.actions.oberon_smoke import handle_oberon_smoke
    result = await handle_oberon_smoke({})

    assert isinstance(result, ActionTriggerResponse)
    assert result.action_id == "oberon.smoke"
    assert result.status == "completed"
    assert result.result_summary is not None
    assert "WARN" in result.result_summary
    assert result.payload["verdict"] == "WARN"
    assert result.payload["pass"] == 5
    assert result.payload["warn"] == 1
    assert result.payload["fail"] == 0
    assert result.duration_ms is not None


@pytest.mark.asyncio
async def test_oberon_smoke_unreachable(monkeypatch):
    """Oberon nicht erreichbar -> Aktion liefert failed."""
    def handler(req: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused")

    transport = httpx.MockTransport(handler)

    import moag.clients.oberon_cockpit_client as _cc
    original_client = _cc.httpx.Client

    def mock_client_factory(**kwargs):
        return original_client(transport=transport, **{k: v for k, v in kwargs.items() if k not in ("transport",)})

    monkeypatch.setattr(_cc.httpx, "Client", mock_client_factory)
    monkeypatch.setenv("MOAG_OBERON_TOKEN", "test-token")
    monkeypatch.setenv("MOAG_OBERON_BASE_URL", "http://mock-oberon")

    from moag.actions.oberon_smoke import handle_oberon_smoke
    result = await handle_oberon_smoke({})

    assert result.status == "failed"
    assert result.error is not None


@pytest.mark.asyncio
async def test_oberon_smoke_all_pass(monkeypatch):
    """Alle 6 Checks PASS -> verdict PASS in summary."""
    smoke_data = {
        "suites": [
            {"name": f"check-{i}", "status": "PASS", "last_run": "2026-05-17T10:00:00Z", "latency_ms": 5, "error": None}
            for i in range(6)
        ],
        "summary": {"pass": 6, "warn": 0, "fail": 0, "total": 6, "verdict": "PASS"},
    }

    def handler(req: httpx.Request) -> httpx.Response:
        if "/cockpit/smoke" in str(req.url):
            return httpx.Response(200, json=smoke_data)
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)

    import moag.clients.oberon_cockpit_client as _cc
    original_client = _cc.httpx.Client

    def mock_client_factory(**kwargs):
        return original_client(transport=transport, **{k: v for k, v in kwargs.items() if k not in ("transport",)})

    monkeypatch.setattr(_cc.httpx, "Client", mock_client_factory)
    monkeypatch.setenv("MOAG_OBERON_TOKEN", "test-token")
    monkeypatch.setenv("MOAG_OBERON_BASE_URL", "http://mock-oberon")

    from moag.actions.oberon_smoke import handle_oberon_smoke
    result = await handle_oberon_smoke({})

    assert result.status == "completed"
    assert "PASS" in (result.result_summary or "")
    assert result.payload["fail"] == 0
    assert len(result.payload["checks"]) == 6
