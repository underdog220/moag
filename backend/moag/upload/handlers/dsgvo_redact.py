"""
Upload-Handler: dsgvo.redact

Sendet PDF/Bild-Dateien an Oberon DSGVO-Redact-Endpoint und liefert
die anonymisierte PDF als Artifact.

Oberon-Endpoint: POST /api/v2/dsgvo/document/redact
Multipart-Felder:
  - file    : Binärdaten (PDF/PNG/JPG)
  - clientId: "moag" (Pflicht laut Live-Probe)

Query-Parameter:
  - ?wait=true  (versuchen wir; Oberon antwortet ggf. trotzdem 202 async)

Async-Pattern (202-Antwort):
  {
    "jobId": "...",
    "statusUrl": "/api/v2/dsgvo/document/redact/{jobId}",
    "status": "RUNNING"
  }

Status-Polling: GET /api/v2/dsgvo/document/redact/{jobId}
  {
    "jobId": "...",
    "status": "RUNNING" | "COMPLETED" | "FAILED",
    "errorMessage": "...",   # bei FAILED
    ...
  }

Download: GET /api/v2/dsgvo/document/redact/{jobId}/download
  → Binär-Response (application/pdf)

Timeout: 60 Sekunden Gesamtwartezeit für Polling, dann Timeout-Result.

Artifact wird unter /data/moag/uploads/<upload_id>.redacted.pdf gespeichert.
"""
from __future__ import annotations

import logging
import os
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx

from moag.pipeline_hooks import plog
from moag.upload.handlers.registry import register_handler
from moag.upload.schemas import UploadResult

logger = logging.getLogger("moag.upload.handlers.dsgvo_redact")

# Maximale Wartezeit für asynchrones Redact-Job-Polling
POLL_TIMEOUT_S = 60.0
POLL_INTERVAL_S = 2.0

# Artifact-Ablage-Verzeichnis (Volume-gemountet im Container)
UPLOAD_DIR = Path(os.environ.get("MOAG_UPLOAD_DIR", "/data/moag/uploads"))


@register_handler("dsgvo.redact")
async def handle_dsgvo_redact(
    upload_id: str,
    file_bytes: bytes,
    mime: str,
    params: dict,
) -> UploadResult:
    """Anonymisiert PDF oder Bild via Oberon DSGVO-Redact.

    Versucht zuerst synchronen Aufruf (?wait=true).
    Falls Oberon 202 zurückgibt: Polling bis completed oder Timeout.
    Das redaktierte Dokument wird als Artifact gespeichert.
    """
    t0 = time.monotonic()
    now = datetime.now(timezone.utc)

    # ── Oberon-URL + Token ─────────────────────────────────────────────────────
    base_url = os.environ.get("MOAG_OBERON_BASE_URL", "http://192.168.200.169:17900").rstrip("/")
    token = os.environ.get("MOAG_OBERON_TOKEN", "")
    redact_url = f"{base_url}/api/v2/dsgvo/document/redact"

    headers: dict[str, str] = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    # MIME → Dateiname
    _mime_ext = {
        "application/pdf": "document.pdf",
        "image/png": "image.png",
        "image/jpeg": "image.jpg",
        "image/jpg": "image.jpg",
    }
    filename = _mime_ext.get(mime, "document.pdf")

    plog.step(
        "dsgvo.redact", "start",
        input={"upload_id": upload_id, "mime": mime, "size_bytes": len(file_bytes)},
        dauer_ms=0, ok=True,
    )

    # ── HTTP-Client aufbauen ──────────────────────────────────────────────────
    try:
        client = httpx.Client(timeout=30.0, headers=headers)
    except Exception as exc:
        return _failed(upload_id, t0, f"Client-Init-Fehler: {exc}")

    try:
        # ── Versuch: synchron (?wait=true) ─────────────────────────────────
        resp = client.post(
            redact_url,
            params={"wait": "true"},
            files={"file": (filename, file_bytes, mime)},
            data={"clientId": "moag"},
        )
    except (httpx.ConnectError, httpx.TimeoutException, httpx.HTTPError, OSError) as exc:
        client.close()
        dauer_ms = int((time.monotonic() - t0) * 1000)
        err = f"Oberon nicht erreichbar: {exc}"
        logger.error("[dsgvo.redact] %s upload_id=%s", err, upload_id)
        plog.step("dsgvo.redact", "http_error",
                  input={"url": redact_url}, output={"error": str(exc)},
                  dauer_ms=dauer_ms, ok=False)
        return _failed(upload_id, t0, err)

    # ── Sync-Erfolg (200): direkt verarbeiten ─────────────────────────────────
    if resp.status_code == 200:
        client.close()
        return _handle_completed_download(
            upload_id=upload_id,
            content=resp.content,
            t0=t0,
            payload=_try_json(resp),
        )

    # ── Async (202): Job-ID extrahieren, dann Polling ─────────────────────────
    if resp.status_code == 202:
        try:
            job_data = resp.json()
            job_id = job_data.get("jobId") or job_data.get("job_id")
        except Exception as exc:
            client.close()
            return _failed(upload_id, t0, f"Konnte Job-ID aus 202-Antwort nicht lesen: {exc}")

        if not job_id:
            client.close()
            return _failed(upload_id, t0, f"Oberon 202 ohne jobId: {resp.text[:200]}")

        logger.info("[dsgvo.redact] Async-Job %s gestartet upload_id=%s", job_id, upload_id)
        plog.step("dsgvo.redact", "async_start",
                  input={"upload_id": upload_id}, output={"job_id": job_id},
                  dauer_ms=int((time.monotonic() - t0) * 1000), ok=True)

        # Polling-Loop
        poll_url = f"{base_url}/api/v2/dsgvo/document/redact/{job_id}"
        deadline = t0 + POLL_TIMEOUT_S

        while time.monotonic() < deadline:
            time.sleep(POLL_INTERVAL_S)
            try:
                status_resp = client.get(poll_url)
            except (httpx.ConnectError, httpx.TimeoutException, httpx.HTTPError, OSError) as exc:
                client.close()
                return _failed(upload_id, t0, f"Polling-Verbindungsfehler: {exc}")

            if status_resp.status_code >= 400:
                client.close()
                return _failed(
                    upload_id, t0,
                    f"Polling HTTP {status_resp.status_code}: {status_resp.text[:200]}"
                )

            try:
                status_data = status_resp.json()
            except Exception:
                continue  # evtl. transientes Parse-Problem, weiter pollen

            job_status = (status_data.get("status") or "").upper()
            logger.debug("[dsgvo.redact] Job %s status=%s", job_id, job_status)

            if job_status == "COMPLETED":
                # Download
                download_url = f"{base_url}/api/v2/dsgvo/document/redact/{job_id}/download"
                try:
                    dl_resp = client.get(download_url)
                except (httpx.ConnectError, httpx.TimeoutException, httpx.HTTPError, OSError) as exc:
                    client.close()
                    return _failed(upload_id, t0, f"Download-Fehler: {exc}")

                client.close()
                if dl_resp.status_code != 200:
                    return _failed(
                        upload_id, t0,
                        f"Download HTTP {dl_resp.status_code}: {dl_resp.text[:200]}"
                    )

                return _handle_completed_download(
                    upload_id=upload_id,
                    content=dl_resp.content,
                    t0=t0,
                    payload=status_data,
                )

            if job_status == "FAILED":
                client.close()
                err_msg = status_data.get("errorMessage") or status_data.get("error") or "Job FAILED"
                return _failed(upload_id, t0, f"Oberon Redact-Job FAILED: {err_msg}")

            # RUNNING / unbekannt → weiter warten

        # Timeout erreicht
        client.close()
        elapsed = int((time.monotonic() - t0))
        return _failed(
            upload_id, t0,
            f"Timeout: Redact-Job {job_id} nicht abgeschlossen nach {elapsed}s"
        )

    # ── Sonstiger HTTP-Fehler ─────────────────────────────────────────────────
    client.close()
    try:
        err_body = resp.json()
        err_msg = err_body.get("error", resp.text[:200])
    except Exception:
        err_msg = resp.text[:200]

    logger.error(
        "[dsgvo.redact] Oberon HTTP %d: %s upload_id=%s",
        resp.status_code, err_msg, upload_id,
    )
    return _failed(upload_id, t0, f"Oberon HTTP {resp.status_code}: {err_msg}")


