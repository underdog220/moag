"""
Tests fuer die Custos-Proxy-Routen (/api/v1/custos/*).
Custos-Service wird per MockTransport simuliert.

Strategie: _CustosTransport patcht httpx.AsyncClient.__init__ via
monkeypatch.setattr auf __init__ direkt (kein Class-Replace, keine Rekursion).
"""
from __future__ import annotations

import json
import os

import httpx
import pytest
from fastapi.testclient import TestClient

from moag.api import create_app
from moag.settings_store import SettingsStore


# ─── Fixtures ────────────────────────────────────────────────────────────────

@pytest.fixture()
def settings_store(tmp_path):
    p = tmp_path / "settings.json"
    p.write_text(json.dumps({
        "hubs": [],
        "default_hub_id": "",
        "cluster_enabled": False,
        "voting_engines": [],
        "voting_strategy": "consensus",
        "fallback_to_local": False,
        "pipeline_log_enabled": False,
        "oberon_base_url": "http://mock-oberon:17900",
        "ocrexpert_base_url": "http://mock-ocr:17810",
        "nasdominator_base_url": "http://mock-nas:9090",
        "custos_base_url": "http://mock-custos:17890",
        "panopticor_base_url": "http://mock-pano:8787",
    }), encoding="utf-8")
    os.environ["MOAG_SETTINGS_PATH"] = str(p)
    store = SettingsStore(p)
    yield store
    os.environ.pop("MOAG_SETTINGS_PATH", None)


# ─── Mock-Transport fuer Custos ───────────────────────────────────────────────

HEALTH_RESP = {"status": "ok", "service": "custos", "version": "0.1.0"}
REGEL_DETAIL = {
    "id": "r1",
    "quelle_app": "alter",
    "titel": "Mietvertrag-Pruefung",
    "beschreibung": "Prueft laufende Mietvertraege.",
    "kategorie": "DOKUMENTATION",
    "schwere_default": "CRIT",
    "sql_query": "SELECT ...",
    "aktiv": True,
    "laufintervall_minuten": 60,
    "letzter_lauf": "2026-05-17T08:00:00Z",
    "erstellt_am": "2026-01-01T00:00:00Z",
}
REGELN_RESP = [REGEL_DETAIL]
FINDINGS_RESP = [
    {
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
]
ENGINE_STATUS_RESP = {
    "regeln": [{"regel_id": "r1", "aktiv": True, "laufintervall_minuten": 60,
                "letzter_lauf": "2026-05-17T08:00:00Z"}],
    "count_aktiv": 1,
    "count_gesamt": 1,
}


def _make_transport(routes: dict) -> httpx.AsyncBaseTransport:
    """Erstellt einen Transport der per laengstem-Pfad-Match antwortet."""
    _r = routes

    class _T(httpx.AsyncBaseTransport):
        async def handle_async_request(self, req: httpx.Request) -> httpx.Response:
            path = req.url.path
            best = None
            for fragment, (status, body) in _r.items():
                if path.startswith(fragment):
                    if best is None or len(fragment) > len(best[0]):
                        best = (fragment, status, body)
            if best:
                return httpx.Response(
                    best[1],
                    headers={"content-type": "application/json"},
                    content=json.dumps(best[2]).encode(),
                )
            return httpx.Response(404, content=b'{"detail":"not found"}')

    return _T()


def _patch_client(monkeypatch, transport: httpx.AsyncBaseTransport) -> None:
    """Patcht httpx.AsyncClient.__init__ (nicht die Klasse selbst, kein Rekursionsproblem)."""
    _original_init = httpx.AsyncClient.__init__
    _t = transport

    def _new_init(self, **kwargs):
        kwargs["transport"] = _t
        _original_init(self, **kwargs)

    monkeypatch.setattr(httpx.AsyncClient, "__init__", _new_init)


DEFAULT_ROUTES = {
    "/api/health": (200, HEALTH_RESP),
    "/api/findings": (200, FINDINGS_RESP),
    "/api/regeln/r1": (200, REGEL_DETAIL),   # laengerer Match gewinnt
    "/api/regeln": (200, REGELN_RESP),
    "/api/engine/status": (200, ENGINE_STATUS_RESP),
}


@pytest.fixture()
def patched_client(settings_store, monkeypatch):
    """TestClient mit gemocktem Custos-Service."""
    _patch_client(monkeypatch, _make_transport(DEFAULT_ROUTES))
    app = create_app(settings_store=settings_store, enable_pipeline=False)
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c


# ─── Tests ────────────────────────────────────────────────────────────────────

def test_health_endpoint(patched_client):
    """GET /api/v1/custos/health liefert 200."""
    resp = patched_client.get("/api/v1/custos/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"


def test_findings_endpoint(patched_client):
    """GET /api/v1/custos/findings liefert Findings-Liste."""
    resp = patched_client.get("/api/v1/custos/findings")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    assert data[0]["regel_id"] == "r1"


def test_findings_severity_param(patched_client):
    """GET /api/v1/custos/findings?severity=CRIT wird weitergeleitet."""
    resp = patched_client.get("/api/v1/custos/findings?severity=CRIT")
    assert resp.status_code == 200


def test_rules_endpoint(patched_client):
    """GET /api/v1/custos/rules liefert Regeln-Liste."""
    resp = patched_client.get("/api/v1/custos/rules")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert data[0]["id"] == "r1"


def test_rule_last_run_endpoint(patched_client):
    """GET /api/v1/custos/rules/r1/last-run liefert Regel-Detail mit letzter_lauf."""
    resp = patched_client.get("/api/v1/custos/rules/r1/last-run")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == "r1"
    assert data["letzter_lauf"] is not None


def test_audit_endpoint(patched_client):
    """GET /api/v1/custos/audit liefert Engine-Status."""
    resp = patched_client.get("/api/v1/custos/audit")
    assert resp.status_code == 200
    data = resp.json()
    assert "regeln" in data
    assert data["count_aktiv"] == 1


def test_audit_limit_param(patched_client):
    """GET /api/v1/custos/audit?limit=1 schneidet auf max 1 Regel."""
    resp = patched_client.get("/api/v1/custos/audit?limit=1")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["regeln"]) <= 1


def test_health_502_when_custos_down(settings_store, monkeypatch):
    """GET /api/v1/custos/health liefert 502 wenn Custos nicht erreichbar."""
    class _DownTransport(httpx.AsyncBaseTransport):
        async def handle_async_request(self, req):
            raise httpx.ConnectError("refused")

    _patch_client(monkeypatch, _DownTransport())
    app = create_app(settings_store=settings_store, enable_pipeline=False)
    with TestClient(app, raise_server_exceptions=False) as c:
        resp = c.get("/api/v1/custos/health")
    assert resp.status_code == 502
