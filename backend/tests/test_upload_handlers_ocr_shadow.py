"""
Tests für Upload-Handler ocr.shadow.

Prüft: Happy-Path, 403 path_not_allowed, HTTP-Fehler, Timeout,
Connection-Error, Schema-Strict, Datei-Persistenz, Registry-Eintrag.
"""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from unittest.mock import patch

import httpx
import pytest

from moag.upload.schemas import UploadResult


def _make_client_patch(monkeypatch, transport):
    real_client = httpx.AsyncClient

    def patched(**kw):
        kw.pop("transport", None)
        return real_client(transport=transport, **kw)

    monkeypatch.setattr(httpx, "AsyncClient", patched)
    monkeypatch.setenv("MOAG_OCREXPERT_BASE_URL", "http://mock-ocrexpert")
    monkeypatch.setenv("MOAG_SHADOW_TMP_DIR", "/tmp/moag-shadow-test")


def _shadow_response(
    shadow_written: bool = True,
    pages: int = 5,
    text_len: int = 2400,
    shadow_bytes: int = 102400,
) -> dict:
    return {
        "status": "ok",
        "skipped_reason": None,
        "error": None,
        "shadow_written": shadow_written,
        "shadow_path": "/tmp/moag-shadow-test/testupload.pdf.pdfa.pdf",
        "shadow_bytes": shadow_bytes,
        "source_path": "/tmp/moag-shadow-test/testupload.pdf",
        "pages": pages,
        "text_len": text_len,
        "quality": {"passed": True, "score": 0.88},
        "engines_used": ["tesseract"],
        "duration_ms": 3200,
        "audit_id": "audit-xyz",
    }


@pytest.mark.asyncio
async def test_ocr_shadow_happy_path(monkeypatch, tmp_path):
    """Happy-Path: Datei persistiert, OCRexpert antwortet mit shadow_written=True."""
    body = _shadow_response()

    captured = []

    def handler(req: httpx.Request) -> httpx.Response:
        if "/api/v1/shadow/process" in str(req.url):
            captured.append(json.loads(req.content))
            return httpx.Response(200, json=body)
        return httpx.Response(404)

    _make_client_patch(monkeypatch, httpx.MockTransport(handler))
    monkeypatch.setenv("MOAG_SHADOW_TMP_DIR", str(tmp_path))

    from moag.upload.handlers.ocr_shadow import handle_ocr_shadow

    result = await handle_ocr_shadow(
        upload_id="shadowtest01",
        file_bytes=b"%PDF-1.4 dummy content",
        mime="application/pdf",
        params={},
    )

    assert isinstance(result, UploadResult)
    assert result.status == "completed"
    assert result.operation == "ocr.shadow"
    assert result.completed_at is not None
    assert result.duration_ms == 3200
    assert result.result_payload["shadow_written"] is True
    assert result.result_payload["pages"] == 5
    assert result.result_payload["text_len"] == 2400
    assert result.result_payload["audit_id"] == "audit-xyz"
    assert result.result_payload["engines_used"] == ["tesseract"]
    assert result.error is None
    assert "KB" in result.result_summary

    # Request-Body prüfen
    assert len(captured) == 1
    req_body = captured[0]
    assert "source_path" in req_body
    assert "shadow_path" in req_body
    assert req_body["source_path"].endswith("shadowtest01.pdf")
    assert req_body["shadow_path"].endswith(".pdfa.pdf")
    assert req_body["overwrite"] is True


@pytest.mark.asyncio
async def test_ocr_shadow_skipped(monkeypatch, tmp_path):
    """shadow_written=False + skipped_reason → completed mit Hinweis."""
    body = _shadow_response(shadow_written=False)
    body["skipped_reason"] = "Shadow ist aktueller als Quelle."

    def handler(req: httpx.Request) -> httpx.Response:
        if "/api/v1/shadow/process" in str(req.url):
            return httpx.Response(200, json=body)
        return httpx.Response(404)

    _make_client_patch(monkeypatch, httpx.MockTransport(handler))
    monkeypatch.setenv("MOAG_SHADOW_TMP_DIR", str(tmp_path))

    from moag.upload.handlers.ocr_shadow import handle_ocr_shadow

    result = await handle_ocr_shadow("shadowskip01", b"%PDF", "application/pdf", {})

    assert result.status == "completed"
    assert "übersprungen" in result.result_summary


