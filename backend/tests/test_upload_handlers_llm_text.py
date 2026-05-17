"""Tests fuer Upload-Handler: llm.text

Szenarien:
  - Normaler Pfad: Text-Datei + Prompt → completed mit Summary
  - PDF-Pfad: Soft-Fail wenn pypdf nicht da
  - Fehlender Prompt → failed
  - Oberon ConnectError → failed
  - Oberon HTTP 503 → failed mit status_code
"""
from __future__ import annotations

import json

import httpx
import pytest

from moag.upload.schemas import UploadResult


def _dsgvo_proxy_ok(response_text: str = "Das Dokument handelt von Testinhalten.") -> dict:
    return {
        "status": "ok",
        "response": response_text,
        "piiFound": False,
        "piiTypes": [],
        "anonymized": False,
        "routingDecision": "PROXY",
        "auditId": "test-audit-001",
        "durationMs": 420,
    }


def _make_transport(status: int, body: dict | None = None, error: Exception | None = None):
    """Erzeugt einen MockTransport fuer den DSGVO-Proxy-Endpoint."""
    def handler(req: httpx.Request) -> httpx.Response:
        if error:
            raise error
        if "/dsgvo/proxy" in str(req.url):
            return httpx.Response(status, json=body or {})
        return httpx.Response(404)

    return httpx.MockTransport(handler)


@pytest.mark.asyncio
async def test_llm_text_completed_plain(monkeypatch):
    """Plain-Text-Datei + Prompt → completed mit result_summary."""
    transport = _make_transport(200, _dsgvo_proxy_ok())

    import moag.upload.handlers.llm_text as _mod
    original_client = _mod.httpx.Client

    def mock_client(**kwargs):
        return original_client(transport=transport, **{k: v for k, v in kwargs.items() if k not in ("transport", "base_url")})

    monkeypatch.setattr(_mod.httpx, "Client", mock_client)
    monkeypatch.setenv("MOAG_OBERON_TOKEN", "tok")
    monkeypatch.setenv("MOAG_OBERON_BASE_URL", "http://mock-oberon")

    file_bytes = b"Dies ist ein Testdokument."
    result = await _mod.handle_llm_text(
        upload_id="test-id-01",
        file_bytes=file_bytes,
        mime="text/plain",
        params={"prompt": "Fasse zusammen"},
    )

    assert isinstance(result, UploadResult)
    assert result.status == "completed"
    assert result.operation == "llm.text"
    assert result.result_summary is not None
    assert len(result.result_summary) <= 200
    assert result.result_payload["pii_found"] is False
    assert result.result_payload["audit_id"] == "test-audit-001"
    assert result.duration_ms is not None


@pytest.mark.asyncio
async def test_llm_text_completed_markdown(monkeypatch):
    """Markdown-Datei → completed."""
    transport = _make_transport(200, _dsgvo_proxy_ok("Zusammenfassung des Markdown-Dokuments."))

    import moag.upload.handlers.llm_text as _mod
    original_client = _mod.httpx.Client

    def mock_client(**kwargs):
        return original_client(transport=transport, **{k: v for k, v in kwargs.items() if k not in ("transport", "base_url")})

    monkeypatch.setattr(_mod.httpx, "Client", mock_client)
    monkeypatch.setenv("MOAG_OBERON_TOKEN", "tok")
    monkeypatch.setenv("MOAG_OBERON_BASE_URL", "http://mock-oberon")

    file_bytes = b"# Titel\n\nInhalt des Dokuments."
    result = await _mod.handle_llm_text(
        upload_id="test-id-02",
        file_bytes=file_bytes,
        mime="text/markdown",
        params={"prompt": "Was steht drin?"},
    )

    assert result.status == "completed"
    assert "Zusammenfassung" in result.result_payload["response"]


@pytest.mark.asyncio
async def test_llm_text_prompt_fehlt(monkeypatch):
    """Kein Prompt → failed mit klarer Fehlermeldung."""
    import moag.upload.handlers.llm_text as _mod

    result = await _mod.handle_llm_text(
        upload_id="test-id-03",
        file_bytes=b"Inhalt",
        mime="text/plain",
        params={},
    )

    assert result.status == "failed"
    assert result.error is not None
    assert "prompt" in result.error.lower()


