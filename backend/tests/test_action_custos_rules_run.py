"""
Tests fuer die custos.rules.run-Aktion (echter HTTP-Code, MockTransport).
"""
from __future__ import annotations

import json

import httpx
import pytest

from moag.actions.custos_rules_run import handle_custos_rules_run
from moag.schemas import ActionTriggerResponse


# ─── Hilfsfunktion ────────────────────────────────────────────────────────────

def _patch_custos_post(monkeypatch, status: int, body: object):
    """Patcht httpx.AsyncClient so dass POST /api/engine/run-once den body liefert."""
    _original_init = httpx.AsyncClient.__init__

    class _Transport(httpx.AsyncBaseTransport):
        async def handle_async_request(self, req: httpx.Request) -> httpx.Response:
            return httpx.Response(
                status,
                headers={"content-type": "application/json"},
                content=json.dumps(body).encode(),
            )

    _t = _Transport()

    def _new_init(self, **kwargs):
        kwargs["transport"] = _t
        _original_init(self, **kwargs)

    monkeypatch.setattr(httpx.AsyncClient, "__init__", _new_init)


# ─── Tests ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_rules_run_completed(monkeypatch):
    """custos.rules.run liefert status=completed bei HTTP 200."""
    _patch_custos_post(monkeypatch, 200, {
        "neue": 3,
        "geaendert": 1,
        "unveraendert": 10,
        "regeln_gelaufen": 2,
    })
    result = await handle_custos_rules_run({})
    assert isinstance(result, ActionTriggerResponse)
    assert result.status == "completed"
    assert result.action_id == "custos.rules.run"


@pytest.mark.asyncio
async def test_rules_run_summary_contains_counts(monkeypatch):
    """summary enthaelt Findings-Zaehlung."""
    _patch_custos_post(monkeypatch, 200, {
        "neue": 5,
        "geaendert": 2,
        "unveraendert": 8,
    })
    result = await handle_custos_rules_run({})
    assert "5" in result.result_summary  # neue
    assert "2" in result.result_summary  # geaendert


@pytest.mark.asyncio
async def test_rules_run_payload_populated(monkeypatch):
    """payload enthaelt erwartete Schluessel."""
    _patch_custos_post(monkeypatch, 200, {
        "neue": 1,
        "geaendert": 0,
        "unveraendert": 5,
    })
    result = await handle_custos_rules_run({})
    assert "neue" in result.payload
    assert "geaendert" in result.payload
    assert "gesamt" in result.payload
    assert result.payload["gesamt"] == 6


@pytest.mark.asyncio
async def test_rules_run_failed_on_http_error(monkeypatch):
    """status=failed bei HTTP 500 von Custos."""
    _patch_custos_post(monkeypatch, 500, {"detail": "DB down"})
    result = await handle_custos_rules_run({})
    assert result.status == "failed"
    assert "500" in result.error


@pytest.mark.asyncio
async def test_rules_run_failed_on_connect_error(monkeypatch):
    """status=failed wenn Custos nicht erreichbar."""
    _original_init = httpx.AsyncClient.__init__

    class _ErrTransport(httpx.AsyncBaseTransport):
        async def handle_async_request(self, req):
            raise httpx.ConnectError("refused")

    _t = _ErrTransport()

    def _new_init(self, **kwargs):
        kwargs["transport"] = _t
        _original_init(self, **kwargs)

    monkeypatch.setattr(httpx.AsyncClient, "__init__", _new_init)

    result = await handle_custos_rules_run({})
    assert result.status == "failed"
    assert result.error is not None


@pytest.mark.asyncio
async def test_rules_run_with_rule_id_in_body(monkeypatch):
    """Bei rule_id im body erscheint sie im result_summary."""
    _patch_custos_post(monkeypatch, 200, {
        "neue": 0,
        "geaendert": 0,
        "unveraendert": 3,
    })
    result = await handle_custos_rules_run({"rule_id": "r1"})
    assert result.status == "completed"
    assert "r1" in (result.result_summary or "")
    assert result.payload["rule_id_filter"] == "r1"


@pytest.mark.asyncio
async def test_rules_run_implemented_in_registry():
    """custos.rules.run ist als implemented=True in der Registry registriert."""
    import moag.actions  # noqa: F401 — Seiteneffekt: Registry befuellen
    from moag.actions.registry import ACTION_REGISTRY

    assert "custos.rules.run" in ACTION_REGISTRY
    defn = ACTION_REGISTRY["custos.rules.run"]
    assert defn.meta.implemented is True
