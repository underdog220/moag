"""
Upload-Hub Repository — CRUD-Operationen auf uploads + upload_files.

Abstraktion über PostgreSQL (via psycopg) und SQLite-Fallback.
Beide Pfade nutzen dasselbe Interface — Unterschiede im SQL-Dialekt
(JSONB vs TEXT, TIMESTAMPTZ vs DATETIME) werden hier behandelt.
"""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import moag.upload.db as _db_mod
from moag.upload.db import BYTEA_THRESHOLD, get_conn, ensure_pool, ensure_schema
from moag.upload.schemas import Upload, UploadResult

logger = logging.getLogger("moag.upload.repository")

# Filesystem-Basisverzeichnis für große Dateien (>= 5 MB)
_DEFAULT_UPLOAD_FS_DIR = "/data/moag/uploads"


def _fs_dir() -> Path:
    raw = os.environ.get("MOAG_UPLOAD_FS_DIR", _DEFAULT_UPLOAD_FS_DIR)
    p = Path(raw)
    # Fallback: ~/.moag/uploads wenn /data nicht beschreibbar
    if not p.parent.exists():
        p = Path.home() / ".moag" / "uploads"
    p.mkdir(parents=True, exist_ok=True)
    return p


def _gen_upload_id() -> str:
    """Generiert ULID (26 Zeichen) oder fallback secrets.token_urlsafe(20)."""
    try:
        from ulid import ULID  # type: ignore[import]
        return str(ULID())
    except ImportError:
        pass
    try:
        from python_ulid import ULID as ULID2  # type: ignore[import]
        return str(ULID2())
    except ImportError:
        pass
    import secrets
    return secrets.token_urlsafe(20)[:26]


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _parse_dt(val: Any) -> datetime | None:
    """Parst Datetime-Wert aus DB (str oder datetime-Objekt)."""
    if val is None:
        return None
    if isinstance(val, datetime):
        return val if val.tzinfo else val.replace(tzinfo=timezone.utc)
    try:
        dt = datetime.fromisoformat(str(val))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        return None


def _parse_json(val: Any) -> dict:
    """Parst JSON-Wert aus DB (str oder dict)."""
    if val is None:
        return {}
    if isinstance(val, dict):
        return val
    try:
        return json.loads(val)
    except Exception:
        return {}


def _row_to_upload(row: Any) -> Upload:
    """Konvertiert DB-Zeile in Upload-Pydantic-Modell."""
    return Upload(
        upload_id=row["upload_id"],
        operation=row["operation"],
        filename=row["filename"],
        size_bytes=row["size_bytes"],
        mime=row["mime"] or "",
        uploaded_at=_parse_dt(row["uploaded_at"]) or _now_utc(),
        status=row["status"],
        params=_parse_json(row["params"]),
    )


def _row_to_result(row: Any) -> UploadResult:
    """Konvertiert DB-Zeile in UploadResult-Pydantic-Modell."""
    return UploadResult(
        upload_id=row["upload_id"],
        status=row["status"],
        operation=row["operation"],
        completed_at=_parse_dt(row["completed_at"]),
        duration_ms=row["duration_ms"],
        result_summary=row["result_summary"],
        result_payload=_parse_json(row["result_payload"]),
        artifact_url=(
            f"/api/v1/uploads/{row['upload_id']}/artifact"
            if row["artifact_path"]
            else None
        ),
        artifact_mime=row["artifact_mime"],
        error=row["error"],
    )


# ── CRUD-Funktionen ────────────────────────────────────────────────────────────


