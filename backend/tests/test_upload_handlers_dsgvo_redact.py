"""
Tests für dsgvo.redact Upload-Handler.

Testet:
- Happy-Path sync (?wait=true → 200): direkt completed
- Async-Pattern: 202 → Polling → COMPLETED → Download → completed
- Async-Pattern: 202 → Polling → FAILED → failed
- Async Timeout: Polling-Loop läuft ab → failed mit Timeout-Meldung
- Oberon-Down: ConnectError → failed
- HTTP-Fehler (4xx/5xx) → failed
"""
from __future__ import annotations

import time
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

import httpx
import pytest

import moag.upload.handlers.dsgvo_redact as _mod
from moag.upload.schemas import UploadResult


# ── Hilfsfunktionen ────────────────────────────────────────────────────────────

_PDF_BYTES = b"%PDF-1.4\n1 0 obj\n<</Type /Catalog>>\nendobj\nxref\n0 1\n0000000000 65535 f \ntrailer\n<</Size 1 /Root 1 0 R>>\nstartxref\n9\n%%EOF"
_REDACTED_PDF = b"%PDF-1.4\n% REDACTED\n%%EOF"

_JOB_ID = "test-job-abc-123"

_JOB_RUNNING = {"jobId": _JOB_ID, "status": "RUNNING"}
_JOB_COMPLETED = {"jobId": _JOB_ID, "status": "COMPLETED", "redactionsCount": 7}
_JOB_FAILED = {"jobId": _JOB_ID, "status": "FAILED", "errorMessage": "Extraktion fehlgeschlagen"}


# ── Sync-Tests ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_dsgvo_redact_sync_200(monkeypatch, tmp_path):
    """Oberon antwortet sync mit 200 → completed, Artifact gespeichert."""
    monkeypatch.setenv("MOAG_OBERON_BASE_URL", "http://mock-oberon")
    monkeypatch.setenv("MOAG_OBERON_TOKEN", "test-token")
    monkeypatch.setenv("MOAG_UPLOAD_DIR", str(tmp_path))
    # UPLOAD_DIR im Modul auf tmp_path zeigen lassen
    monkeypatch.setattr(_mod, "UPLOAD_DIR", tmp_path)

    def handler(req: httpx.Request) -> httpx.Response:
        if "/api/v2/dsgvo/document/redact" in str(req.url) and req.method == "POST":
            # Sync-Antwort simulieren
            return httpx.Response(
                200,
                content=_REDACTED_PDF,
                headers={"Content-Type": "application/pdf"},
            )
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    original_client_cls = _mod.httpx.Client

    def mock_client(**kwargs):
        return original_client_cls(transport=transport, **{k: v for k, v in kwargs.items() if k != "transport"})

    monkeypatch.setattr(_mod.httpx, "Client", mock_client)

    result = await _mod.handle_dsgvo_redact(
        upload_id="upload-sync-001",
        file_bytes=_PDF_BYTES,
        mime="application/pdf",
        params={},
    )

    assert isinstance(result, UploadResult)
    assert result.status == "completed"
    assert result.operation == "dsgvo.redact"
    assert result.artifact_url == "/api/v1/uploads/upload-sync-001/artifact"
    assert result.artifact_mime == "application/pdf"
    assert result.error is None
    assert "anonymisiert" in result.result_summary

    # Artifact muss auf dem Filesystem liegen
    artifact_file = tmp_path / "upload-sync-001.redacted.pdf"
    assert artifact_file.exists()
    assert artifact_file.read_bytes() == _REDACTED_PDF


