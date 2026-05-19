"""
Tests fuer den Upload-Handler dsgvo.visual-redact.

Testet:
  - Submit-Pfad (multipart → Oberon POST)
  - Poll-Pfad (202 → DONE → Download)
  - Download-Pfad (Content-Type application/pdf)
  - 404 → _job_lost (HTTP-410-Semantik im Result)
  - FAILED-Status
  - Timeout
  - 503-DSGVO-Gate
"""
from __future__ import annotations

import time
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import httpx
import pytest

# Import des Handlers (loest automatisch @register_handler aus)
import moag.upload.handlers.dsgvo_visual_redact as _mod
from moag.upload.handlers.dsgvo_visual_redact import (
    handle_dsgvo_visual_redact,
    POLL_INTERVAL_S,
)
from moag.upload.schemas import UploadResult


# ── Helpers ───────────────────────────────────────────────────────────────────


def _make_transport(*responses: httpx.Response) -> httpx.MockTransport:
    """Erstellt einen MockTransport der Responses der Reihe nach liefert."""
    responses_iter = iter(responses)

    def handler(req: httpx.Request) -> httpx.Response:
        return next(responses_iter)

    return httpx.MockTransport(handler)


def _dummy_pdf() -> bytes:
    """Minimale Test-Nutzlast (kein echtes PDF noetig)."""
    return b"%PDF-1.4 dummy-test-content"


# ── Tests ─────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_submit_202_then_done(monkeypatch, tmp_path):
    """202-Antwort → Polling bis DONE → Download → completed-Result."""
    monkeypatch.setenv("MOAG_OBERON_BASE_URL", "http://mock-oberon")
    monkeypatch.setenv("MOAG_OBERON_TOKEN", "test-token")
    monkeypatch.setattr(_mod, "UPLOAD_DIR", tmp_path)
    # time.sleep ueberspringen
    monkeypatch.setattr(_mod.time, "sleep", lambda _: None)

    submit_resp = httpx.Response(
        202,
        json={"jobId": "job-abc", "status": "PENDING", "statusUrl": "/api/v2/dsgvo/document/redact/job-abc"},
    )
    poll_pending = httpx.Response(200, json={"status": "RUNNING", "jobId": "job-abc"})
    poll_done = httpx.Response(200, json={"status": "DONE", "jobId": "job-abc", "redactionsCount": 3})
    download_resp = httpx.Response(
        200, content=_dummy_pdf(),
        headers={"Content-Type": "application/pdf"},
    )

    call_log: list[str] = []

    def handler(req: httpx.Request) -> httpx.Response:
        url = str(req.url)
        if req.method == "POST" and "/dsgvo/document/redact" in url and "job-abc" not in url:
            call_log.append("submit")
            return submit_resp
        if req.method == "GET" and url.endswith("/download"):
            call_log.append("download")
            return download_resp
        if req.method == "GET" and "job-abc" in url:
            call_log.append("poll")
            return poll_pending if call_log.count("poll") < 2 else poll_done
        return httpx.Response(500)

    transport = httpx.MockTransport(handler)

    original_client = _mod.httpx.Client

    def mock_client_factory(**kwargs):
        return original_client(
            transport=transport,
            **{k: v for k, v in kwargs.items() if k not in ("transport",)},
        )

    monkeypatch.setattr(_mod.httpx, "Client", mock_client_factory)

    result = await handle_dsgvo_visual_redact("upload-001", _dummy_pdf(), "application/pdf", {})

    assert result.status == "completed"
    assert result.operation == "dsgvo.visual-redact"
    assert result.artifact_url == "/api/v1/uploads/upload-001/artifact"
    assert result.artifact_mime == "application/pdf"
    assert result.error is None
    assert "3 Stellen geschwärzt" in (result.result_summary or "")
    # Artifact-Datei muss vorhanden sein
    artifact = tmp_path / "upload-001.visual-redacted.pdf"
    assert artifact.exists()
    assert artifact.read_bytes() == _dummy_pdf()
    # Submit + mindestens 1 Poll + Download
    assert "submit" in call_log
    assert "poll" in call_log
    assert "download" in call_log


@pytest.mark.asyncio
async def test_submit_sync_200(monkeypatch, tmp_path):
    """200 direkt (sync-Fall) → completed-Result ohne Polling."""
    monkeypatch.setenv("MOAG_OBERON_BASE_URL", "http://mock-oberon")
    monkeypatch.setenv("MOAG_OBERON_TOKEN", "")
    monkeypatch.setattr(_mod, "UPLOAD_DIR", tmp_path)
    monkeypatch.setattr(_mod.time, "sleep", lambda _: None)

    def handler(req: httpx.Request) -> httpx.Response:
        if req.method == "POST":
            return httpx.Response(
                200, content=_dummy_pdf(),
                headers={"Content-Type": "application/pdf"},
            )
        return httpx.Response(500)

    transport = httpx.MockTransport(handler)
    original_client = _mod.httpx.Client

    def mock_client_factory(**kwargs):
        return original_client(
            transport=transport,
            **{k: v for k, v in kwargs.items() if k not in ("transport",)},
        )

    monkeypatch.setattr(_mod.httpx, "Client", mock_client_factory)

    result = await handle_dsgvo_visual_redact("upload-002", _dummy_pdf(), "application/pdf", {})

    assert result.status == "completed"
    assert result.artifact_mime == "application/pdf"
    assert result.error is None


