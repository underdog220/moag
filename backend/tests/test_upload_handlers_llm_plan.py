"""Tests fuer Upload-Handler: llm.plan

Szenarien:
  - Normaler Pfad: PDF → plan/analyze → completed mit DIN-277-Summary
  - PNG-Datei → completed
  - Oberon gibt kein Flaechenfeld → Summary-Fallback
  - Oberon HTTP 405 → failed mit klarem Hinweis
  - Oberon ConnectError → failed
  - Oberon HTTP 500 → failed mit status_code
"""
from __future__ import annotations

import httpx
import pytest

from moag.upload.schemas import UploadResult

_FAKE_PDF = b"%PDF-1.4 fake content"
_FAKE_PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 20


def _plan_response_full() -> dict:
    return {
        "wohnflaeche": 87.5,
        "nutzflaeche": 112.0,
        "bgf_m2": 150.0,
        "rooms": 4,
        "summary": "Dreiraeumige Wohnung mit Balkon.",
    }


def _plan_response_minimal() -> dict:
    return {
        "summary": "Kein strukturierter Grundriss erkannt.",
    }


@pytest.mark.asyncio
async def test_llm_plan_completed_pdf(monkeypatch):
    """PDF → plan/analyze → completed mit Flaechenangaben."""
    def handler(req: httpx.Request) -> httpx.Response:
        if "/plan/analyze" in str(req.url):
            return httpx.Response(200, json=_plan_response_full())
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)

    import moag.upload.handlers.llm_plan as _mod
    original_client = _mod.httpx.Client

    def mock_client(**kwargs):
        return original_client(transport=transport, **{k: v for k, v in kwargs.items() if k not in ("transport", "base_url")})

    monkeypatch.setattr(_mod.httpx, "Client", mock_client)
    monkeypatch.setenv("MOAG_OBERON_TOKEN", "tok")
    monkeypatch.setenv("MOAG_OBERON_BASE_URL", "http://mock-oberon")

    result = await _mod.handle_llm_plan(
        upload_id="plan-01",
        file_bytes=_FAKE_PDF,
        mime="application/pdf",
        params={},
    )

    assert result.status == "completed"
    assert result.operation == "llm.plan"
    assert result.result_summary is not None
    assert "87.5" in result.result_summary  # Wohnflaeche
    assert "112.0" in result.result_summary  # Nutzflaeche
    assert result.result_payload.get("wohnflaeche") == 87.5


@pytest.mark.asyncio
async def test_llm_plan_completed_png(monkeypatch):
    """PNG → plan/analyze → completed."""
    def handler(req: httpx.Request) -> httpx.Response:
        if "/plan/analyze" in str(req.url):
            return httpx.Response(200, json=_plan_response_full())
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)

    import moag.upload.handlers.llm_plan as _mod
    original_client = _mod.httpx.Client

    def mock_client(**kwargs):
        return original_client(transport=transport, **{k: v for k, v in kwargs.items() if k not in ("transport", "base_url")})

    monkeypatch.setattr(_mod.httpx, "Client", mock_client)
    monkeypatch.setenv("MOAG_OBERON_TOKEN", "tok")
    monkeypatch.setenv("MOAG_OBERON_BASE_URL", "http://mock-oberon")

    result = await _mod.handle_llm_plan(
        upload_id="plan-02",
        file_bytes=_FAKE_PNG,
        mime="image/png",
        params={},
    )

    assert result.status == "completed"
    assert result.duration_ms is not None


@pytest.mark.asyncio
async def test_llm_plan_summary_fallback(monkeypatch):
    """Response ohne Flaechenfelder → Fallback-Summary."""
    def handler(req: httpx.Request) -> httpx.Response:
        if "/plan/analyze" in str(req.url):
            return httpx.Response(200, json=_plan_response_minimal())
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)

    import moag.upload.handlers.llm_plan as _mod
    original_client = _mod.httpx.Client

    def mock_client(**kwargs):
        return original_client(transport=transport, **{k: v for k, v in kwargs.items() if k not in ("transport", "base_url")})

    monkeypatch.setattr(_mod.httpx, "Client", mock_client)
    monkeypatch.setenv("MOAG_OBERON_BASE_URL", "http://mock-oberon")

    result = await _mod.handle_llm_plan(
        upload_id="plan-03",
        file_bytes=_FAKE_PDF,
        mime="application/pdf",
        params={},
    )

    assert result.status == "completed"
    assert result.result_summary is not None
    assert len(result.result_summary) > 0


@pytest.mark.asyncio
async def test_llm_plan_http_405(monkeypatch):
    """HTTP 405 → failed mit klarem Hinweis auf fehlenden Endpoint."""
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(405, text="Method Not Allowed")

    transport = httpx.MockTransport(handler)

    import moag.upload.handlers.llm_plan as _mod
    original_client = _mod.httpx.Client

    def mock_client(**kwargs):
        return original_client(transport=transport, **{k: v for k, v in kwargs.items() if k not in ("transport", "base_url")})

    monkeypatch.setattr(_mod.httpx, "Client", mock_client)
    monkeypatch.setenv("MOAG_OBERON_BASE_URL", "http://mock-oberon")

    result = await _mod.handle_llm_plan(
        upload_id="plan-04",
        file_bytes=_FAKE_PDF,
        mime="application/pdf",
        params={},
    )

    assert result.status == "failed"
    assert "405" in (result.error or "")


@pytest.mark.asyncio
async def test_llm_plan_oberon_down(monkeypatch):
    """ConnectError → failed."""
    def handler(req: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused")

    transport = httpx.MockTransport(handler)

    import moag.upload.handlers.llm_plan as _mod
    original_client = _mod.httpx.Client

    def mock_client(**kwargs):
        return original_client(transport=transport, **{k: v for k, v in kwargs.items() if k not in ("transport", "base_url")})

    monkeypatch.setattr(_mod.httpx, "Client", mock_client)
    monkeypatch.setenv("MOAG_OBERON_BASE_URL", "http://mock-oberon")

    result = await _mod.handle_llm_plan(
        upload_id="plan-05",
        file_bytes=_FAKE_PDF,
        mime="application/pdf",
        params={},
    )

    assert result.status == "failed"
    assert result.error is not None


@pytest.mark.asyncio
async def test_llm_plan_http_500(monkeypatch):
    """HTTP 500 → failed mit status_code."""
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(500, json={"error": "internal error"})

    transport = httpx.MockTransport(handler)

    import moag.upload.handlers.llm_plan as _mod
    original_client = _mod.httpx.Client

    def mock_client(**kwargs):
        return original_client(transport=transport, **{k: v for k, v in kwargs.items() if k not in ("transport", "base_url")})

    monkeypatch.setattr(_mod.httpx, "Client", mock_client)
    monkeypatch.setenv("MOAG_OBERON_BASE_URL", "http://mock-oberon")

    result = await _mod.handle_llm_plan(
        upload_id="plan-06",
        file_bytes=_FAKE_PDF,
        mime="application/pdf",
        params={},
    )

    assert result.status == "failed"
    assert result.result_payload.get("status_code") == 500


def test_llm_plan_registriert():
    """Handler ist in der Registry unter 'llm.plan' registriert."""
    from moag.upload.handlers import registry
    import moag.upload.handlers.llm_plan  # noqa: F401

    assert "llm.plan" in registry.HANDLERS
