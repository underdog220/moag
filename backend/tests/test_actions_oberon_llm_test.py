"""
Tests fuer oberon.llm.test Aktion.

MockTransport simuliert Oberon DSGVO-Proxy.
"""
from __future__ import annotations

import json
from unittest.mock import patch

import httpx
import pytest

from moag.schemas import ActionTriggerResponse


def _dsgvo_proxy_response() -> dict:
    return {
        "status": "ok",
        "response": "pong",
        "piiFound": False,
        "piiTypes": [],
        "anonymized": False,
        "routingDecision": "PROXY",
        "auditId": "test-audit-id",
        "durationMs": 350,
    }


@pytest.mark.asyncio
async def test_oberon_llm_test_completed(monkeypatch):
    """Mocked Oberon DSGVO-Proxy -> Aktion liefert completed mit LLM-Antwort."""
    response_data = _dsgvo_proxy_response()

    def handler(req: httpx.Request) -> httpx.Response:
        if "/dsgvo/proxy" in str(req.url):
            # Pruefe das gesendete JSON
            body = json.loads(req.content)
            assert body["clientId"] == "moag"
            assert body["profile"] == "MINI"
            assert "pong" in body["prompt"].lower()
            return httpx.Response(200, json=response_data)
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)

    import moag.actions.oberon_llm_test as _mod
    original_client = _mod.httpx.Client

    def mock_client_factory(**kwargs):
        return original_client(transport=transport, **{k: v for k, v in kwargs.items() if k != "transport"})

    monkeypatch.setattr(_mod.httpx, "Client", mock_client_factory)
    monkeypatch.setenv("MOAG_OBERON_TOKEN", "test-token")
    monkeypatch.setenv("MOAG_OBERON_BASE_URL", "http://mock-oberon")

    result = await _mod.handle_oberon_llm_test({})

    assert isinstance(result, ActionTriggerResponse)
    assert result.action_id == "oberon.llm.test"
    assert result.status == "completed"
    assert result.result_summary is not None
    assert "350ms" in result.result_summary
    assert result.payload["response"] == "pong"
    assert result.payload["pii_found"] is False
    assert result.duration_ms is not None


@pytest.mark.asyncio
async def test_oberon_llm_test_unreachable(monkeypatch):
    """Oberon nicht erreichbar -> Aktion liefert failed."""
    def handler(req: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused")

    transport = httpx.MockTransport(handler)

    import moag.actions.oberon_llm_test as _mod
    original_client = _mod.httpx.Client

    def mock_client_factory(**kwargs):
        return original_client(transport=transport, **{k: v for k, v in kwargs.items() if k != "transport"})

    monkeypatch.setattr(_mod.httpx, "Client", mock_client_factory)
    monkeypatch.setenv("MOAG_OBERON_TOKEN", "test-token")
    monkeypatch.setenv("MOAG_OBERON_BASE_URL", "http://mock-oberon")

    result = await _mod.handle_oberon_llm_test({})

    assert result.status == "failed"
    assert result.error is not None


@pytest.mark.asyncio
async def test_oberon_llm_test_http_error(monkeypatch):
    """Oberon gibt HTTP 503 -> Aktion liefert failed mit status_code."""
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(503, text="Service Unavailable")

    transport = httpx.MockTransport(handler)

    import moag.actions.oberon_llm_test as _mod
    original_client = _mod.httpx.Client

    def mock_client_factory(**kwargs):
        return original_client(transport=transport, **{k: v for k, v in kwargs.items() if k != "transport"})

    monkeypatch.setattr(_mod.httpx, "Client", mock_client_factory)
    monkeypatch.setenv("MOAG_OBERON_TOKEN", "test-token")
    monkeypatch.setenv("MOAG_OBERON_BASE_URL", "http://mock-oberon")

    result = await _mod.handle_oberon_llm_test({})

    assert result.status == "failed"
    assert result.payload.get("status_code") == 503


def test_oberon_llm_test_meta():
    """Meta-Objekt ist korrekt konfiguriert."""
    import moag.actions.oberon_llm_test as _mod
    assert _mod._META.action_id == "oberon.llm.test"
    assert _mod._META.implemented is True
    assert _mod._META.system_id == "oberon"
    assert _mod._META.category == "diagnose"