@pytest.mark.asyncio
async def test_ocr_shadow_403_path_forbidden(monkeypatch, tmp_path):
    """403 → status=failed, Fehlermeldung erklärt OCREXPERT_SHADOW_ALLOWED_ROOTS."""

    def handler(req: httpx.Request) -> httpx.Response:
        if "/api/v1/shadow/process" in str(req.url):
            return httpx.Response(403, text="path_not_allowed")
        return httpx.Response(404)

    _make_client_patch(monkeypatch, httpx.MockTransport(handler))
    monkeypatch.setenv("MOAG_SHADOW_TMP_DIR", str(tmp_path))

    from moag.upload.handlers.ocr_shadow import handle_ocr_shadow

    result = await handle_ocr_shadow("shadow403", b"%PDF", "application/pdf", {})

    assert result.status == "failed"
    assert result.operation == "ocr.shadow"
    assert result.completed_at is not None
    assert "OCREXPERT_SHADOW_ALLOWED_ROOTS" in result.error


@pytest.mark.asyncio
async def test_ocr_shadow_http_500(monkeypatch, tmp_path):
    """HTTP 500 → status=failed."""

    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="Internal Server Error")

    _make_client_patch(monkeypatch, httpx.MockTransport(handler))
    monkeypatch.setenv("MOAG_SHADOW_TMP_DIR", str(tmp_path))

    from moag.upload.handlers.ocr_shadow import handle_ocr_shadow

    result = await handle_ocr_shadow("shadow500", b"%PDF", "application/pdf", {})

    assert result.status == "failed"
    assert "500" in result.error


@pytest.mark.asyncio
async def test_ocr_shadow_timeout(monkeypatch, tmp_path):
    """Timeout → status=failed."""

    def handler(req: httpx.Request) -> httpx.Response:
        raise httpx.TimeoutException("timed out")

    _make_client_patch(monkeypatch, httpx.MockTransport(handler))
    monkeypatch.setenv("MOAG_SHADOW_TMP_DIR", str(tmp_path))

    from moag.upload.handlers.ocr_shadow import handle_ocr_shadow

    result = await handle_ocr_shadow("shadowtimeout", b"%PDF", "application/pdf", {})

    assert result.status == "failed"
    assert "Timeout" in result.error


@pytest.mark.asyncio
async def test_ocr_shadow_connect_error(monkeypatch, tmp_path):
    """Connection-Error → status=failed."""

    def handler(req: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused")

    _make_client_patch(monkeypatch, httpx.MockTransport(handler))
    monkeypatch.setenv("MOAG_SHADOW_TMP_DIR", str(tmp_path))

    from moag.upload.handlers.ocr_shadow import handle_ocr_shadow

    result = await handle_ocr_shadow("shadowconn", b"%PDF", "application/pdf", {})

    assert result.status == "failed"
    assert result.completed_at is not None
    assert result.error is not None


@pytest.mark.asyncio
async def test_ocr_shadow_file_persisted(monkeypatch, tmp_path):
    """Datei-Bytes werden korrekt auf Disk geschrieben."""
    body = _shadow_response()

    def handler(req: httpx.Request) -> httpx.Response:
        if "/api/v1/shadow/process" in str(req.url):
            return httpx.Response(200, json=body)
        return httpx.Response(404)

    _make_client_patch(monkeypatch, httpx.MockTransport(handler))
    monkeypatch.setenv("MOAG_SHADOW_TMP_DIR", str(tmp_path))

    file_content = b"%PDF-1.4 specific-content-12345"

    from moag.upload.handlers.ocr_shadow import handle_ocr_shadow

    await handle_ocr_shadow("persist_test01", file_content, "application/pdf", {})

    written = tmp_path / "persist_test01.pdf"
    assert written.exists()
    assert written.read_bytes() == file_content


@pytest.mark.asyncio
async def test_ocr_shadow_schema_strict(monkeypatch, tmp_path):
    """Schema-Strict: alle Pflichtfelder in UploadResult gesetzt."""
    body = _shadow_response()

    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=body)

    _make_client_patch(monkeypatch, httpx.MockTransport(handler))
    monkeypatch.setenv("MOAG_SHADOW_TMP_DIR", str(tmp_path))

    from moag.upload.handlers.ocr_shadow import handle_ocr_shadow

    result = await handle_ocr_shadow("schema_test", b"%PDF", "application/pdf", {})

    assert result.upload_id == "schema_test"
    assert result.status in ("completed", "failed")
    assert result.operation == "ocr.shadow"
    assert isinstance(result.completed_at, datetime)
    assert result.duration_ms is not None


def test_ocr_shadow_in_registry():
    """ocr.shadow ist in HANDLERS registriert."""
    from moag.upload.handlers.registry import HANDLERS

    assert "ocr.shadow" in HANDLERS
    assert HANDLERS["ocr.shadow"].__module__ == "moag.upload.handlers.ocr_shadow"
