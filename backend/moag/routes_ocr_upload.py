"""
OCRexpert-Upload-Router — echter multipart/form-data-Datei-Upload an OCRexpert.

Hintergrund (MOAG-Backlog Phase 1.5b):
Die alte Aktion `ocrexpert.process` schickte JSON `{pfad: ...}` an OCRexpert
`/api/v1/process`. OCRexpert erwartet laut seiner OpenAPI aber einen echten
multipart/form-data-Upload (Feld `file`) → JSON fuehrte zu HTTP 422.

Dieser Router schliesst die Luecke:
  POST /api/v1/ocrexpert/upload
nimmt eine echte Datei (FastAPI File(...)) + optionale Verarbeitungs-Parameter,
validiert sie (Endung/Groesse analog api._validate_upload) und leitet sie als
multipart/form-data an OCRexpert weiter.

OCRexpert /api/v1/process-Vertrag (aus OCRexpert/ocrexpert/service/app.py
v1_process, Stand 2026-06-01):
  - file:        UploadFile = File(...)        → multipart-File-Feld "file"
  - profile:     Query("generic")
  - output:      Query("raw")  # raw | pdfa
  - language:    Query("deu+eng")
  - inline_pdfa: Query(False)
  → Antwort: ProcessV1Response {status, job_id, text, text_len, pages,
                                 quality{...}, pdfa_url, pdfa_base64, duration_ms}

Wichtig: profile/output/language/inline_pdfa sind bei OCRexpert QUERY-Parameter,
NICHT Form-Felder. MOAG nimmt sie als optionale Form-Felder entgegen (bequemer
fuer das Frontend) und reicht sie als Query-String an OCRexpert weiter.

MOAG ruft OCRexpert ausschliesslich ueber HTTP an (CLAUDE.md, ADR / Phase 1.5).
Auth: keine im LAN (Funktion vor Sicherheit). Optionaler Bearer-Token wird
durchgereicht, falls in den Settings gesetzt.
"""
from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import httpx
from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from moag.pipeline_hooks import plog
from moag.settings_store import SettingsStore

logger = logging.getLogger("moag.routes_ocr_upload")

# Limits — bewusst eigene Konstanten (Router ist isoliert testbar, kein Import
# aus api.py, um Parallel-Edits im selben Repo nicht zu kollidieren).
MAX_UPLOAD_MB = 200
ALLOWED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".tif", ".tiff"}

# OCRexpert-Pfad fuer den Upload-basierten Process-Endpoint
OCREXPERT_PROCESS_PATH = "/api/v1/process"

# Timeout fuer OCR — OCR kann lange dauern, daher grosszuegig
UPSTREAM_TIMEOUT_S = 120.0


def _validate_upload(filename: str, size_bytes: int) -> Optional[str]:
    """Validiert Dateiname (Endung) + Groesse. Gibt Fehlertext oder None zurueck.

    Logik bewusst spiegelbildlich zu api._validate_upload gehalten.
    """
    if not filename:
        return "filename leer"
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        return f"Dateiendung {ext or '(keine)'} nicht unterstuetzt"
    if size_bytes > MAX_UPLOAD_MB * 1024 * 1024:
        return f"Datei {size_bytes / 1024 / 1024:.1f} MB > Limit {MAX_UPLOAD_MB} MB"
    return None


def _safe_filename(name: str) -> str:
    """Whitelist-basierte Dateinamen-Saeuberung (kein Pfad-Traversal)."""
    base = Path(name).name
    safe = "".join(c for c in base if c.isalnum() or c in "._- ")
    return safe or "unbenannt"


