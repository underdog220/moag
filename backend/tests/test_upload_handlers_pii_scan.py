"""Tests fuer Upload-Handler: pii.scan

Szenarien:
  - Normaler Pfad: TXT → pii/detect → completed mit Findings-Summary
  - Keine Findings → Summary "Keine PII-Findings"
  - Response als direkte Liste (nicht Dict) → korrekt verarbeitet
  - PDF-Datei: Soft-Fail wenn pypdf nicht da
  - Oberon ConnectError → failed
  - Oberon HTTP 503 → failed mit status_code
  - Top-3-Typen in Summary korrekt
"""
from __future__ import annotations

import httpx
import pytest

from moag.upload.schemas import UploadResult


def _pii_findings(*types: str) -> dict:
    """Erstellt eine simulierte Oberon PII-Detect-Antwort."""
    findings = [{"type": t, "value": "****", "start": 0, "end": 5} for t in types]
    return {"findings": findings, "total": len(findings)}


def _make_transport(handler):
    return httpx.MockTransport(handler)


@pytest.mark.asyncio
async def test_pii_scan_completed_with_findings(monkeypatch):
    """TXT-Datei → PII-Findings → completed mit Summary."""
    def handler(req: httpx.Request) -> httpx.Response:
        if "/pii/detect" in str(req.url):
            return httpx.Response(200, json=_pii_findings("EMAIL", "IBAN", "PHONE", "EMAIL"))
        return httpx.Response(404)

    transport = _make_transport(handler)

    import moag.upload.handlers.pii_scan as _mod
    original_client = _mod.httpx.Client

    def mock_client(**kwargs):
        return original_client(transport=transport, **{k: v for k, v in kwargs.items() if k not in ("transport", "base_url")})

    monkeypatch.setattr(_mod.httpx, "Client", mock_client)
    monkeypatch.setenv("MOAG_OBERON_TOKEN", "tok")
    monkeypatch.setenv("MOAG_OBERON_BASE_URL", "http://mock-oberon")

    result = await _mod.handle_pii_scan(
        upload_id="pii-01",
        file_bytes=b"Kontakt: max@example.com IBAN DE89 3704...",
        mime="text/plain",
        params={},
    )

    assert result.status == "completed"
    assert result.operation == "pii.scan"
    assert result.result_summary is not None
    assert "4" in result.result_summary  # 4 Findings
    assert "EMAIL" in result.result_summary
    assert result.result_payload["total"] == 4
    assert len(result.result_payload["findings"]) == 4


@pytest.mark.asyncio
async def test_pii_scan_keine_findings(monkeypatch):
    """Keine PII-Findings → Summary 'Keine PII-Findings'."""
    def handler(req: httpx.Request) -> httpx.Response:
        if "/pii/detect" in str(req.url):
            return httpx.Response(200, json={"findings": [], "total": 0})
        return httpx.Response(404)

    transport = _make_transport(handler)

    import moag.upload.handlers.pii_scan as _mod
    original_client = _mod.httpx.Client

    def mock_client(**kwargs):
        return original_client(transport=transport, **{k: v for k, v in kwargs.items() if k not in ("transport", "base_url")})

    monkeypatch.setattr(_mod.httpx, "Client", mock_client)
    monkeypatch.setenv("MOAG_OBERON_BASE_URL", "http://mock-oberon")

    result = await _mod.handle_pii_scan(
        upload_id="pii-02",
        file_bytes=b"Sauberer Text ohne personenbezogene Daten.",
        mime="text/plain",
        params={},
    )

    assert result.status == "completed"
    assert "keine" in result.result_summary.lower() or "0" in result.result_summary


@pytest.mark.asyncio
async def test_pii_scan_response_als_liste(monkeypatch):
    """Oberon antwortet direkt mit einer Liste (kein Dict-Wrapper)."""
    direct_list = [
        {"type": "NAME", "value": "Max Mustermann"},
        {"type": "PHONE", "value": "+49 123 456"},
    ]

    def handler(req: httpx.Request) -> httpx.Response:
        if "/pii/detect" in str(req.url):
            return httpx.Response(200, json=direct_list)
        return httpx.Response(404)

    transport = _make_transport(handler)

    import moag.upload.handlers.pii_scan as _mod
    original_client = _mod.httpx.Client

    def mock_client(**kwargs):
        return original_client(transport=transport, **{k: v for k, v in kwargs.items() if k not in ("transport", "base_url")})

    monkeypatch.setattr(_mod.httpx, "Client", mock_client)
    monkeypatch.setenv("MOAG_OBERON_BASE_URL", "http://mock-oberon")

    result = await _mod.handle_pii_scan(
        upload_id="pii-03",
        file_bytes=b"Max Mustermann, Telefon: +49 123 456",
        mime="text/plain",
        params={},
    )

    assert result.status == "completed"
    assert result.result_payload["total"] == 2
    assert "2" in result.result_summary


