"""Tests fuer Upload-Handler: llm.vision

Szenarien:
  - Normaler Pfad: PNG + Prompt → completed
  - Vision-Instance-Anlage wenn ENV nicht gesetzt → Instance POST + Vision POST
  - Fehlender Prompt → failed
  - Oberon down (ConnectError) → failed
  - Oberon HTTP 500 → failed mit status_code
  - Instance-Anlage schlaegt fehl → failed
"""
from __future__ import annotations

import base64

import httpx
import pytest

from moag.upload.schemas import UploadResult

_FAKE_PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 20  # minimal-fake PNG


def _vision_ok(response: str = "Das Bild zeigt ein Wohnzimmer.") -> dict:
    return {"response": response, "model": "claude-3-5-sonnet", "durationMs": 800}


def _instance_created() -> dict:
    return {"id": "inst-vision-001", "type": "TOPIC_FOCUS", "domain": "VISION"}


@pytest.mark.asyncio
async def test_llm_vision_completed_with_env_instance(monkeypatch):
    """ENV-Instance-ID gesetzt → kein Instance-POST, Vision-POST liefert Antwort."""
    calls: list[str] = []

    def handler(req: httpx.Request) -> httpx.Response:
        url = str(req.url)
        if "/instances/fixed-inst-id/vision" in url:
            calls.append("vision")
            return httpx.Response(200, json=_vision_ok())
        calls.append(f"unexpected:{url}")
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)

    import moag.upload.handlers.llm_vision as _mod
    # Cache leeren fuer Test-Isolation
    _mod._cached_vision_instance_id = None
    original_client = _mod.httpx.Client

    def mock_client(**kwargs):
        return original_client(transport=transport, **{k: v for k, v in kwargs.items() if k not in ("transport", "base_url")})

    monkeypatch.setattr(_mod.httpx, "Client", mock_client)
    monkeypatch.setenv("MOAG_OBERON_TOKEN", "tok")
    monkeypatch.setenv("MOAG_OBERON_BASE_URL", "http://mock-oberon")
    monkeypatch.setenv("MOAG_OBERON_VISION_INSTANCE_ID", "fixed-inst-id")

    result = await _mod.handle_llm_vision(
        upload_id="vis-01",
        file_bytes=_FAKE_PNG,
        mime="image/png",
        params={"prompt": "Was siehst du?"},
    )

    assert result.status == "completed"
    assert result.operation == "llm.vision"
    assert "Wohnzimmer" in result.result_payload["response"]
    assert result.result_payload["instance_id"] == "fixed-inst-id"
    assert "vision" in calls


@pytest.mark.asyncio
async def test_llm_vision_creates_instance_when_not_set(monkeypatch):
    """Keine ENV-Instance-ID → Instance anlegen, dann Vision aufrufen."""
    calls: list[str] = []

    def handler(req: httpx.Request) -> httpx.Response:
        url = str(req.url)
        if req.method == "POST" and url.endswith("/instances") and "/vision" not in url:
            calls.append("create_instance")
            return httpx.Response(201, json=_instance_created())
        if "/instances/inst-vision-001/vision" in url:
            calls.append("vision")
            return httpx.Response(200, json=_vision_ok("Ein Buero mit Schreibtisch."))
        calls.append(f"unexpected:{url}")
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)

    import moag.upload.handlers.llm_vision as _mod
    _mod._cached_vision_instance_id = None  # Cache leeren
    original_client = _mod.httpx.Client

    def mock_client(**kwargs):
        return original_client(transport=transport, **{k: v for k, v in kwargs.items() if k not in ("transport", "base_url")})

    monkeypatch.setattr(_mod.httpx, "Client", mock_client)
    monkeypatch.setenv("MOAG_OBERON_TOKEN", "tok")
    monkeypatch.setenv("MOAG_OBERON_BASE_URL", "http://mock-oberon")
    monkeypatch.delenv("MOAG_OBERON_VISION_INSTANCE_ID", raising=False)

    result = await _mod.handle_llm_vision(
        upload_id="vis-02",
        file_bytes=_FAKE_PNG,
        mime="image/jpeg",
        params={"prompt": "Beschreibe das Bild"},
    )

    assert result.status == "completed"
    assert "create_instance" in calls
    assert "vision" in calls
    assert _mod._cached_vision_instance_id == "inst-vision-001"