def build_ocr_upload_router(settings_store: SettingsStore) -> APIRouter:
    """Baut den OCRexpert-Upload-Router.

    Der Router ist bewusst self-contained (eigene Validierung, eigener
    httpx-Aufruf), damit er in Tests gegen eine eigene FastAPI-App gehaengt
    werden kann.
    """
    router = APIRouter(tags=["ocrexpert-upload"])

    @router.post("/api/v1/ocrexpert/upload")
    async def upload_to_ocrexpert(
        file: UploadFile = File(...),
        profile: str = Form(default="generic"),
        output: str = Form(default="raw"),
        language: str = Form(default="deu+eng"),
        inline_pdfa: bool = Form(default=False),
    ) -> dict[str, Any]:
        """Nimmt eine Datei entgegen und leitet sie als multipart an OCRexpert weiter.

        Validiert Endung + Groesse. Reicht die OCRexpert-Antwort strukturiert
        zurueck ({ok, status, upstream_status, result/error}). OCRexpert-Fehler
        (4xx/5xx/Timeout/Connect) werden sauber als JSON gemeldet, ohne dass der
        MOAG-Endpoint crasht — Frontend bekommt immer ein deterministisches Schema.
        """
        t0 = time.monotonic()
        filename = file.filename or ""

        data = await file.read()
        err = _validate_upload(filename, len(data))
        if err:
            plog.step(
                "ocrexpert.upload", "validate",
                input={"filename": filename, "size": len(data)},
                output={"error": err}, ok=False,
            )
            # 400: Client-Fehler (Validierung) — nicht weiterreichen an OCRexpert
            raise HTTPException(status_code=400, detail=err)

        safe_name = _safe_filename(filename)

        s = settings_store.get()
        base = (s.ocrexpert_base_url or "").rstrip("/")
        url = f"{base}{OCREXPERT_PROCESS_PATH}"

        headers: dict[str, str] = {}
        token = getattr(s, "ocrexpert_token", None)
        if token:
            headers["Authorization"] = f"Bearer {token}"

        # OCRexpert erwartet profile/output/language/inline_pdfa als Query-Params
        params = {
            "profile": profile,
            "output": output,
            "language": language,
            "inline_pdfa": str(inline_pdfa).lower(),
        }

        # multipart-File-Feld "file" mit Content-Type des Uploads
        content_type = file.content_type or "application/octet-stream"
        files = {"file": (safe_name, data, content_type)}

        plog.step(
            "ocrexpert.upload", "forward",
            input={"url": url, "filename": safe_name, "size": len(data), "params": params},
            output={"forwarding": True}, ok=True,
        )

        try:
            async with httpx.AsyncClient(timeout=UPSTREAM_TIMEOUT_S) as client:
                resp = await client.post(url, params=params, files=files, headers=headers)
        except httpx.TimeoutException as exc:
            dauer_ms = int((time.monotonic() - t0) * 1000)
            logger.warning("OCRexpert-Upload Timeout (%s): %s", url, exc)
            plog.step(
                "ocrexpert.upload", "forward",
                input={"url": url}, output={"error": "timeout"},
                dauer_ms=dauer_ms, ok=False,
            )
            return {
                "ok": False,
                "status": "error",
                "error": f"OCRexpert-Timeout nach {UPSTREAM_TIMEOUT_S:.0f}s",
                "upstream_status": None,
                "fetched_at": datetime.now(timezone.utc).isoformat(),
            }
        except httpx.HTTPError as exc:
            dauer_ms = int((time.monotonic() - t0) * 1000)
            logger.warning("OCRexpert-Upload Verbindungsfehler (%s): %s", url, exc)
            plog.step(
                "ocrexpert.upload", "forward",
                input={"url": url}, output={"error": type(exc).__name__},
                dauer_ms=dauer_ms, ok=False,
            )
            return {
                "ok": False,
                "status": "error",
                "error": f"OCRexpert nicht erreichbar: {type(exc).__name__}",
                "upstream_status": None,
                "fetched_at": datetime.now(timezone.utc).isoformat(),
            }

        dauer_ms = int((time.monotonic() - t0) * 1000)

        # Antwort von OCRexpert parsen (JSON falls moeglich, sonst Text)
        try:
            upstream_body: Any = resp.json()
        except Exception:
            upstream_body = resp.text

        if resp.is_success:
            plog.step(
                "ocrexpert.upload", "forward",
                input={"url": url}, output={"upstream_status": resp.status_code},
                dauer_ms=dauer_ms, ok=True,
            )
            return {
                "ok": True,
                "status": "ok",
                "upstream_status": resp.status_code,
                "result": upstream_body,
                "filename": safe_name,
                "duration_ms": dauer_ms,
                "fetched_at": datetime.now(timezone.utc).isoformat(),
            }

        # OCRexpert-Fehler (z.B. 400/422/500) sauber durchreichen, nicht crashen
        logger.info("OCRexpert-Upload Fehlerstatus %s: %s", resp.status_code, str(upstream_body)[:300])
        plog.step(
            "ocrexpert.upload", "forward",
            input={"url": url}, output={"upstream_status": resp.status_code},
            dauer_ms=dauer_ms, ok=False,
        )
        return {
            "ok": False,
            "status": "error",
            "upstream_status": resp.status_code,
            "error": f"OCRexpert antwortete HTTP {resp.status_code}",
            "upstream": upstream_body,
            "filename": safe_name,
            "duration_ms": dauer_ms,
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        }

    return router
