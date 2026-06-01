"""
Tests fuer den qnapbackup-Adapter (echter HTTP-Code gegen MockTransport).
Loest die alten Stub-Tests ab (Adapter ruft jetzt GET /api/v1/status ab).
"""
from __future__ import annotations

import json

import httpx
import pytest

from moag.adapters import qnapbackup


class _MockTransport(httpx.AsyncBaseTransport):
    def __init__(self, routes: dict[str, tuple[int, object]]):
        self.routes = routes

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path
        for fragment, (status, body) in self.routes.items():
            if path.startswith(fragment):
                content = json.dumps(body).encode() if not isinstance(body, bytes) else body
                return httpx.Response(status, headers={"content-type": "application/json"}, content=content)
        return httpx.Response(404, content=b'{"detail": "not found"}')


def _patch_httpx(monkeypatch, transport: httpx.AsyncBaseTransport):
    original_cls = httpx.AsyncClient

    class _PatchedClient(httpx.AsyncClient):
        def __init__(self, **kwargs):
            kwargs["transport"] = transport
            original_cls.__init__(self, **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", _PatchedClient)


@pytest.mark.asyncio
async def test_qnapbackup_status_ok(monkeypatch):
    body = {
        "ok": True,
        "score": 88,
        "summary": "qnapbackup: 5/5 Shares aktuell",
        "metrics": {"shares_ok": 5, "shares_total": 5, "disk_free_gb": 1200.5, "nested": {"x": 1}},
        "fetched_at": "2026-06-01T20:00:00Z",
    }
    _patch_httpx(monkeypatch, _MockTransport({"/api/v1/status": (200, body)}))

    st = await qnapbackup.get_status(base_url="http://qnap-mock:9000")
    assert st.system_id == "qnapbackup"
    assert st.ok is True
    assert st.score == 88
    assert "Shares" in st.summary
    # skalare Upstream-Metriken uebernommen, nested rausgefiltert, latency_ms ergaenzt
    assert st.metrics["shares_ok"] == 5
    assert "nested" not in st.metrics
    assert "latency_ms" in st.metrics


@pytest.mark.asyncio
async def test_qnapbackup_http_error(monkeypatch):
    _patch_httpx(monkeypatch, _MockTransport({"/api/v1/status": (503, {"detail": "down"})}))
    st = await qnapbackup.get_status(base_url="http://qnap-mock:9000")
    assert st.ok is False
    assert st.score == 0
    assert "503" in (st.error or "")


@pytest.mark.asyncio
async def test_qnapbackup_unreachable(monkeypatch):
    class _BoomTransport(httpx.AsyncBaseTransport):
        async def handle_async_request(self, request):
            raise httpx.ConnectError("connection refused")

    _patch_httpx(monkeypatch, _BoomTransport())
    st = await qnapbackup.get_status(base_url="http://qnap-mock:9000")
    assert st.system_id == "qnapbackup"
    assert st.ok is False
    assert st.score == 0
    assert "nicht erreichbar" in st.summary
