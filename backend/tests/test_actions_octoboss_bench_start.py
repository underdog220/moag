"""
Tests fuer octoboss.bench.start Aktion.
"""
from __future__ import annotations

import httpx
import pytest

from moag.schemas import ActionTriggerResponse


@pytest.mark.asyncio
async def test_bench_start_started(monkeypatch):
    """Mocked OctoBoss-Antwort -> Aktion liefert status=started mit job_id."""
    def handler(req: httpx.Request) -> httpx.Response:
        if "/jobs/submit" in str(req.url):
            return httpx.Response(200, json={
                "job_id": "bench-job-42",
                "target_node_id": "node-alpha",
                "status": "queued",
            })
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient

    monkeypatch.setattr(
        httpx, "AsyncClient",
        lambda **kw: real_client(transport=transport, **{k: v for k, v in kw.items() if k != "transport"}),
    )
    monkeypatch.setenv("MOAG_OCTOBOSS_BASE_URL", "http://mock-octoboss")

    from moag.actions.octoboss_bench_start import handle_octoboss_bench_start
    result = await handle_octoboss_bench_start({})

    assert isinstance(result, ActionTriggerResponse)
    assert result.action_id == "octoboss.bench.start"
    assert result.status == "started"
    assert result.payload["job_id"] == "bench-job-42"
    assert result.payload["target_node_id"] == "node-alpha"
    assert result.result_summary is not None
    assert "bench-job-42" in result.result_summary


@pytest.mark.asyncio
async def test_bench_start_custom_prompt(monkeypatch):
    """Body mit custom prompt wird an Hub uebergeben."""
    received_body: dict = {}

    def handler(req: httpx.Request) -> httpx.Response:
        if "/jobs/submit" in str(req.url):
            import json
            received_body.update(json.loads(req.content))
            return httpx.Response(200, json={"job_id": "j1"})
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient

    monkeypatch.setattr(
        httpx, "AsyncClient",
        lambda **kw: real_client(transport=transport, **{k: v for k, v in kw.items() if k != "transport"}),
    )
    monkeypatch.setenv("MOAG_OCTOBOSS_BASE_URL", "http://mock-octoboss")

    from moag.actions.octoboss_bench_start import handle_octoboss_bench_start
    result = await handle_octoboss_bench_start({"prompt": "Hallo Welt!", "target_node_id": "n42"})

    assert result.status == "started"
    # Neue Nested-Struktur: {"workload": {"workload_type": ..., "params": {...}}, ...}
    workload = received_body.get("workload", {})
    assert workload.get("workload_type") == "llm_inference"
    assert workload.get("params", {}).get("prompt") == "Hallo Welt!"
    assert workload.get("params", {}).get("target_node_id") == "n42"


@pytest.mark.asyncio
async def test_bench_start_hub_error(monkeypatch):
    """Hub antwortet HTTP 503 -> status=failed."""
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(503, json={"detail": "service unavailable"})

    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient

    monkeypatch.setattr(
        httpx, "AsyncClient",
        lambda **kw: real_client(transport=transport, **{k: v for k, v in kw.items() if k != "transport"}),
    )
    monkeypatch.setenv("MOAG_OCTOBOSS_BASE_URL", "http://mock-octoboss")

    from moag.actions.octoboss_bench_start import handle_octoboss_bench_start
    result = await handle_octoboss_bench_start({})

    assert result.status == "failed"
    assert result.error is not None
    assert "503" in result.error


@pytest.mark.asyncio
async def test_bench_start_unreachable(monkeypatch):
    """OctoBoss nicht erreichbar -> status=failed."""
    def handler(req: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused")

    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient

    monkeypatch.setattr(
        httpx, "AsyncClient",
        lambda **kw: real_client(transport=transport, **{k: v for k, v in kw.items() if k != "transport"}),
    )
    monkeypatch.setenv("MOAG_OCTOBOSS_BASE_URL", "http://mock-octoboss")

    from moag.actions.octoboss_bench_start import handle_octoboss_bench_start
    result = await handle_octoboss_bench_start({})

    assert result.status == "failed"
    assert result.error is not None


@pytest.mark.asyncio
async def test_bench_start_no_job_id_in_response(monkeypatch):
    """Hub antwortet ohne job_id -> Aktion ist trotzdem started, job_id=None."""
    def handler(req: httpx.Request) -> httpx.Response:
        if "/jobs/submit" in str(req.url):
            return httpx.Response(200, json={"status": "accepted"})
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient

    monkeypatch.setattr(
        httpx, "AsyncClient",
        lambda **kw: real_client(transport=transport, **{k: v for k, v in kw.items() if k != "transport"}),
    )
    monkeypatch.setenv("MOAG_OCTOBOSS_BASE_URL", "http://mock-octoboss")

    from moag.actions.octoboss_bench_start import handle_octoboss_bench_start
    result = await handle_octoboss_bench_start({})

    assert result.status == "started"
    assert result.payload["job_id"] is None