@pytest.mark.asyncio
async def test_404_poll_returns_job_lost(monkeypatch, tmp_path):
    """404 beim Polling → job_lost-Result (HTTP-410-Semantik in Payload)."""
    monkeypatch.setenv("MOAG_OBERON_BASE_URL", "http://mock-oberon")
    monkeypatch.setenv("MOAG_OBERON_TOKEN", "tok")
    monkeypatch.setattr(_mod, "UPLOAD_DIR", tmp_path)
    monkeypatch.setattr(_mod.time, "sleep", lambda _: None)

    def handler(req: httpx.Request) -> httpx.Response:
        if req.method == "POST":
            return httpx.Response(
                202,
                json={"jobId": "job-404", "status": "PENDING"},
            )
        if req.method == "GET":
            return httpx.Response(404, json={"detail": "Job not found"})
        return httpx.Response(500)

    transport = httpx.MockTransport(handler)
    original_client = _mod.httpx.Client

    def mock_client_factory(**kwargs):
        return original_client(
            transport=transport,
            **{k: v for k, v in kwargs.items() if k not in ("transport",)},
        )

    monkeypatch.setattr(_mod.httpx, "Client", mock_client_factory)

    result = await handle_dsgvo_visual_redact("upload-003", _dummy_pdf(), "application/pdf", {})

    assert result.status == "failed"
    assert "Job verloren" in (result.error or "")
    assert result.result_payload.get("job_lost") is True
    assert result.result_payload.get("job_id") == "job-404"


@pytest.mark.asyncio
async def test_job_failed(monkeypatch, tmp_path):
    """FAILED-Status → failed-Result mit Fehlermeldung."""
    monkeypatch.setenv("MOAG_OBERON_BASE_URL", "http://mock-oberon")
    monkeypatch.setenv("MOAG_OBERON_TOKEN", "tok")
    monkeypatch.setattr(_mod, "UPLOAD_DIR", tmp_path)
    monkeypatch.setattr(_mod.time, "sleep", lambda _: None)

    def handler(req: httpx.Request) -> httpx.Response:
        if req.method == "POST":
            return httpx.Response(202, json={"jobId": "job-fail", "status": "PENDING"})
        if req.method == "GET":
            return httpx.Response(
                200,
                json={"status": "FAILED", "jobId": "job-fail", "errorMessage": "PII-Engine Timeout"},
            )
        return httpx.Response(500)

    transport = httpx.MockTransport(handler)
    original_client = _mod.httpx.Client

    def mock_client_factory(**kwargs):
        return original_client(
            transport=transport,
            **{k: v for k, v in kwargs.items() if k not in ("transport",)},
        )

    monkeypatch.setattr(_mod.httpx, "Client", mock_client_factory)

    result = await handle_dsgvo_visual_redact("upload-004", _dummy_pdf(), "application/pdf", {})

    assert result.status == "failed"
    assert "PII-Engine Timeout" in (result.error or "")


@pytest.mark.asyncio
async def test_dsgvo_gate_503(monkeypatch, tmp_path):
    """503 von Oberon (DSGVO deaktiviert) → failed-Result."""
    monkeypatch.setenv("MOAG_OBERON_BASE_URL", "http://mock-oberon")
    monkeypatch.setenv("MOAG_OBERON_TOKEN", "tok")
    monkeypatch.setattr(_mod, "UPLOAD_DIR", tmp_path)

    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(503, json={"error": "DSGVO deaktiviert"})

    transport = httpx.MockTransport(handler)
    original_client = _mod.httpx.Client

    def mock_client_factory(**kwargs):
        return original_client(
            transport=transport,
            **{k: v for k, v in kwargs.items() if k not in ("transport",)},
        )

    monkeypatch.setattr(_mod.httpx, "Client", mock_client_factory)

    result = await handle_dsgvo_visual_redact("upload-005", _dummy_pdf(), "application/pdf", {})

    assert result.status == "failed"
    assert "DSGVO deaktiviert" in (result.error or "")
    assert "503" in (result.error or "")


@pytest.mark.asyncio
async def test_oberon_not_reachable(monkeypatch, tmp_path):
    """Oberon nicht erreichbar → failed-Result."""
    monkeypatch.setenv("MOAG_OBERON_BASE_URL", "http://not-a-real-host")
    monkeypatch.setenv("MOAG_OBERON_TOKEN", "")
    monkeypatch.setattr(_mod, "UPLOAD_DIR", tmp_path)

    def handler(req: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("Connection refused")

    transport = httpx.MockTransport(handler)
    original_client = _mod.httpx.Client

    def mock_client_factory(**kwargs):
        return original_client(
            transport=transport,
            **{k: v for k, v in kwargs.items() if k not in ("transport",)},
        )

    monkeypatch.setattr(_mod.httpx, "Client", mock_client_factory)

    result = await handle_dsgvo_visual_redact("upload-006", _dummy_pdf(), "application/pdf", {})

    assert result.status == "failed"
    assert "nicht erreichbar" in (result.error or "")


@pytest.mark.asyncio
async def test_handler_registered():
    """Handler muss in der HANDLERS-Registry registriert sein."""
    from moag.upload.handlers.registry import HANDLERS
    assert "dsgvo.visual-redact" in HANDLERS