@pytest.mark.asyncio
async def test_dsgvo_redact_async_202_polling_completed(monkeypatch, tmp_path):
    """202 → Polling → COMPLETED → Download → completed."""
    monkeypatch.setenv("MOAG_OBERON_BASE_URL", "http://mock-oberon")
    monkeypatch.setenv("MOAG_OBERON_TOKEN", "test-token")
    monkeypatch.setattr(_mod, "UPLOAD_DIR", tmp_path)

    # Zustandsmaschine: erster Poll=RUNNING, zweiter=COMPLETED
    poll_count = [0]

    def handler(req: httpx.Request) -> httpx.Response:
        url = str(req.url)
        method = req.method

        # Initialer POST → 202
        if "/api/v2/dsgvo/document/redact" in url and method == "POST" and f"/{_JOB_ID}" not in url:
            return httpx.Response(202, json={
                "jobId": _JOB_ID,
                "statusUrl": f"/api/v2/dsgvo/document/redact/{_JOB_ID}",
                "status": "RUNNING",
            })

        # Status-GET
        if f"/api/v2/dsgvo/document/redact/{_JOB_ID}" in url and method == "GET" and "/download" not in url:
            poll_count[0] += 1
            if poll_count[0] == 1:
                return httpx.Response(200, json=_JOB_RUNNING)
            return httpx.Response(200, json=_JOB_COMPLETED)

        # Download-GET
        if f"/api/v2/dsgvo/document/redact/{_JOB_ID}/download" in url and method == "GET":
            return httpx.Response(200, content=_REDACTED_PDF,
                                  headers={"Content-Type": "application/pdf"})

        return httpx.Response(404, text=f"not found: {url}")

    transport = httpx.MockTransport(handler)
    original_client_cls = _mod.httpx.Client

    def mock_client(**kwargs):
        return original_client_cls(transport=transport, **{k: v for k, v in kwargs.items() if k != "transport"})

    monkeypatch.setattr(_mod.httpx, "Client", mock_client)
    # Polling-Interval auf 0 setzen damit Test nicht wartet
    monkeypatch.setattr(_mod, "POLL_INTERVAL_S", 0.01)

    result = await _mod.handle_dsgvo_redact(
        upload_id="upload-async-001",
        file_bytes=_PDF_BYTES,
        mime="application/pdf",
        params={},
    )

    assert result.status == "completed"
    assert result.artifact_url == "/api/v1/uploads/upload-async-001/artifact"
    assert result.artifact_mime == "application/pdf"
    assert result.error is None
    assert "7 Stellen" in result.result_summary

    artifact_file = tmp_path / "upload-async-001.redacted.pdf"
    assert artifact_file.exists()
    assert poll_count[0] >= 2


@pytest.mark.asyncio
async def test_dsgvo_redact_async_202_polling_failed(monkeypatch, tmp_path):
    """202 → Polling → FAILED → failed mit Fehlermeldung."""
    monkeypatch.setenv("MOAG_OBERON_BASE_URL", "http://mock-oberon")
    monkeypatch.setattr(_mod, "UPLOAD_DIR", tmp_path)

    def handler(req: httpx.Request) -> httpx.Response:
        url = str(req.url)
        method = req.method

        if "/api/v2/dsgvo/document/redact" in url and method == "POST" and f"/{_JOB_ID}" not in url:
            return httpx.Response(202, json={
                "jobId": _JOB_ID,
                "statusUrl": f"/api/v2/dsgvo/document/redact/{_JOB_ID}",
                "status": "RUNNING",
            })

        if f"/api/v2/dsgvo/document/redact/{_JOB_ID}" in url and method == "GET" and "/download" not in url:
            return httpx.Response(200, json=_JOB_FAILED)

        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    original_client_cls = _mod.httpx.Client

    def mock_client(**kwargs):
        return original_client_cls(transport=transport, **{k: v for k, v in kwargs.items() if k != "transport"})

    monkeypatch.setattr(_mod.httpx, "Client", mock_client)
    monkeypatch.setattr(_mod, "POLL_INTERVAL_S", 0.01)

    result = await _mod.handle_dsgvo_redact(
        upload_id="upload-async-fail",
        file_bytes=_PDF_BYTES,
        mime="application/pdf",
        params={},
    )

    assert result.status == "failed"
    assert result.error is not None
    assert "FAILED" in result.error or "fehlgeschlagen" in result.error.lower()


@pytest.mark.asyncio
async def test_dsgvo_redact_async_timeout(monkeypatch, tmp_path):
    """202 → Polling immer RUNNING → Timeout → failed."""
    monkeypatch.setenv("MOAG_OBERON_BASE_URL", "http://mock-oberon")
    monkeypatch.setattr(_mod, "UPLOAD_DIR", tmp_path)
    # Sehr kurzes Timeout damit der Test schnell abläuft
    monkeypatch.setattr(_mod, "POLL_TIMEOUT_S", 0.05)
    monkeypatch.setattr(_mod, "POLL_INTERVAL_S", 0.01)

    def handler(req: httpx.Request) -> httpx.Response:
        url = str(req.url)
        method = req.method

        if "/api/v2/dsgvo/document/redact" in url and method == "POST" and f"/{_JOB_ID}" not in url:
            return httpx.Response(202, json={
                "jobId": _JOB_ID,
                "statusUrl": f"/api/v2/dsgvo/document/redact/{_JOB_ID}",
                "status": "RUNNING",
            })

        # Immer RUNNING zurückgeben
        if f"/api/v2/dsgvo/document/redact/{_JOB_ID}" in url and method == "GET":
            return httpx.Response(200, json=_JOB_RUNNING)

        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    original_client_cls = _mod.httpx.Client

    def mock_client(**kwargs):
        return original_client_cls(transport=transport, **{k: v for k, v in kwargs.items() if k != "transport"})

    monkeypatch.setattr(_mod.httpx, "Client", mock_client)

    result = await _mod.handle_dsgvo_redact(
        upload_id="upload-timeout",
        file_bytes=_PDF_BYTES,
        mime="application/pdf",
        params={},
    )

    assert result.status == "failed"
    assert "Timeout" in result.error or "timeout" in result.error.lower()
    assert _JOB_ID in result.error