# ── Hilfsfunktionen ────────────────────────────────────────────────────────────

def _failed(upload_id: str, t0: float, error: str) -> UploadResult:
    """Erstellt ein fehlgeschlagenes UploadResult."""
    dauer_ms = int((time.monotonic() - t0) * 1000)
    plog.step("dsgvo.redact", "failed",
              input={"upload_id": upload_id}, output={"error": error},
              dauer_ms=dauer_ms, ok=False)
    return UploadResult(
        upload_id=upload_id,
        status="failed",
        operation="dsgvo.redact",
        completed_at=datetime.now(timezone.utc),
        duration_ms=dauer_ms,
        result_summary=None,
        result_payload={},
        artifact_url=None,
        artifact_mime=None,
        error=error,
    )


def _try_json(resp: httpx.Response) -> dict:
    """Parst JSON aus Response, gibt leeres dict zurück bei Fehler."""
    try:
        return resp.json()
    except Exception:
        return {}


def _handle_completed_download(
    upload_id: str,
    content: bytes,
    t0: float,
    payload: dict,
) -> UploadResult:
    """Persistiert das redaktierte Dokument und baut das UploadResult."""
    dauer_ms = int((time.monotonic() - t0) * 1000)

    # Artifact auf Filesystem speichern
    artifact_path: str | None = None
    artifact_url: str | None = None
    try:
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        out_file = UPLOAD_DIR / f"{upload_id}.redacted.pdf"
        out_file.write_bytes(content)
        artifact_path = str(out_file)
        artifact_url = f"/api/v1/uploads/{upload_id}/artifact"
        logger.info("[dsgvo.redact] Artifact gespeichert: %s", artifact_path)
    except OSError as exc:
        logger.warning("[dsgvo.redact] Artifact-Speicherung fehlgeschlagen: %s", exc)

    # Schwärzungen aus Payload extrahieren (Oberon-Antwort ist nicht 100% standardisiert)
    n_redactions: int = (
        payload.get("redactionsCount")
        or payload.get("redactions_count")
        or payload.get("n_redactions")
        or 0
    )
    summary = f"Dokument anonymisiert: {n_redactions} Stellen geschwärzt"

    plog.step(
        "dsgvo.redact", "done",
        input={"upload_id": upload_id},
        output={"n_redactions": n_redactions, "artifact_path": artifact_path},
        dauer_ms=dauer_ms, ok=True,
    )
    logger.info("[dsgvo.redact] %s upload_id=%s", summary, upload_id)

    return UploadResult(
        upload_id=upload_id,
        status="completed",
        operation="dsgvo.redact",
        completed_at=datetime.now(timezone.utc),
        duration_ms=dauer_ms,
        result_summary=summary,
        result_payload={
            **payload,
            "artifact_path": artifact_path,
            "artifact_size_bytes": len(content),
        },
        artifact_url=artifact_url,
        artifact_mime="application/pdf",
        error=None,
    )
