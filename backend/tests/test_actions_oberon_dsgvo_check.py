"""
Tests fuer oberon.dsgvo.check Aktion.

MockTransport simuliert Oberon DSGVO-Status-Endpoint.
"""
from __future__ import annotations

from unittest.mock import patch

import httpx
import pytest

from moag.schemas import ActionTriggerResponse


def _dsgvo_status_response() -> dict:
    return {
        "enabled": True,
        "failSafeMode": "PASSTHROUGH",
        "piiScannerReady": True,
        "auditActive": True,
        "version": "2.1.0",
    }


@pytest.mark.asyncio
async def test_oberon_dsgvo_check_completed(monkeypatch):
    """Mocked Oberon DSGVO-Status -> Aktion liefert completed mit Status-Info."""
    response_data = _dsgvo_status_response()

    def handler(req: httpx.Request) -> httpx.Response:
        if "/dsgvo/status" in str(req.url):
            return httpx.Response(200, json=response_data)
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)

    import moag.actions.oberon_dsgvo_check as _mod
    original_client = _mod.httpx.Client

    def mock_client_factory(**kwargs):
        return original_client(transport=transport, **{k: v for k, v in kwargs.items() if k != "transport"})

    monkeypatch.setattr(_mod.httpx, "Client", mock_client_factory)
    monkeypatch.setenv("MOAG_OBERON_TOKEN", "test-token")
    monkeypatch.setenv("MOAG_OBERON_BASE_URL", "http://mock-oberon")

    result = await _mod.handle_oberon_dsgvo_check({})

    assert isinstance(result, ActionTriggerResponse)
    assert result.action_id == "oberon.dsgvo.check"
    assert result.status == "completed"
    assert result.result_summary is not None
    # Summary enthaelt enabled-Status und Fail-Safe-Modus
    assert "True" in result.result_summary or "true" in result.result_summary.lower()
    assert "PASSTHROUGH" in result.result_summary
    assert result.payload["enabled"] is True
    assert result.payload["fail_safe_mode"] == "PASSTHROUGH"
    assert result.payload["pii_scanner_ready"] is True


@pytest.mark.asyncio
async def test_oberon_dsgvo_check_unreachable(monkeypatch):
    """Oberon nicht erreichbar -> Aktion liefert failed."""
    def handler(req: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused")

    transport = httpx.MockTransport(handler)

    import moag.actions.oberon_dsgvo_check as _mod
    original_client = _mod.httpx.Client

    def mock_client_factory(**kwargs):
        return original_client(transport=transport, **{k: v for k, v in kwargs.items() if k != "transport"})

    monkeypatch.setattr(_mod.httpx, "Client", mock_client_factory)
    monkeypatch.setenv("MOAG_OBERON_TOKEN", "test-token")
    monkeypatch.setenv("MOAG_OBERON_BASE_URL", "http://mock-oberon")

    result = await _mod.handle_oberon_dsgvo_check({})

    assert result.status == "failed"
    assert result.error is not None


@pytest.mark.asyncio
async def test_oberon_dsgvo_check_http_401(monkeypatch):
    """HTTP 401 -> Aktion liefert failed."""
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(401, text="Unauthorized")

    transport = httpx.MockTransport(handler)

    import moag.actions.oberon_dsgvo_check as _mod
    original_client = _mod.httpx.Client

    def mock_client_factory(**kwargs):
        return original_client(transport=transport, **{k: v for k, v in kwargs.items() if k != "transport"})

    monkeypatch.setattr(_mod.httpx, "Client", mock_client_factory)
    monkeypatch.setenv("MOAG_OBERON_TOKEN", "wrong-token")
    monkeypatch.setenv("MOAG_OBERON_BASE_URL", "http://mock-oberon")

    result = await _mod.handle_oberon_dsgvo_check({})

    assert result.status == "failed"
    assert result.payload.get("status_code") == 401


@pytest.mark.asyncio
async def test_oberon_dsgvo_check_disabled(monkeypatch):
    """DSGVO deaktiviert (enabled=False) -> Aktion trotzdem completed."""
    response_data = {
        "enabled": False,
        "failSafeMode": "BLOCK",
        "piiScannerReady": False,
        "auditActive": False,
    }

    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=response_data)

    transport = httpx.MockTransport(handler)

    import moag.actions.oberon_dsgvo_check as _mod
    original_client = _mod.httpx.Client

    def mock_client_factory(**kwargs):
        return original_client(transport=transport, **{k: v for k, v in kwargs.items() if k != "transport"})

    monkeypatch.setattr(_mod.httpx, "Client", mock_client_factory)
    monkeypatch.setenv("MOAG_OBERON_TOKEN", "test-token")
    monkeypatch.setenv("MOAG_OBERON_BASE_URL", "http://mock-oberon")

    result = await _mod.handle_oberon_dsgvo_check({})

    # Auch bei disabled: status=completed, wir berichten den Status
    assert result.status == "completed"
    assert result.payload["enabled"] is False
    assert result.payload["fail_safe_mode"] == "BLOCK"


def test_oberon_dsgvo_check_meta():
    """Meta-Objekt ist korrekt konfiguriert."""
    import moag.actions.oberon_dsgvo_check as _mod
    assert _mod._META.action_id == "oberon.dsgvo.check"
    assert _mod._META.implemented is True
    assert _mod._META.system_id == "oberon"
    assert _mod._META.category == "diagnose"
    assert _mod._META.sub_area == "dsgvo"
