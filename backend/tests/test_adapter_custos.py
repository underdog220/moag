"""
Tests fuer den Custos-Adapter (echter HTTP-Code, MockTransport).
"""
from __future__ import annotations

import json
from contextlib import asynccontextmanager

import httpx
import pytest

from moag.adapters import custos
from moag.schemas import SystemStatus


# ─── Hilfsfunktion: MockTransport fuer httpx ─────────────────────────────────

class _MockTransport(httpx.AsyncBaseTransport):
    """Gibt vordefinierte Responses fuer bestimmte URL-Pfade zurueck."""

    def __init__(self, routes: dict[str, tuple[int, object]]):
        self.routes = routes

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path
        for fragment, (status, body) in self.routes.items():
            if path.startswith(fragment):
                content = json.dumps(body).encode() if not isinstance(body, bytes) else body
                return httpx.Response(
                    status_code=status,
                    headers={"content-type": "application/json"},
                    content=content,
                )
        return httpx.Response(404, content=b'{"detail": "not found"}')


def _patch_httpx(monkeypatch, transport: httpx.AsyncBaseTransport):
    """Patcht httpx.AsyncClient so dass er den angegebenen Transport nutzt.

    Speichert den Original-__init__ vor dem Patchen um Rekursion zu vermeiden.
    """
    original_cls = httpx.AsyncClient
    _saved_transport = transport

    class _PatchedClient(httpx.AsyncClient):
        def __init__(self, **kwargs):
            kwargs["transport"] = _saved_transport
            # Kein super().__init__ via monkeypatched Klasse — direkt Original
            original_cls.__init__(self, **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", _PatchedClient)


# ─── Fixtures ────────────────────────────────────────────────────────────────

FINDING_FIXTURE = {
    "id": "00000000-0000-0000-0000-000000000001",
    "entdeckt_am": "2026-05-17T08:00:00Z",
    "regel_id": "r1",
    "quelle_app": "alter",
    "schwere": "CRIT",
    "entitaet_typ": "mietvertrag",
    "entitaet_id": None,
    "titel": "Testfinding",
    "beschreibung": "Beschreibung",
    "ki_kontext": None,
    "prioritaet_score": "0.9",
    "status": "OFFEN",
    "user_feedback": None,
    "zugewiesen_an": None,
    "geloest_am": None,
    "erstellt_am": "2026-05-17T08:00:00Z",
    "geaendert_am": "2026-05-17T08:00:00Z",
}

ENGINE_STATUS_FIXTURE = {
    "regeln": [
        {"regel_id": "r1", "aktiv": True, "laufintervall_minuten": 60,
         "letzter_lauf": "2026-05-17T08:00:00Z"},
    ],
    "count_aktiv": 1,
    "count_gesamt": 1,
}

FULL_ROUTES = {
    "/api/health": (200, {"status": "ok", "service": "custos", "version": "0.1.0"}),
    "/api/engine/status": (200, ENGINE_STATUS_FIXTURE),
    "/api/findings": (200, [FINDING_FIXTURE]),
}

EMPTY_FINDINGS_ROUTES = {
    "/api/health": (200, {"status": "ok"}),
    "/api/engine/status": (200, {
        "regeln": [{"regel_id": "r1", "aktiv": True, "laufintervall_minuten": 60,
                    "letzter_lauf": "2026-05-17T08:00:00Z"}],
        "count_aktiv": 1,
        "count_gesamt": 1,
    }),
    "/api/findings": (200, []),
}


# ─── Tests ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_status_returns_system_status(monkeypatch):
    """Adapter liefert SystemStatus-Objekt."""
    _patch_httpx(monkeypatch, _MockTransport(FULL_ROUTES))
    status = await custos.get_status(base_url="http://mock:17890")
    assert isinstance(status, SystemStatus)
    assert status.system_id == "custos"


@pytest.mark.asyncio
async def test_get_status_ok_when_reachable(monkeypatch):
    """Adapter meldet ok=True wenn Service erreichbar."""
    _patch_httpx(monkeypatch, _MockTransport(EMPTY_FINDINGS_ROUTES))
    status = await custos.get_status(base_url="http://mock:17890")
    assert status.ok is True
    assert status.score >= 50


@pytest.mark.asyncio
async def test_get_status_score_maximum(monkeypatch):
    """Score ist 100 wenn alle 3 Checks erfolgreich."""
    _patch_httpx(monkeypatch, _MockTransport(EMPTY_FINDINGS_ROUTES))
    status = await custos.get_status(base_url="http://mock:17890")
    # 50 (reachable) + 30 (engine_ok: aktive Regel vorhanden) + 20 (findings_ok) = 100
    assert status.score == 100


@pytest.mark.asyncio
async def test_get_status_score_partial_engine_fail(monkeypatch):
    """Score ist 70 wenn Engine-Status fehlschlaegt aber Health und Findings ok."""
    routes = {
        "/api/health": (200, {"status": "ok"}),
        "/api/engine/status": (500, {"detail": "DB down"}),
        "/api/findings": (200, []),
    }
    _patch_httpx(monkeypatch, _MockTransport(routes))
    status = await custos.get_status(base_url="http://mock:17890")
    # engine_ok=False (500-Antwort), findings_ok=True
    assert status.score == 70  # 50 + 0 + 20


@pytest.mark.asyncio
async def test_get_status_not_ok_when_unreachable(monkeypatch):
    """Adapter meldet ok=False wenn Health-Probe fehlschlaegt."""
    class _ErrorTransport(httpx.AsyncBaseTransport):
        async def handle_async_request(self, request):
            raise httpx.ConnectError("connection refused")

    _patch_httpx(monkeypatch, _ErrorTransport())
    status = await custos.get_status(base_url="http://mock:17890")
    assert status.ok is False
    assert status.score == 0
    assert status.error is not None


@pytest.mark.asyncio
async def test_get_status_findings_count_in_summary(monkeypatch):
    """Bei Findings > 0 erscheint Hinweis im summary."""
    _patch_httpx(monkeypatch, _MockTransport(FULL_ROUTES))
    status = await custos.get_status(base_url="http://mock:17890")
    assert "1 offene" in status.summary
    assert status.metrics["findings_count"] == 1


@pytest.mark.asyncio
async def test_get_status_system_id():
    """system_id ist immer 'custos' — auch bei Netzwerkfehler."""
    status = await custos.get_status(base_url="http://127.0.0.1:1")
    assert status.system_id == "custos"


@pytest.mark.asyncio
async def test_get_status_metrics_populated(monkeypatch):
    """Metrics-Dict enthaelt erwartete Schluessel."""
    _patch_httpx(monkeypatch, _MockTransport(FULL_ROUTES))
    status = await custos.get_status(base_url="http://mock:17890")
    assert "findings_count" in status.metrics
    assert "active_rules" in status.metrics
    assert "latency_ms" in status.metrics