@pytest.mark.asyncio
async def test_pii_scan_top3_typen_in_summary(monkeypatch):
    """Mehr als 3 Typen → nur Top-3 in Summary, '...' am Ende."""
    many_types = ["EMAIL"] * 5 + ["IBAN"] * 3 + ["PHONE"] * 2 + ["NAME"] * 1 + ["ADDRESS"] * 1

    def handler(req: httpx.Request) -> httpx.Response:
        if "/pii/detect" in str(req.url):
            findings = [{"type": t} for t in many_types]
            return httpx.Response(200, json={"findings": findings})
        return httpx.Response(404)

    transport = _make_transport(handler)

    import moag.upload.handlers.pii_scan as _mod
    original_client = _mod.httpx.Client

    def mock_client(**kwargs):
        return original_client(transport=transport, **{k: v for k, v in kwargs.items() if k not in ("transport", "base_url")})

    monkeypatch.setattr(_mod.httpx, "Client", mock_client)
    monkeypatch.setenv("MOAG_OBERON_BASE_URL", "http://mock-oberon")

    result = await _mod.handle_pii_scan(
        upload_id="pii-04",
        file_bytes=b"Viele PII-Daten...",
        mime="text/markdown",
        params={},
    )

    assert result.status == "completed"
    assert "..." in result.result_summary  # > 3 Typen
    assert "EMAIL" in result.result_summary  # Haeufigster Typ
    assert result.result_payload["total"] == len(many_types)


@pytest.mark.asyncio
async def test_pii_scan_pdf_kein_pypdf(monkeypatch):
    """PDF-Upload wenn pypdf nicht installiert → failed mit Hinweis."""
    import moag.upload.handlers.pii_scan as _mod

    original_extract = _mod._extract_text

    def mock_extract(file_bytes, mime):
        if mime == "application/pdf":
            return None, "PDF-Extraktion nicht verfuegbar — pypdf ist nicht installiert."
        return original_extract(file_bytes, mime)

    monkeypatch.setattr(_mod, "_extract_text", mock_extract)
    monkeypatch.setenv("MOAG_OBERON_BASE_URL", "http://mock-oberon")

    result = await _mod.handle_pii_scan(
        upload_id="pii-05",
        file_bytes=b"%PDF-fake",
        mime="application/pdf",
        params={},
    )

    assert result.status == "failed"
    assert "pypdf" in (result.error or "").lower() or "pdf" in (result.error or "").lower()


@pytest.mark.asyncio
async def test_pii_scan_oberon_down(monkeypatch):
    """ConnectError → failed."""
    def handler(req: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused")

    transport = _make_transport(handler)

    import moag.upload.handlers.pii_scan as _mod
    original_client = _mod.httpx.Client

    def mock_client(**kwargs):
        return original_client(transport=transport, **{k: v for k, v in kwargs.items() if k not in ("transport", "base_url")})

    monkeypatch.setattr(_mod.httpx, "Client", mock_client)
    monkeypatch.setenv("MOAG_OBERON_BASE_URL", "http://mock-oberon")

    result = await _mod.handle_pii_scan(
        upload_id="pii-06",
        file_bytes=b"Text",
        mime="text/plain",
        params={},
    )

    assert result.status == "failed"
    assert result.error is not None


@pytest.mark.asyncio
async def test_pii_scan_http_503(monkeypatch):
    """HTTP 503 → failed mit status_code."""
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(503, text="Service Unavailable")

    transport = _make_transport(handler)

    import moag.upload.handlers.pii_scan as _mod
    original_client = _mod.httpx.Client

    def mock_client(**kwargs):
        return original_client(transport=transport, **{k: v for k, v in kwargs.items() if k not in ("transport", "base_url")})

    monkeypatch.setattr(_mod.httpx, "Client", mock_client)
    monkeypatch.setenv("MOAG_OBERON_BASE_URL", "http://mock-oberon")

    result = await _mod.handle_pii_scan(
        upload_id="pii-07",
        file_bytes=b"Text",
        mime="text/plain",
        params={},
    )

    assert result.status == "failed"
    assert result.result_payload.get("status_code") == 503


def test_pii_scan_registriert():
    """Handler ist in der Registry unter 'pii.scan' registriert."""
    from moag.upload.handlers import registry
    import moag.upload.handlers.pii_scan  # noqa: F401

    assert "pii.scan" in registry.HANDLERS
