"""
Smoke-Tests fuer ocrexpert-Adapter.
"""
from __future__ import annotations

import pytest
import httpx

from moag.adapters import ocrexpert
from moag.schemas import SystemStatus


@pytest.mark.asyncio
async def test_unreachable_returns_ok_false(monkeypatch):
    """Kein erreichbarer OCRexpert -> ok=False, score=0."""
    def handler(req: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused")

    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real_client(transport=transport, **kw))

    status = await ocrexpert.get_status(base_url="http://127.0.0.1:17820")
    assert isinstance(status, SystemStatus)
    assert status.system_id == "ocrexpert"
    assert status.ok is False
    assert status.score == 0


@pytest.mark.asyncio
async def test_reachable_healthy_no_jobs(monkeypatch):
    """OCRexpert erreichbar, keine Jobs -> ok=True, score > 0."""
    def handler(req: httpx.Request) -> httpx.Response:
        url = str(req.url)
        if "/api/health" in url:
            return httpx.Response(200, json={
                "status": "ok",
                "version": "0.7.1",
                "pipeline_ready": True,
            })
        if "/api/jobs" in url:
            return httpx.Response(200, json={
                "jobs": [],
                "total": 0,
                "filtered": 0,
            })
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real_client(transport=transport, **kw))

    status = await ocrexpert.get_status(base_url="http://127.0.0.1:17820")
    assert status.ok is True
    assert status.score > 0
    assert status.system_id == "ocrexpert"


@pytest.mark.asyncio
async def test_has_fetched_at(monkeypatch):
    def handler(req: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused")
    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real_client(transport=transport, **kw))

    status = await ocrexpert.get_status(base_url="http://127.0.0.1:17820")
    assert status.fetched_at is not None