async def create_upload(upload_meta: Upload, file_bytes: bytes) -> str:
    """Speichert Upload-Metadaten + Dateiinhalt in DB.

    Gibt upload_id zurück.
    File-Storage-Strategie:
      < 5 MB  → BYTEA in upload_files.content
      >= 5 MB → Filesystem unter MOAG_UPLOAD_FS_DIR/<upload_id>
    """
    upload_id = upload_meta.upload_id or _gen_upload_id()
    now = _now_utc()

    # Storage-Strategie bestimmen
    if len(file_bytes) < BYTEA_THRESHOLD:
        storage_kind = "bytea"
        fs_path = None
        content_bytes = file_bytes
    else:
        storage_kind = "filesystem"
        fs_path = str(_fs_dir() / upload_id)
        content_bytes = None
        Path(fs_path).write_bytes(file_bytes)

    params_json = json.dumps(upload_meta.params)
    uploaded_at = upload_meta.uploaded_at or now

    async with await get_conn() as conn:
        if _db_mod._using_sqlite:
            await conn.execute(
                """INSERT INTO uploads
                   (upload_id, operation, filename, mime, size_bytes,
                    uploaded_at, status, params)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    upload_id,
                    upload_meta.operation,
                    upload_meta.filename,
                    upload_meta.mime,
                    upload_meta.size_bytes,
                    uploaded_at.isoformat(),
                    upload_meta.status,
                    params_json,
                ),
            )
            await conn.execute(
                """INSERT INTO upload_files
                   (upload_id, storage_kind, content, filesystem_path)
                   VALUES (?, ?, ?, ?)""",
                (upload_id, storage_kind, content_bytes, fs_path),
            )
        else:
            await conn.execute(
                """INSERT INTO uploads
                   (upload_id, operation, filename, mime, size_bytes,
                    uploaded_at, status, params)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s::jsonb)""",
                (
                    upload_id,
                    upload_meta.operation,
                    upload_meta.filename,
                    upload_meta.mime,
                    upload_meta.size_bytes,
                    uploaded_at,
                    upload_meta.status,
                    params_json,
                ),
            )
            await conn.execute(
                """INSERT INTO upload_files
                   (upload_id, storage_kind, content, filesystem_path)
                   VALUES (%s, %s, %s, %s)""",
                (upload_id, storage_kind, content_bytes, fs_path),
            )
        await conn.commit()

    return upload_id


async def get_upload(upload_id: str) -> Upload | None:
    """Liest Upload-Metadaten aus DB. None wenn nicht gefunden."""
    async with await get_conn() as conn:
        if _db_mod._using_sqlite:
            row = await conn.fetchone(
                "SELECT * FROM uploads WHERE upload_id = ?", (upload_id,)
            )
        else:
            cur = await conn.execute(
                "SELECT * FROM uploads WHERE upload_id = %s", (upload_id,)
            )
            row = await cur.fetchone()

    if row is None:
        return None
    return _row_to_upload(row)


async def get_upload_result(upload_id: str) -> UploadResult | None:
    """Liest Upload + Result-Daten aus DB. None wenn nicht gefunden."""
    async with await get_conn() as conn:
        if _db_mod._using_sqlite:
            row = await conn.fetchone(
                "SELECT * FROM uploads WHERE upload_id = ?", (upload_id,)
            )
        else:
            cur = await conn.execute(
                "SELECT * FROM uploads WHERE upload_id = %s", (upload_id,)
            )
            row = await cur.fetchone()

    if row is None:
        return None
    return _row_to_result(row)


async def list_uploads(
    status: str | None,
    operation: str | None,
    limit: int,
    offset: int,
) -> tuple[list[Upload], int]:
    """Listet Uploads mit optionalem Filter. Gibt (Liste, Gesamt-Count) zurück."""
    conditions: list[str] = []
    params_vals: list[Any] = []

    if _db_mod._using_sqlite:
        placeholder = "?"
    else:
        placeholder = "%s"

    if status:
        conditions.append(f"status = {placeholder}")
        params_vals.append(status)
    if operation:
        conditions.append(f"operation = {placeholder}")
        params_vals.append(operation)

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    # AS n: einheitlicher Spaltenname für beide DB-Backends (dict_row/sqlite3.Row)
    count_sql = f"SELECT COUNT(*) AS n FROM uploads {where}"
    list_sql = (
        f"SELECT * FROM uploads {where} "
        f"ORDER BY uploaded_at DESC "
        f"LIMIT {placeholder} OFFSET {placeholder}"
    )
    list_params = params_vals + [limit, offset]
    count_params = tuple(params_vals)

    async with await get_conn() as conn:
        if _db_mod._using_sqlite:
            count_row = await conn.fetchone(count_sql, tuple(count_params))
            total = count_row["n"] if count_row else 0
            rows = await conn.fetchall(list_sql, tuple(list_params))
        else:
            cur = await conn.execute(count_sql, count_params)
            count_row = await cur.fetchone()
            total = count_row["n"] if count_row else 0
            cur = await conn.execute(list_sql, tuple(list_params))
            rows = await cur.fetchall()

    uploads = [_row_to_upload(r) for r in rows]
    return uploads, total


async def update_status(
    upload_id: str,
    status: str,
    result_summary: str | None = None,
    result_payload: dict | None = None,
    artifact_path: str | None = None,
    artifact_mime: str | None = None,
    error: str | None = None,
    duration_ms: int | None = None,
) -> None:
    """Aktualisiert Status + Ergebnis-Felder eines Uploads."""
    completed_at = _now_utc() if status in ("completed", "failed") else None
    result_json = json.dumps(result_payload or {})

    async with await get_conn() as conn:
        if _db_mod._using_sqlite:
            await conn.execute(
                """UPDATE uploads SET
                   status = ?,
                   completed_at = ?,
                   result_summary = ?,
                   result_payload = ?,
                   artifact_path = ?,
                   artifact_mime = ?,
                   error = ?,
                   duration_ms = ?
                   WHERE upload_id = ?""",
                (
                    status,
                    completed_at.isoformat() if completed_at else None,
                    result_summary,
                    result_json,
                    artifact_path,
                    artifact_mime,
                    error,
                    duration_ms,
                    upload_id,
                ),
            )
        else:
            await conn.execute(
                """UPDATE uploads SET
                   status = %s,
                   completed_at = %s,
                   result_summary = %s,
                   result_payload = %s::jsonb,
                   artifact_path = %s,
                   artifact_mime = %s,
                   error = %s,
                   duration_ms = %s
                   WHERE upload_id = %s""",
                (
                    status,
                    completed_at,
                    result_summary,
                    result_json,
                    artifact_path,
                    artifact_mime,
                    error,
                    duration_ms,
                    upload_id,
                ),
            )
        await conn.commit()


async def get_file_bytes(upload_id: str) -> bytes | None:
    """Liest Dateiinhalt aus DB (BYTEA) oder Filesystem. None wenn nicht gefunden."""
    async with await get_conn() as conn:
        if _db_mod._using_sqlite:
            row = await conn.fetchone(
                "SELECT storage_kind, content, filesystem_path FROM upload_files WHERE upload_id = ?",
                (upload_id,),
            )
        else:
            cur = await conn.execute(
                "SELECT storage_kind, content, filesystem_path FROM upload_files WHERE upload_id = %s",
                (upload_id,),
            )
            row = await cur.fetchone()

    if row is None:
        return None

    if row["storage_kind"] == "bytea":
        return bytes(row["content"]) if row["content"] else None
    else:
        fs_path = row["filesystem_path"]
        if fs_path and Path(fs_path).exists():
            return Path(fs_path).read_bytes()
        return None


async def delete_upload(upload_id: str) -> None:
    """Löscht Upload aus DB + Filesystem-Cleanup."""
    # Filesystem-Pfad lesen vor DB-Löschung (CASCADE löscht upload_files)
    fs_path: str | None = None
    async with await get_conn() as conn:
        if _db_mod._using_sqlite:
            row = await conn.fetchone(
                "SELECT filesystem_path FROM upload_files WHERE upload_id = ?",
                (upload_id,),
            )
        else:
            cur = await conn.execute(
                "SELECT filesystem_path FROM upload_files WHERE upload_id = %s",
                (upload_id,),
            )
            row = await cur.fetchone()

        if row and row["filesystem_path"]:
            fs_path = row["filesystem_path"]

        # artifact_path aus uploads
        if _db_mod._using_sqlite:
            up_row = await conn.fetchone(
                "SELECT artifact_path FROM uploads WHERE upload_id = ?",
                (upload_id,),
            )
        else:
            cur = await conn.execute(
                "SELECT artifact_path FROM uploads WHERE upload_id = %s",
                (upload_id,),
            )
            up_row = await cur.fetchone()
        artifact_path: str | None = up_row["artifact_path"] if up_row else None

        # DB-Löschung: upload_files explizit zuerst löschen (SQLite benötigt
        # PRAGMA foreign_keys=ON für CASCADE — einfacher: manuell löschen)
        if _db_mod._using_sqlite:
            await conn.execute(
                "DELETE FROM upload_files WHERE upload_id = ?", (upload_id,)
            )
            await conn.execute(
                "DELETE FROM uploads WHERE upload_id = ?", (upload_id,)
            )
        else:
            # PostgreSQL: CASCADE ON DELETE übernimmt upload_files
            await conn.execute(
                "DELETE FROM uploads WHERE upload_id = %s", (upload_id,)
            )
        await conn.commit()

    # Filesystem-Cleanup
    for path_str in [fs_path, artifact_path]:
        if path_str:
            p = Path(path_str)
            if p.exists():
                try:
                    p.unlink()
                except Exception as exc:
                    logger.warning("Datei-Cleanup fehlgeschlagen (%s): %s", path_str, exc)