@pytest.mark.asyncio
async def test_llm_vision_prompt_fehlt(monkeypatch):
    """Kein Prompt → failed."""
    import moag.upload.handlers.llm_vision as _mod
    _mod._cached_vision_instance_id = None

    result = await _mod.handle_llm_vision(
        upload_id="vis-03",
        file_bytes=_FAKE_PNG,
        mime="image/png",
        params={},
    )

    assert result.status == "failed"
    assert "prompt" in (result.error or "").lower()


@pytest.mark.asyncio
async def test_llm_vision_oberon_down(monkeypatch):
    """ConnectError → failed."""
    def handler(req: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused")

    transport = httpx.MockTransport(handler)

    import moag.upload.handlers.llm_vision as _mod
    _mod._cached_vision_instance_id = None
    original_client = _mod.httpx.Client

    def mock_client(**kwargs):
        return original_client(transport=transport, **{k: v for k, v in kwargs.items() if k not in ("transport", "base_url")})

    monkeypatch.setattr(_mod.httpx, "Client", mock_client)
    monkeypatch.setenv("MOAG_OBERON_TOKEN", "tok")
    monkeypatch.setenv("MOAG_OBERON_BASE_URL", "http://mock-oberon")
    monkeypatch.setenv("MOAG_OBERON_VISION_INSTANCE_ID", "inst-xyz")

    result = await _mod.handle_llm_vision(
        upload_id="vis-04",
        file_bytes=_FAKE_PNG,
        mime="image/png",
        params={"prompt": "Was ist das?"},
    )

    assert result.status == "failed"
    assert result.error is not None


@pytest.mark.asyncio
async def test_llm_vision_http_500(monkeypatch):
    """HTTP 500 → failed mit status_code."""
    def handler(req: httpx.Request) -> httpx.Response:
        if "/vision" in str(req.url):
            return httpx.Response(500, json={"error": "internal"})
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)

    import moag.upload.handlers.llm_vision as _mod
    _mod._cached_vision_instance_id = None
    original_client = _mod.httpx.Client

    def mock_client(**kwargs):
        return original_client(transport=transport, **{k: v for k, v in kwargs.items() if k not in ("transport", "base_url")})

    monkeypatch.setattr(_mod.httpx, "Client", mock_client)
    monkeypatch.setenv("MOAG_OBERON_BASE_URL", "http://mock-oberon")
    monkeypatch.setenv("MOAG_OBERON_VISION_INSTANCE_ID", "inst-xyz")

    result = await _mod.handle_llm_vision(
        upload_id="vis-05",
        file_bytes=_FAKE_PNG,
        mime="image/webp",
        params={"prompt": "Beschreibe"},
    )

    assert result.status == "failed"
    assert result.result_payload.get("status_code") == 500


@pytest.mark.asyncio
async def test_llm_vision_instance_anlage_fehlschlaegt(monkeypatch):
    """Instance-POST schlaegt fehl → failed mit klarem Hinweis."""
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(503, json={"error": "service unavailable"})

    transport = httpx.MockTransport(handler)

    import moag.upload.handlers.llm_vision as _mod
    _mod._cached_vision_instance_id = None
    original_client = _mod.httpx.Client

    def mock_client(**kwargs):
        return original_client(transport=transport, **{k: v for k, v in kwargs.items() if k not in ("transport", "base_url")})

    monkeypatch.setattr(_mod.httpx, "Client", mock_client)
    monkeypatch.setenv("MOAG_OBERON_BASE_URL", "http://mock-oberon")
    monkeypatch.delenv("MOAG_OBERON_VISION_INSTANCE_ID", raising=False)

    result = await _mod.handle_llm_vision(
        upload_id="vis-06",
        file_bytes=_FAKE_PNG,
        mime="image/png",
        params={"prompt": "Beschreibe"},
    )

    assert result.status == "failed"
    assert "instance" in (result.error or "").lower() or "vision" in (result.error or "").lower()


def test_llm_vision_registriert():
    """Handler ist in der Registry unter 'llm.vision' registriert."""
    from moag.upload.handlers import registry
    import moag.upload.handlers.llm_vision  # noqa: F401

    assert "llm.vision" in registry.HANDLERS
