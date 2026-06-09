"""
Tests fuer den Panopticor-Adapter (HTTP gegen MockTransport — kein echter Netzcall).
Deckt Erfolgs- und Fehlerfall ab. Loest die alten Stub-Tests ab.
"""
from __future__ import annotations

import json

import httpx
import pytest

from moag.adapters import panopticor


class _MockTransport(httpx.AsyncBaseTransport):
    def __init__(self, routes: dict[str, tuple[int, object]]):
        self.routes = routes

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path
        for fragment, (status, body) in self.routes.items():
            if path.startswith(fragment):
                content = json.dumps(body).encode() if not isinstance(body, bytes) else body
                return httpx.Response(
                    status,
                    headers={"content-type": "application/json"},
                    content=content,
                )
        return httpx.Response(404, content=b'{"detail": "not found"}')


def _patch_httpx(monkeypatch, transport: httpx.AsyncBaseTransport):
    original_cls = httpx.AsyncClient

    class _PatchedClient(httpx.AsyncClient):
        def __init__(self, **kwargs):
            kwargs["transport"] = transport
            original_cls.__init__(self, **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", _PatchedClient)


# ─── Typsicheres Beispiel-Response (spiegelt echten /status-Response) ─────────

_MOCK_RESPONSE_OK = {
    "system": "panopticor",
    "ok": True,
    "score": 1.0,
    "summary": "Bridge v0.10.0 | runfaehig | 0 aktive Runs | KI-Eval enabled (oberon) | letzter Run task-simulated-smoke: good/ready",
    "metrics": {
        "projectVersion": "0.10.0",
        "activeRuns": 0,
        "maxConcurrent": 4,
        "capacity": 4,
        "aiEvaluation": "enabled (oberon)",
        "canRun": True,
        "integrityFindings": 0,
    },
    "integrity": {"canRun": True, "findings": []},
    "lastRun": {
        "runId": "run-f2368431a2",
        "taskId": "task-simulated-smoke",
        "status": "completed",
        "verdict": "good",
        "releaseReadiness": "ready",
        "score": 1.0,
        "updatedAt": "2026-06-09T12:27:40.106811+00:00",
    },
    "fetchedAt": "2026-06-09T12:30:34.493372+00:00",
}

_MOCK_RESPONSE_NO_LASTRUN = {
    "system": "panopticor",
    "ok": True,
    "score": 0.75,
    "summary": "Bridge v0.10.0 | 1 aktiver Run",
    "metrics": {
        "projectVersion": "0.10.0",
        "activeRuns": 1,
        "canRun": True,
        "integrityFindings": 0,
    },
    "integrity": {"canRun": True, "findings": []},
    "lastRun": None,
    "fetchedAt": "2026-06-09T13:00:00+00:00",
}


# ─── Erfolgsfall ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_status_ok(monkeypatch):
    _patch_httpx(monkeypatch, _MockTransport({"/status": (200, _MOCK_RESPONSE_OK)}))
    st = await panopticor.get_status(base_url="http://pano-mock:8787")
    assert st.system_id == "panopticor"
    assert st.ok is True
    assert st.score == 100  # score=1.0 -> 100
    assert "Bridge v0.10.0" in st.summary
    assert st.error is None


@pytest.mark.asyncio
async def test_score_scaling(monkeypatch):
    """score=1.0 -> 100, score=0.75 -> 75."""
    _patch_httpx(monkeypatch, _MockTransport({"/status": (200, _MOCK_RESPONSE_NO_LASTRUN)}))
    st = await panopticor.get_status(base_url="http://pano-mock:8787")
    assert st.score == 75


@pytest.mark.asyncio
async def test_metrics_upstream_skalare(monkeypatch):
    """Skalare Upstream-Metriken werden uebernommen."""
    _patch_httpx(monkeypatch, _MockTransport({"/status": (200, _MOCK_RESPONSE_OK)}))
    st = await panopticor.get_status(base_url="http://pano-mock:8787")
    assert st.metrics["projectVersion"] == "0.10.0"
    assert st.metrics["activeRuns"] == 0
    assert st.metrics["canRun"] is True
    assert "latency_ms" in st.metrics


@pytest.mark.asyncio
async def test_metrics_lastrun_angereichert(monkeypatch):
    """lastRun-Felder werden flach in metrics angereichert."""
    _patch_httpx(monkeypatch, _MockTransport({"/status": (200, _MOCK_RESPONSE_OK)}))
    st = await panopticor.get_status(base_url="http://pano-mock:8787")
    assert st.metrics["lastRun_runId"] == "run-f2368431a2"
    assert st.metrics["lastRun_verdict"] == "good"
    assert st.metrics["lastRun_releaseReadiness"] == "ready"
    assert st.metrics["lastRun_score"] == 1.0


@pytest.mark.asyncio
async def test_lastrun_null_kein_fehler(monkeypatch):
    """lastRun=null darf keinen Fehler ausloesen."""
    _patch_httpx(monkeypatch, _MockTransport({"/status": (200, _MOCK_RESPONSE_NO_LASTRUN)}))
    st = await panopticor.get_status(base_url="http://pano-mock:8787")
    assert st.ok is True
    assert st.error is None
    assert "lastRun_runId" not in st.metrics


# ─── Fehlerfall HTTP ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_http_error(monkeypatch):
    _patch_httpx(monkeypatch, _MockTransport({"/status": (503, {"detail": "bridge down"})}))
    st = await panopticor.get_status(base_url="http://pano-mock:8787")
    assert st.ok is False
    assert st.score == 0
    assert "503" in (st.error or "")


# ─── Fehlerfall Netzwerk ──────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_unreachable(monkeypatch):
    class _BoomTransport(httpx.AsyncBaseTransport):
        async def handle_async_request(self, request):
            raise httpx.ConnectError("connection refused")

    _patch_httpx(monkeypatch, _BoomTransport())
    st = await panopticor.get_status(base_url="http://pano-mock:8787")
    assert st.system_id == "panopticor"
    assert st.ok is False
    assert st.score == 0
    assert "nicht erreichbar" in st.summary
    assert st.error is not None
