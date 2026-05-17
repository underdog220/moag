"""
Upload-Hub REST-Endpoints.

Exakt nach docs/UPLOAD_SCHEMA.md §HTTP-Endpoints.

Routes:
  POST   /api/v1/upload
  GET    /api/v1/uploads
  GET    /api/v1/uploads/{upload_id}
  GET    /api/v1/uploads/{upload_id}/result
  GET    /api/v1/uploads/{upload_id}/artifact
  DELETE /api/v1/uploads/{upload_id}
"""
from __future__ import annotations

import json
import logging
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse

from moag.upload import db as upload_db
from moag.upload.handlers.registry import HANDLERS
from moag.upload.operations import OPERATIONS, compatible_operations
from moag.upload.repository import (
    create_upload,
    delete_upload,
    get_file_bytes,
    get_upload,
    get_upload_result,
    list_uploads,
    update_status,
    _gen_upload_id,
)
from moag.upload.schemas import Upload, UploadListResponse, UploadResult

logger = logging.getLogger("moag.upload.routes")

# Maximale Dateigröße (200 MB)
MAX_UPLOAD_BYTES = 200 * 1024 * 1024

router = APIRouter(prefix="/api/v1", tags=["upload"])


def _detect_mime(file_bytes: bytes, filename: str) -> str:
    """Erkennt MIME-Typ via Endungs-Mapping + optionale python-magic-Erkennung.

    python-magic ist optional. Auf Windows ohne libmagic.dll (python-magic-bin)
    deaktiviert ENV MOAG_DISABLE_MAGIC=1 den Magic-Byte-Check.
    """
    if not os.environ.get("MOAG_DISABLE_MAGIC", ""):
        # Nur versuchen wenn nicht explizit deaktiviert
        # Import-Fehler (fehlende DLL etc.) werden per os.environ.get abgefangen
        try:
            import magic  # type: ignore[import]
            detected = magic.from_buffer(file_bytes[:4096], mime=True)
            if detected and detected != "application/octet-stream":
                return detected
        except ImportError:
            # Kein python-magic installiert — Endungs-Fallback
            pass
        except Exception as exc:
            logger.debug("Magic-Byte-Erkennung fehlgeschlagen: %s", exc)

    # Endungs-Fallback
    ext = Path(filename).suffix.lower()
    _ext_map: dict[str, str] = {
        ".pdf": "application/pdf",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".tif": "image/tiff",
        ".tiff": "image/tiff",
        ".bmp": "image/bmp",
        ".webp": "image/webp",
        ".gif": "image/gif",
        ".heic": "image/heic",
        ".svg": "image/svg+xml",
        ".txt": "text/plain",
        ".md": "text/markdown",
        ".html": "text/html",
        ".htm": "text/html",
        ".csv": "text/csv",
        ".json": "application/json",
        ".xml": "application/xml",
        ".yaml": "application/x-yaml",
        ".yml": "application/x-yaml",
        ".log": "text/x-log",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        ".odt": "application/vnd.oasis.opendocument.text",
        ".rtf": "application/rtf",
        ".epub": "application/epub+zip",
        ".wav": "audio/wav",
        ".mp3": "audio/mpeg",
        ".m4a": "audio/mp4",
        ".ogg": "audio/ogg",
        ".flac": "audio/flac",
        ".aac": "audio/aac",
        ".py": "text/x-python",
        ".js": "text/javascript",
        ".ts": "text/x-typescript",
        ".go": "text/x-go",
        ".rs": "text/x-rust",
        ".java": "text/x-java",
        ".c": "text/x-c",
        ".cpp": "text/x-c++",
        ".sh": "text/x-shellscript",
        ".ps1": "text/x-shellscript",
        ".eml": "message/rfc822",
        ".msg": "application/vnd.ms-outlook",
    }
    return _ext_map.get(ext, "application/octet-stream")