@pytest.mark.asyncio
async def test_dsgvo_redact_oberon_down(monkeypatch, tmp_path):
    """Oberon nicht erreichbar → failed mit Fehlermeldung."""
    monkeypatch.setenv("MOAG_OBERON_BASE_URL", "http://mock-oberon")
    monkeypatch.setattr(_mod, "UPLOAD_DIR", tmp_path)

    def handler(req: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("Connection refused")

    transport = httpx.MockTransport(handler)
    original_client_cls = _mod.httpx.Client

    def mock_client(**kwargs):
        return original_client_cls(transport=transport, **{k: v for k, v in kwargs.items() if k != "transport"})

    monkeypatch.setattr(_mod.httpx, "Client", mock_client)

    result = await _mod.handle_dsgvo_redact(
        upload_id="upload-down",
        file_bytes=_PDF_BYTES,
        mime="application/pdf",
        params={},
    )

    assert result.status == "failed"
    assert result.error is not None
    assert "nicht erreichbar" in result.error.lower() or "oberon" in result.error.lower()


@pytest.mark.asyncio
async def test_dsgvo_redact_http_503(monkeypatch, tmp_path):
    """Oberon HTTP 503 → failed."""
    monkeypatch.setenv("MOAG_OBERON_BASE_URL", "http://mock-oberon")
    monkeypatch.setattr(_mod, "UPLOAD_DIR", tmp_path)

    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(503, json={"error": "DSGVO deaktiviert"})

    transport = httpx.MockTransport(handler)
    original_client_cls = _mod.httpx.Client

    def mock_client(**kwargs):
        return original_client_cls(transport=transport, **{k: v for k, v in kwargs.items() if k != "transport"})

    monkeypatch.setattr(_mod.httpx, "Client", mock_client)

    result = await _mod.handle_dsgvo_redact(
        upload_id="upload-503",
        file_bytes=_PDF_BYTES,
        mime="application/pdf",
        params={},
    )

    assert result.status == "failed"
    assert "503" in result.error


@pytest.mark.asyncio
async def test_dsgvo_redact_image_png(monkeypatch, tmp_path):
    """PNG-Eingabe (kein PDF) wird korrekt verarbeitet → sync completed."""
    monkeypatch.setenv("MOAG_OBERON_BASE_URL", "http://mock-oberon")
    monkeypatch.setattr(_mod, "UPLOAD_DIR", tmp_path)

    def handler(req: httpx.Request) -> httpx.Response:
        if "/api/v2/dsgvo/document/redact" in str(req.url) and req.method == "POST":
            return httpx.Response(
                200,
                content=_REDACTED_PDF,
                headers={"Content-Type": "application/pdf"},
            )
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    original_client_cls = _mod.httpx.Client

    def mock_client(**kwargs):
        return original_client_cls(transport=transport, **{k: v for k, v in kwargs.items() if k != "transport"})

    monkeypatch.setattr(_mod.httpx, "Client", mock_client)

    png_bytes = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100

    result = await _mod.handle_dsgvo_redact(
        upload_id="upload-png-001",
        file_bytes=png_bytes,
        mime="image/png",
        params={},
    )

    assert result.status == "completed"
    assert result.artifact_mime == "application/pdf"
    assert result.artifact_url is not None


def test_dsgvo_redact_handler_registered():
    """Handler ist in der Registry eingetragen."""
    from moag.upload.handlers.registry import HANDLERS
    assert "dsgvo.redact" in HANDLERS
    assert HANDLERS["dsgvo.redact"] is _mod.handle_dsgvo_redact
