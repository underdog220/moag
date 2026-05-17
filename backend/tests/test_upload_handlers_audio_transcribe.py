"""
Tests für audio.transcribe Upload-Handler.

Testet:
- Happy-Path: Oberon liefert 200 mit Transkript
- Size-Check: Datei > 25 MB → failed mit korrekter Fehlermeldung
- Oberon-Down: ConnectError → failed mit Fehlermeldung
- Oberon HTTP 4xx → failed
- Oberon antwortet mit status=error im JSON-Body
"""
from __future__ import annotations

import io
from datetime import datetime, timezone
from unittest.mock import patch

import httpx
import pytest

import moag.upload.handlers.audio_transcribe as _mod
from moag.upload.schemas import UploadResult


# ── Hilfsfunktionen ────────────────────────────────────────────────────────────

def _make_audio_bytes(size: int = 1024) -> bytes:
    """Erzeugt Dummy-Audio-Bytes (WAV-ähnlicher Header für Realismus)."""
    return b"RIFF" + b"\x00" * (size - 4)


def _transcribe_success_response() -> dict:
    return {
        "text": "Hallo Welt. Dies ist ein Test.",
        "language": "de",
        "duration": 5.2,
        "auditId": "abc-123",
    }


# ── Tests ──────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_audio_transcribe_happy_path(monkeypatch, tmp_path):
    """Oberon liefert 200 mit Transkript → completed mit korrekter Summary."""
    response_data = _transcribe_success_response()

    def handler(req: httpx.Request) -> httpx.Response:
        assert "audio" in req.content.decode("latin-1", errors="replace") or b"audio" in req.content
        if "/api/v2/dsgvo/transcribe" in str(req.url):
            return httpx.Response(200, json=response_data)
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)

    original_client_cls = _mod.httpx.Client

    def mock_client(**kwargs):
        return original_client_cls(transport=transport, **{k: v for k, v in kwargs.items() if k != "transport"})

    monkeypatch.setattr(_mod.httpx, "Client", mock_client)
    monkeypatch.setenv("MOAG_OBERON_BASE_URL", "http://mock-oberon")
    monkeypatch.setenv("MOAG_OBERON_TOKEN", "test-token")

    result = await _mod.handle_audio_transcribe(
        upload_id="test-upload-001",
        file_bytes=_make_audio_bytes(2048),
        mime="audio/wav",
        params={},
    )

    assert isinstance(result, UploadResult)
    assert result.status == "completed"
    assert result.operation == "audio.transcribe"
    assert result.error is None
    assert result.result_summary is not None
    # "Hallo Welt. Dies ist ein Test." hat 6 Wörter
    assert "6 Wörter" in result.result_summary
    assert "5.2s" in result.result_summary
    assert "de" in result.result_summary
    # Payload enthält vollständige Oberon-Antwort
    assert result.result_payload["text"] == "Hallo Welt. Dies ist ein Test."
    assert result.result_payload["language"] == "de"
    assert result.result_payload["duration"] == 5.2
    assert result.artifact_url is None
    assert result.artifact_mime is None
    assert result.completed_at is not None
    assert result.duration_ms is not None and result.duration_ms >= 0