@pytest.mark.asyncio
async def test_llm_text_prompt_leer(monkeypatch):
    """Leerer Prompt-String → failed."""
    import moag.upload.handlers.llm_text as _mod

    result = await _mod.handle_llm_text(
        upload_id="test-id-04",
        file_bytes=b"Inhalt",
        mime="text/plain",
        params={"prompt": "   "},
    )

    assert result.status == "failed"
    assert result.error is not None


@pytest.mark.asyncio
async def test_llm_text_oberon_down(monkeypatch):
    """Oberon ConnectError → failed."""
    transport = _make_transport(0, error=httpx.ConnectError("refused"))

    import moag.upload.handlers.llm_text as _mod
    original_client = _mod.httpx.Client

    def mock_client(**kwargs):
        return original_client(transport=transport, **{k: v for k, v in kwargs.items() if k not in ("transport", "base_url")})

    monkeypatch.setattr(_mod.httpx, "Client", mock_client)
    monkeypatch.setenv("MOAG_OBERON_TOKEN", "tok")
    monkeypatch.setenv("MOAG_OBERON_BASE_URL", "http://mock-oberon")

    result = await _mod.handle_llm_text(
        upload_id="test-id-05",
        file_bytes=b"Text",
        mime="text/plain",
        params={"prompt": "Teste Oberon"},
    )

    assert result.status == "failed"
    assert result.error is not None
    assert "erreichbar" in result.error.lower() or "connect" in result.error.lower()


@pytest.mark.asyncio
async def test_llm_text_oberon_503(monkeypatch):
    """Oberon HTTP 503 → failed mit status_code im Payload."""
    transport = _make_transport(503, {"message": "Service Unavailable"})

    import moag.upload.handlers.llm_text as _mod
    original_client = _mod.httpx.Client

    def mock_client(**kwargs):
        return original_client(transport=transport, **{k: v for k, v in kwargs.items() if k not in ("transport", "base_url")})

    monkeypatch.setattr(_mod.httpx, "Client", mock_client)
    monkeypatch.setenv("MOAG_OBERON_TOKEN", "tok")
    monkeypatch.setenv("MOAG_OBERON_BASE_URL", "http://mock-oberon")

    result = await _mod.handle_llm_text(
        upload_id="test-id-06",
        file_bytes=b"Text",
        mime="text/plain",
        params={"prompt": "Analysiere"},
    )

    assert result.status == "failed"
    assert result.result_payload.get("status_code") == 503


@pytest.mark.asyncio
async def test_llm_text_pdf_kein_pypdf(monkeypatch):
    """PDF-Upload wenn pypdf nicht installiert → failed mit Hinweis."""
    import moag.upload.handlers.llm_text as _mod

    # pypdf-Import faehig machen, durch Patchen von _extract_text
    original_extract = _mod._extract_text

    def mock_extract(file_bytes, mime):
        if mime == "application/pdf":
            return None  # Soft-Fail simulieren
        return original_extract(file_bytes, mime)

    monkeypatch.setattr(_mod, "_extract_text", mock_extract)
    monkeypatch.setenv("MOAG_OBERON_BASE_URL", "http://mock-oberon")

    result = await _mod.handle_llm_text(
        upload_id="test-id-07",
        file_bytes=b"%PDF-fake",
        mime="application/pdf",
        params={"prompt": "Was steht drin?"},
    )

    assert result.status == "failed"
    assert result.error is not None
    assert "pypdf" in result.error.lower() or "pdf" in result.error.lower()


def test_llm_text_registriert():
    """Handler ist in der Registry unter 'llm.text' registriert."""
    from moag.upload.handlers import registry
    import moag.upload.handlers.llm_text  # noqa: F401 — Seiteneffekt sicherstellen

    assert "llm.text" in registry.HANDLERS