async def _run_handler(
    upload_id: str,
    file_bytes: bytes,
    mime: str,
    operation: str,
    params: dict,
) -> UploadResult:
    """Ruft den registrierten Handler auf und aktualisiert Status in DB."""
    handler = HANDLERS.get(operation)
    if handler is None:
        await update_status(
            upload_id,
            status="failed",
            error=f"Kein Handler für operation '{operation}' registriert",
        )
        return UploadResult(
            upload_id=upload_id,
            status="failed",
            operation=operation,
            completed_at=datetime.now(timezone.utc),
            error=f"Kein Handler für operation '{operation}' registriert",
        )

    # Status auf "processing" setzen
    await update_status(upload_id, status="processing")

    t0 = time.monotonic()
    try:
        result = await handler(upload_id, file_bytes, mime, params)
        duration_ms = int((time.monotonic() - t0) * 1000)
        await update_status(
            upload_id,
            status=result.status,
            result_summary=result.result_summary,
            result_payload=result.result_payload,
            artifact_path=None,  # Handler setzt artifact_path selbst via update_status
            artifact_mime=result.artifact_mime,
            error=result.error,
            duration_ms=duration_ms,
        )
        return result
    except Exception as exc:
        duration_ms = int((time.monotonic() - t0) * 1000)
        logger.exception("Handler '%s' Fehler für upload %s: %s", operation, upload_id, exc)
        await update_status(
            upload_id,
            status="failed",
            error=f"{type(exc).__name__}: {exc}",
            duration_ms=duration_ms,
        )
        return UploadResult(
            upload_id=upload_id,
            status="failed",
            operation=operation,
            completed_at=datetime.now(timezone.utc),
            duration_ms=duration_ms,
            error=f"{type(exc).__name__}: {exc}",
        )


# ── POST /api/v1/upload ────────────────────────────────────────────────────────

@router.post("/upload")
async def post_upload(
    background: BackgroundTasks,
    file: UploadFile = File(..., description="Hochzuladende Datei (≤ 200 MB)"),
    operation: str = Form(..., description="Operation-ID z.B. 'ocr.standard'"),
    params: str | None = Form(default=None, description="JSON-String mit operation-spezifischen Parametern"),
) -> dict:
    """Multipart-Upload mit Operation-Trigger.

    Sync wenn estimated_duration_s ≤ 30, sonst BackgroundTask (202).
    """
    # Datei lesen + Größen-Check
    file_bytes = await file.read()
    if len(file_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Datei zu groß: {len(file_bytes)/1024/1024:.1f} MB > Limit 200 MB",
        )

    if not file_bytes:
        raise HTTPException(status_code=422, detail="Datei ist leer")

    # Operation-Check
    if operation not in OPERATIONS:
        raise HTTPException(
            status_code=422,
            detail=f"Unbekannte operation: '{operation}'. Bekannte: {list(OPERATIONS.keys())}",
        )

    # Params parsen
    params_dict: dict[str, Any] = {}
    if params:
        try:
            params_dict = json.loads(params)
        except json.JSONDecodeError as exc:
            raise HTTPException(
                status_code=422,
                detail=f"params ist kein gültiges JSON: {exc}",
            )

    # MIME-Erkennung
    filename = file.filename or "unbenannt"
    mime = _detect_mime(file_bytes, filename)

    # Upload-Eintrag anlegen
    upload_id = _gen_upload_id()
    upload_meta = Upload(
        upload_id=upload_id,
        operation=operation,
        filename=filename,
        size_bytes=len(file_bytes),
        mime=mime,
        uploaded_at=datetime.now(timezone.utc),
        status="queued",
        params=params_dict,
    )

    # Sicherstellen dass Pool + Schema initialisiert
    await upload_db.ensure_pool()
    await upload_db.ensure_schema()

    await create_upload(upload_meta, file_bytes)

    # Async oder Sync?
    op_cfg = OPERATIONS[operation]
    estimated_s = op_cfg.get("estimated_duration_s", 30)

    if estimated_s > 30:
        # Async: BackgroundTask + 202
        background.add_task(_run_handler, upload_id, file_bytes, mime, operation, params_dict)
        return {
            "upload_id": upload_id,
            "status": "queued",
            "operation": operation,
            "filename": filename,
            "size_bytes": len(file_bytes),
            "mime": mime,
            "uploaded_at": upload_meta.uploaded_at.isoformat(),
            "params": params_dict,
            "_async": True,
            "poll_url": f"/api/v1/uploads/{upload_id}/result",
        }

    # Sync: Handler sofort ausführen
    result = await _run_handler(upload_id, file_bytes, mime, operation, params_dict)
    return result.model_dump()


# ── GET /api/v1/uploads ───────────────────────────────────────────────────────

