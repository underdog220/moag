"""
Tests fuer octoboss.ollama.pull Aktion.
"""
from __future__ import annotations

import httpx
import pytest

from moag.schemas import ActionTriggerResponse


@pytest.mark.asyncio
async def test_ollama_pull_started(monkeypatch):
    """Mocked OctoBoss-Antwort -> Aktion liefert status=started."""
    def handler(req: httpx.Request) -> httpx.Response:
        if "/seti/models/pull" in str(req.url):
            return httpx.Response(200, json={
                "status": "pulling",
                "model_tag": "llama3.2:3b",
                "nodes": ["node-alpha", "node-beta"],
            })
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient

    monkeypatch.setattr(
        httpx, "AsyncClient",
        lambda **kw: real_client(transport=transport, **{k: v for k, v in kw.items() if k != "transport"}),
    )
    monkeypatch.setenv("MOAG_OCTOBOSS_BASE_URL", "http://mock-octoboss")

    from moag.actions.octoboss_ollama_pull import handle_octoboss_ollama_pull
    result = await handle_octoboss_ollama_pull({})

    assert isinstance(result, ActionTriggerResponse)
    assert result.action_id == "octoboss.ollama.pull"
    assert result.status == "started"
    assert result.payload["model_tag"] == "llama3.2:3b"
    assert result.payload["pull_status"] == "pulling"
    assert "node-alpha" in result.payload["nodes"]
    assert result.result_summary is not None
    assert "llama3.2:3b" in result.result_summary


@pytest.mark.asyncio
async def test_ollama_pull_custom_model(monkeypatch):
    """Body mit model_tag=mistral:7b wird an Hub uebergeben."""
    received_body: dict = {}

    def handler(req: httpx.Request) -> httpx.Response:
        if "/seti/models/pull" in str(req.url):
            import json
            received_body.update(json.loads(req.content))
            return httpx.Response(200, json={"status": "pulling"})
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient

    monkeypatch.setattr(
        httpx, "AsyncClient",
        lambda **kw: real_client(transport=transport, **{k: v for k, v in kw.items() if k != "transport"}),
    )
    monkeypatch.setenv("MOAG_OCTOBOSS_BASE_URL", "http://mock-octoboss")

    from moag.actions.octoboss_ollama_pull import handle_octoboss_ollama_pull
    result = await handle_octoboss_ollama_pull({"model_tag": "mistral:7b"})

    assert result.status == "started"
    assert received_body.get("model_tag") == "mistral:7b"
    assert result.payload["model_tag"] == "mistral:7b"


@pytest.mark.asyncio
async def test_ollama_pull_with_target_node(monkeypatch):
    """target_node_id wird an Hub weitergereicht."""
    received_body: dict = {}

    def handler(req: httpx.Request) -> httpx.Response:
        if "/seti/models/pull" in str(req.url):
            import json
            received_body.update(json.loads(req.content))
            return httpx.Response(200, json={"status": "queued"})
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient

    monkeypatch.setattr(
        httpx, "AsyncClient",
        lambda **kw: real_client(transport=transport, **{k: v for k, v in kw.items() if k != "transport"}),
    )
    monkeypatch.setenv("MOAG_OCTOBOSS_BASE_URL", "http://mock-octoboss")

    from moag.actions.octoboss_ollama_pull import handle_octoboss_ollama_pull
    result = await handle_octoboss_ollama_pull({"target_node_id": "node-gamma"})

    assert result.status == "started"
    assert received_body.get("target_node_id") == "node-gamma"


@pytest.mark.asyncio
async def test_ollama_pull_hub_error(monkeypatch):
    """Hub antwortet HTTP 400 -> status=failed."""
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(400, json={"detail": "unknown model"})

    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient

    monkeypatch.setattr(
        httpx, "AsyncClient",
        lambda **kw: real_client(transport=transport, **{k: v for k, v in kw.items() if k != "transport"}),
    )
    monkeypatch.setenv("MOAG_OCTOBOSS_BASE_URL", "http://mock-octoboss")

    from moag.actions.octoboss_ollama_pull import handle_octoboss_ollama_pull
    result = await handle_octoboss_ollama_pull({})

    assert result.status == "failed"
    assert "400" in (result.error or "")


@pytest.mark.asyncio
async def test_ollama_pull_unreachable(monkeypatch):
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

    from moag.actions.octoboss_ollama_pull import handle_octoboss_ollama_pull
    result = await handle_octoboss_ollama_pull({})

    assert result.status == "failed"
    assert result.error is not None


@pytest.mark.asyncio
async def test_ollama_pull_default_model(monkeypatch):
    """Ohne model_tag im Body wird llama3.2:3b als Default genutzt."""
    received_body: dict = {}

    def handler(req: httpx.Request) -> httpx.Response:
        if "/seti/models/pull" in str(req.url):
            import json
            received_body.update(json.loads(req.content))
            return httpx.Response(200, json={"status": "pulling"})
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient

    monkeypatch.setattr(
        httpx, "AsyncClient",
        lambda **kw: real_client(transport=transport, **{k: v for k, v in kw.items() if k != "transport"}),
    )
    monkeypatch.setenv("MOAG_OCTOBOSS_BASE_URL", "http://mock-octoboss")

    from moag.actions.octoboss_ollama_pull import handle_octoboss_ollama_pull
    result = await handle_octoboss_ollama_pull({})

    assert result.status == "started"
    assert received_body.get("model_tag") == "llama3.2:3b"
