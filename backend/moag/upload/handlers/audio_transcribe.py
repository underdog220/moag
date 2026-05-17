"""
Upload-Handler: audio.transcribe

Sendet Audio-Dateien per Multipart an Oberon DSGVO-Transcribe-Endpoint
und liefert das Whisper-Transkript als UploadResult.

Oberon-Endpoint: POST /api/v2/dsgvo/transcribe
Multipart-Felder:
  - audio   : Audio-Binärdaten (WAV/MP3/M4A/OGG/FLAC/AAC)
  - clientId: "moag" (Pflicht)

Antwort-Schema (erfolgreicher Fall):
  {
    "text": "...",
    "language": "de",
    "duration": 12.4,   # Sekunden (float)
    "auditId": "...",
    ...
  }

Antwort-Schema (Fehlerfall):
  {
    "status": "error",
    "error": "...",
    "auditId": "..."
  }

Grenze: > 25 MB werden abgelehnt (Oberon-Whisper-Limit).
"""
from __future__ import annotations

import logging
import os
import time
from datetime import datetime, timezone

import httpx

from moag.pipeline_hooks import plog
from moag.upload.handlers.registry import register_handler
from moag.upload.schemas import UploadResult

logger = logging.getLogger("moag.upload.handlers.audio_transcribe")

# Oberon-Whisper-Limit
MAX_BYTES = 25 * 1024 * 1024  # 25 MB