@router.get("/uploads", response_model=UploadListResponse)
async def get_uploads(
    status: str | None = Query(default=None, description="Filter nach Status"),
    operation: str | None = Query(default=None, description="Filter nach Operation"),
    limit: int = Query(default=20, ge=1, le=500, description="Maximale Anzahl Ergebnisse"),
    offset: int = Query(default=0, ge=0, description="Offset für Paginierung"),
) -> UploadListResponse:
    """Listet Uploads mit optionalen Filtern."""
    await upload_db.ensure_pool()
    await upload_db.ensure_schema()
    uploads, total = await list_uploads(status=status, operation=operation, limit=limit, offset=offset)
    return UploadListResponse(uploads=uploads, total=total, limit=limit, offset=offset)


# ── GET /api/v1/uploads/{upload_id} ──────────────────────────────────────────

@router.get("/uploads/{upload_id}", response_model=Upload)
async def get_upload_meta(upload_id: str) -> Upload:
    """Liefert Upload-Metadaten."""
    await upload_db.ensure_pool()
    upload = await get_upload(upload_id)
    if upload is None:
        raise HTTPException(status_code=404, detail=f"Upload '{upload_id}' nicht gefunden")
    return upload


# ── GET /api/v1/uploads/{upload_id}/result ───────────────────────────────────

@router.get("/uploads/{upload_id}/result", response_model=UploadResult)
async def get_upload_result_endpoint(upload_id: str) -> UploadResult:
    """Liefert das Verarbeitungs-Ergebnis eines Uploads."""
    await upload_db.ensure_pool()
    result = await get_upload_result(upload_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Upload '{upload_id}' nicht gefunden")
    return result


# ── GET /api/v1/uploads/{upload_id}/artifact ─────────────────────────────────

@router.get("/uploads/{upload_id}/artifact")
async def get_upload_artifact(upload_id: str) -> StreamingResponse:
    """Liefert die Output-Datei eines abgeschlossenen Uploads."""
    await upload_db.ensure_pool()
    result = await get_upload_result(upload_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Upload '{upload_id}' nicht gefunden")
    if not result.artifact_url:
        raise HTTPException(
            status_code=404,
            detail="Kein Artifact für diesen Upload (Operation hat keine Output-Datei erzeugt)",
        )

    # Artifact aus DB-Zeile lesen (artifact_path)
    # Für das Streaming-Response: Datei direkt lesen
    upload = await get_upload(upload_id)
    if upload is None:
        raise HTTPException(status_code=404, detail="Upload nicht gefunden")

    # artifact_path aus DB holen — über get_upload_result (hat result_payload)
    # Wir müssen direkt aus DB lesen
    from moag.upload.db import get_conn, _using_sqlite
    async with await get_conn() as conn:
        if _using_sqlite:
            row = await conn.fetchone(
                "SELECT artifact_path, artifact_mime FROM uploads WHERE upload_id = ?",
                (upload_id,),
            )
        else:
            cur = await conn.execute(
                "SELECT artifact_path, artifact_mime FROM uploads WHERE upload_id = %s",
                (upload_id,),
            )
            row = await cur.fetchone()

    if row is None or not row["artifact_path"]:
        raise HTTPException(status_code=404, detail="Artifact-Pfad nicht gesetzt")

    artifact_path = Path(row["artifact_path"])
    if not artifact_path.exists():
        raise HTTPException(status_code=404, detail="Artifact-Datei nicht mehr vorhanden")

    mime = row["artifact_mime"] or "application/octet-stream"

    def _iter_file():
        with artifact_path.open("rb") as f:
            while chunk := f.read(65536):
                yield chunk

    return StreamingResponse(
        _iter_file(),
        media_type=mime,
        headers={"Content-Disposition": f'attachment; filename="{artifact_path.name}"'},
    )


# ── DELETE /api/v1/uploads/{upload_id} ───────────────────────────────────────

@router.delete("/uploads/{upload_id}")
async def delete_upload_endpoint(upload_id: str) -> dict:
    """Löscht Upload + Result + Artifact aus DB und Filesystem."""
    await upload_db.ensure_pool()
    existing = await get_upload(upload_id)
    if existing is None:
        raise HTTPException(status_code=404, detail=f"Upload '{upload_id}' nicht gefunden")
    await delete_upload(upload_id)
    return {"deleted": upload_id, "ok": True}