@pytest.mark.asyncio
async def test_audio_transcribe_size_limit(monkeypatch):
    """Datei > 25 MB → sofort failed ohne Oberon-Call."""
    call_count = 0

    def handler(req: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        return httpx.Response(200, json=_transcribe_success_response())

    transport = httpx.MockTransport(handler)
    original_client_cls = _mod.httpx.Client

    def mock_client(**kwargs):
        return original_client_cls(transport=transport, **{k: v for k, v in kwargs.items() if k != "transport"})

    monkeypatch.setattr(_mod.httpx, "Client", mock_client)
    monkeypatch.setenv("MOAG_OBERON_BASE_URL", "http://mock-oberon")

    # 26 MB Datei
    big_bytes = b"\x00" * (26 * 1024 * 1024)

    result = await _mod.handle_audio_transcribe(
        upload_id="test-upload-big",
        file_bytes=big_bytes,
        mime="audio/wav",
        params={},
    )

    assert result.status == "failed"
    assert result.operation == "audio.transcribe"
    assert "25 MB" in result.error
    assert "Oberon-Whisper-Limit" in result.error
    # Kein HTTP-Call darf stattgefunden haben
    assert call_count == 0


@pytest.mark.asyncio
async def test_audio_transcribe_oberon_down(monkeypatch):
    """Oberon nicht erreichbar (ConnectError) → failed mit Fehlermeldung."""
    def handler(req: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("Connection refused")

    transport = httpx.MockTransport(handler)
    original_client_cls = _mod.httpx.Client

    def mock_client(**kwargs):
        return original_client_cls(transport=transport, **{k: v for k, v in kwargs.items() if k != "transport"})

    monkeypatch.setattr(_mod.httpx, "Client", mock_client)
    monkeypatch.setenv("MOAG_OBERON_BASE_URL", "http://mock-oberon")

    result = await _mod.handle_audio_transcribe(
        upload_id="test-upload-down",
        file_bytes=_make_audio_bytes(512),
        mime="audio/mpeg",
        params={},
    )

    assert result.status == "failed"
    assert result.error is not None
    assert "nicht erreichbar" in result.error.lower() or "oberon" in result.error.lower()


@pytest.mark.asyncio
async def test_audio_transcribe_http_500(monkeypatch):
    """Oberon HTTP 500 → failed."""
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="Internal Server Error")

    transport = httpx.MockTransport(handler)
    original_client_cls = _mod.httpx.Client

    def mock_client(**kwargs):
        return original_client_cls(transport=transport, **{k: v for k, v in kwargs.items() if k != "transport"})

    monkeypatch.setattr(_mod.httpx, "Client", mock_client)
    monkeypatch.setenv("MOAG_OBERON_BASE_URL", "http://mock-oberon")

    result = await _mod.handle_audio_transcribe(
        upload_id="test-upload-500",
        file_bytes=_make_audio_bytes(512),
        mime="audio/flac",
        params={},
    )

    assert result.status == "failed"
    assert "500" in result.error


@pytest.mark.asyncio
async def test_audio_transcribe_http_401(monkeypatch):
    """Oberon HTTP 401 → failed."""
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"error": "Unauthorized"})

    transport = httpx.MockTransport(handler)
    original_client_cls = _mod.httpx.Client

    def mock_client(**kwargs):
        return original_client_cls(transport=transport, **{k: v for k, v in kwargs.items() if k != "transport"})

    monkeypatch.setattr(_mod.httpx, "Client", mock_client)
    monkeypatch.setenv("MOAG_OBERON_BASE_URL", "http://mock-oberon")
    monkeypatch.setenv("MOAG_OBERON_TOKEN", "wrong-token")

    result = await _mod.handle_audio_transcribe(
        upload_id="test-upload-401",
        file_bytes=_make_audio_bytes(512),
        mime="audio/ogg",
        params={},
    )

    assert result.status == "failed"
    assert "401" in result.error


@pytest.mark.asyncio
async def test_audio_transcribe_oberon_status_error(monkeypatch):
    """Oberon 200 aber JSON-Body mit status=error (Whisper-Upstream-Fehler) → failed."""
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={
            "status": "error",
            "error": "Whisper-Upstream-Fehler",
            "auditId": "xyz-456",
            "upstreamStatus": 400,
        })

    transport = httpx.MockTransport(handler)
    original_client_cls = _mod.httpx.Client

    def mock_client(**kwargs):
        return original_client_cls(transport=transport, **{k: v for k, v in kwargs.items() if k != "transport"})

    monkeypatch.setattr(_mod.httpx, "Client", mock_client)
    monkeypatch.setenv("MOAG_OBERON_BASE_URL", "http://mock-oberon")

    result = await _mod.handle_audio_transcribe(
        upload_id="test-upload-whisper-err",
        file_bytes=_make_audio_bytes(512),
        mime="audio/wav",
        params={},
    )

    assert result.status == "failed"
    assert "Whisper" in result.error or "upstream" in result.error.lower()


@pytest.mark.asyncio
async def test_audio_transcribe_word_count_zero(monkeypatch):
    """Oberon liefert leeres Transkript (Stille) → completed, 0 Wörter."""
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={
            "text": "",
            "language": "unknown",
            "duration": 3.0,
        })

    transport = httpx.MockTransport(handler)
    original_client_cls = _mod.httpx.Client

    def mock_client(**kwargs):
        return original_client_cls(transport=transport, **{k: v for k, v in kwargs.items() if k != "transport"})

    monkeypatch.setattr(_mod.httpx, "Client", mock_client)
    monkeypatch.setenv("MOAG_OBERON_BASE_URL", "http://mock-oberon")

    result = await _mod.handle_audio_transcribe(
        upload_id="test-upload-silence",
        file_bytes=_make_audio_bytes(512),
        mime="audio/wav",
        params={},
    )

    assert result.status == "completed"
    assert "0 Wörter" in result.result_summary
    assert "3.0s" in result.result_summary


def test_audio_transcribe_handler_registered():
    """Handler ist in der Registry eingetragen."""
    from moag.upload.handlers.registry import HANDLERS
    assert "audio.transcribe" in HANDLERS
    assert HANDLERS["audio.transcribe"] is _mod.handle_audio_transcribe