@register_handler("audio.transcribe")
async def handle_audio_transcribe(
    upload_id: str,
    file_bytes: bytes,
    mime: str,
    params: dict,
) -> UploadResult:
    """Transkribiert eine Audio-Datei via Oberon DSGVO-Whisper-Endpoint.

    Akzeptiert WAV/MP3/M4A/OGG/FLAC/AAC.
    Dateien > 25 MB werden sofort abgelehnt.
    """
    t0 = time.monotonic()
    now = datetime.now(timezone.utc)

    # ── Size-Check ─────────────────────────────────────────────────────────────
    if len(file_bytes) > MAX_BYTES:
        size_mb = len(file_bytes) / (1024 * 1024)
        msg = f"Oberon-Whisper-Limit 25 MB — Datei ist {size_mb:.1f} MB"
        logger.warning("[audio.transcribe] %s upload_id=%s", msg, upload_id)
        return UploadResult(
            upload_id=upload_id,
            status="failed",
            operation="audio.transcribe",
            completed_at=now,
            duration_ms=0,
            result_summary=None,
            result_payload={},
            artifact_url=None,
            artifact_mime=None,
            error=msg,
        )

    # ── Oberon-URL + Token ─────────────────────────────────────────────────────
    base_url = os.environ.get("MOAG_OBERON_BASE_URL", "http://192.168.200.169:17900").rstrip("/")
    token = os.environ.get("MOAG_OBERON_TOKEN", "")
    endpoint = f"{base_url}/api/v2/dsgvo/transcribe"

    headers: dict[str, str] = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    # MIME → Dateiname ableiten (Oberon braucht konsistente Extension)
    _mime_ext = {
        "audio/wav": "audio.wav",
        "audio/x-wav": "audio.wav",
        "audio/mpeg": "audio.mp3",
        "audio/mp3": "audio.mp3",
        "audio/mp4": "audio.m4a",
        "audio/ogg": "audio.ogg",
        "audio/flac": "audio.flac",
        "audio/aac": "audio.aac",
    }
    filename = _mime_ext.get(mime, "audio.wav")

    plog.step(
        "audio.transcribe", "start",
        input={"upload_id": upload_id, "mime": mime, "size_bytes": len(file_bytes)},
        dauer_ms=0, ok=True,
    )

    # ── HTTP-Call ─────────────────────────────────────────────────────────────
    try:
        with httpx.Client(timeout=120.0) as client:
            resp = client.post(
                endpoint,
                headers=headers,
                files={
                    "audio": (filename, file_bytes, mime),
                },
                data={
                    "clientId": "moag",
                },
            )
    except (httpx.ConnectError, httpx.TimeoutException, httpx.HTTPError, OSError) as exc:
        dauer_ms = int((time.monotonic() - t0) * 1000)
        err = f"Oberon nicht erreichbar: {exc}"
        logger.error("[audio.transcribe] %s upload_id=%s", err, upload_id)
        plog.step(
            "audio.transcribe", "http_error",
            input={"endpoint": endpoint}, output={"error": str(exc)},
            dauer_ms=dauer_ms, ok=False,
        )
        return UploadResult(
            upload_id=upload_id,
            status="failed",
            operation="audio.transcribe",
            completed_at=datetime.now(timezone.utc),
            duration_ms=dauer_ms,
            result_summary=None,
            result_payload={},
            artifact_url=None,
            artifact_mime=None,
            error=err,
        )

    dauer_ms = int((time.monotonic() - t0) * 1000)

    # ── Antwort auswerten ─────────────────────────────────────────────────────
    if resp.status_code >= 400:
        try:
            body = resp.json()
            err_msg = body.get("error", resp.text[:200])
        except Exception:
            err_msg = resp.text[:200]
        logger.error(
            "[audio.transcribe] Oberon HTTP %d: %s upload_id=%s",
            resp.status_code, err_msg, upload_id,
        )
        plog.step(
            "audio.transcribe", "oberon_error",
            input={"endpoint": endpoint}, output={"status": resp.status_code, "error": err_msg},
            dauer_ms=dauer_ms, ok=False,
        )
        return UploadResult(
            upload_id=upload_id,
            status="failed",
            operation="audio.transcribe",
            completed_at=datetime.now(timezone.utc),
            duration_ms=dauer_ms,
            result_summary=None,
            result_payload={},
            artifact_url=None,
            artifact_mime=None,
            error=f"Oberon HTTP {resp.status_code}: {err_msg}",
        )

    try:
        payload = resp.json()
    except Exception as exc:
        err = f"Oberon-Antwort nicht parsebar: {exc}"
        logger.error("[audio.transcribe] %s upload_id=%s", err, upload_id)
        return UploadResult(
            upload_id=upload_id,
            status="failed",
            operation="audio.transcribe",
            completed_at=datetime.now(timezone.utc),
            duration_ms=dauer_ms,
            result_summary=None,
            result_payload={},
            artifact_url=None,
            artifact_mime=None,
            error=err,
        )

    # Fehler-Status im Payload (Oberon gibt manchmal 200 + status=error)
    if payload.get("status") == "error":
        err_msg = payload.get("error", "Unbekannter Oberon-Fehler")
        logger.error("[audio.transcribe] Oberon status=error: %s upload_id=%s", err_msg, upload_id)
        return UploadResult(
            upload_id=upload_id,
            status="failed",
            operation="audio.transcribe",
            completed_at=datetime.now(timezone.utc),
            duration_ms=dauer_ms,
            result_summary=None,
            result_payload=payload,
            artifact_url=None,
            artifact_mime=None,
            error=err_msg,
        )

    # Erfolg — Summary aufbauen
    text: str = payload.get("text", "")
    n_words = len(text.split()) if text else 0
    # Oberon liefert Dauer als "duration" (float Sekunden)
    duration_s = payload.get("duration", payload.get("duration_s", 0.0))
    language = payload.get("language", "unbekannt")

    summary = f"Audio transkribiert: {n_words} Wörter in {duration_s:.1f}s (Sprache: {language})"

    plog.step(
        "audio.transcribe", "done",
        input={"upload_id": upload_id},
        output={"n_words": n_words, "duration_s": duration_s, "language": language},
        dauer_ms=dauer_ms, ok=True,
    )
    logger.info("[audio.transcribe] %s upload_id=%s", summary, upload_id)

    return UploadResult(
        upload_id=upload_id,
        status="completed",
        operation="audio.transcribe",
        completed_at=datetime.now(timezone.utc),
        duration_ms=dauer_ms,
        result_summary=summary,
        result_payload=payload,
        artifact_url=None,
        artifact_mime=None,
        error=None,
    )
