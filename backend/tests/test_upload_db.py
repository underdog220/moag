"""
Tests für Upload-Hub DB-Schicht (provision + ensure_schema + CRUD).

Alle Tests nutzen den SQLite-Fallback — kein echter PostgreSQL nötig.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path

import pytest
import pytest_asyncio


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def isolate_db(tmp_path: Path, monkeypatch):
    """Jeder Test bekommt eine frische SQLite-DB in tmp_path."""
    db_path = tmp_path / "test_uploads.db"
    # Kein PostgreSQL (kein MOAG_DB_URL), kein Oberon — SQLite-Fallback erzwingen
    monkeypatch.setenv("MOAG_DB_CACHE_PATH", str(tmp_path / "db.json"))
    monkeypatch.delenv("MOAG_DB_URL", raising=False)
    monkeypatch.delenv("MOAG_OBERON_BASE_URL", raising=False)

    # Globalen DB-State zurücksetzen (damit jeder Test neu initialisiert)
    import moag.upload.db as _db
    _db._pool = None
    _db._sqlite_path = None
    _db._using_sqlite = False
    _db._schema_ensured = False

    # Oberon-Provisioning deaktivieren: Fallback auf SQLite erzwingen
    # indem wir _resolve_conn_url auf None patchen
    async def _no_provision():
        return None

    monkeypatch.setattr(_db, "provision_db", _no_provision)

    yield

    # Cleanup
    _db._pool = None
    _db._sqlite_path = None
    _db._using_sqlite = False
    _db._schema_ensured = False


@pytest.fixture
def sample_upload():
    from moag.upload.schemas import Upload
    return Upload(
        upload_id="01J000000000000000000001ZZ",
        operation="ocr.standard",
        filename="test.pdf",
        size_bytes=1024,
        mime="application/pdf",
        uploaded_at=datetime.now(timezone.utc),
        status="queued",
        params={"engine": "tesseract"},
    )


# ── Tests ──────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_ensure_pool_sqlite_fallback():
    """ensure_pool() aktiviert SQLite-Fallback wenn kein PostgreSQL da."""
    import moag.upload.db as _db
    await _db.ensure_pool()
    assert _db._using_sqlite is True
    assert _db._sqlite_path is not None


@pytest.mark.asyncio
async def test_ensure_schema_erstellt_tabellen(tmp_path):
    """ensure_schema() legt uploads + upload_files Tabellen an."""
    import sqlite3
    import moag.upload.db as _db

    await _db.ensure_pool()
    await _db.ensure_schema()

    db_path = _db._sqlite_path
    assert db_path is not None and db_path.exists()

    conn = sqlite3.connect(str(db_path))
    tables = {
        row[0]
        for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()
    }
    conn.close()

    assert "uploads" in tables, "uploads-Tabelle muss existieren"
    assert "upload_files" in tables, "upload_files-Tabelle muss existieren"


@pytest.mark.asyncio
async def test_ensure_schema_idempotent():
    """ensure_schema() kann mehrfach aufgerufen werden (CREATE IF NOT EXISTS)."""
    import moag.upload.db as _db

    await _db.ensure_pool()
    await _db.ensure_schema()
    await _db.ensure_schema()  # zweiter Aufruf darf nicht crashen


@pytest.mark.asyncio
async def test_create_und_read_upload(sample_upload):
    """create_upload + get_upload Roundtrip."""
    import moag.upload.db as _db
    from moag.upload.repository import create_upload, get_upload

    await _db.ensure_pool()
    await _db.ensure_schema()

    file_bytes = b"PDF-Inhalt" * 100  # < 5 MB → BYTEA

    returned_id = await create_upload(sample_upload, file_bytes)
    assert returned_id == sample_upload.upload_id

    loaded = await get_upload(sample_upload.upload_id)
    assert loaded is not None
    assert loaded.upload_id == sample_upload.upload_id
    assert loaded.operation == "ocr.standard"
    assert loaded.filename == "test.pdf"
    assert loaded.size_bytes == 1024
    assert loaded.status == "queued"
    assert loaded.params == {"engine": "tesseract"}


@pytest.mark.asyncio
async def test_get_upload_nicht_vorhanden():
    """get_upload liefert None für unbekannte upload_id."""
    import moag.upload.db as _db
    from moag.upload.repository import get_upload

    await _db.ensure_pool()
    await _db.ensure_schema()

    result = await get_upload("unbekannte-id-999")
    assert result is None


@pytest.mark.asyncio
async def test_file_bytes_bytea(sample_upload):
    """Kleine Datei (< 5 MB) wird als BYTEA gespeichert und zurückgelesen."""
    import moag.upload.db as _db
    from moag.upload.repository import create_upload, get_file_bytes

    await _db.ensure_pool()
    await _db.ensure_schema()

    original_bytes = b"kleine PDF Daten" * 10
    await create_upload(sample_upload, original_bytes)

    loaded_bytes = await get_file_bytes(sample_upload.upload_id)
    assert loaded_bytes == original_bytes


@pytest.mark.asyncio
async def test_file_bytes_filesystem(tmp_path, sample_upload, monkeypatch):
    """Große Datei (>= 5 MB) wird im Filesystem gespeichert."""
    import moag.upload.db as _db
    from moag.upload.repository import create_upload, get_file_bytes

    # Filesystem-Verzeichnis in tmp_path setzen
    fs_dir = tmp_path / "uploads"
    monkeypatch.setenv("MOAG_UPLOAD_FS_DIR", str(fs_dir))

    await _db.ensure_pool()
    await _db.ensure_schema()

    # Große Datei: > 5 MB
    large_bytes = b"X" * (6 * 1024 * 1024)

    await create_upload(sample_upload, large_bytes)

    loaded_bytes = await get_file_bytes(sample_upload.upload_id)
    assert loaded_bytes == large_bytes

    # Filesystem-Datei muss existieren
    fs_files = list(fs_dir.iterdir())
    assert len(fs_files) >= 1


@pytest.mark.asyncio
async def test_update_status(sample_upload):
    """update_status schreibt Ergebnis-Felder korrekt."""
    import moag.upload.db as _db
    from moag.upload.repository import create_upload, update_status, get_upload_result

    await _db.ensure_pool()
    await _db.ensure_schema()

    await create_upload(sample_upload, b"Testdaten")
    await update_status(
        sample_upload.upload_id,
        status="completed",
        result_summary="OCR erfolgreich",
        result_payload={"pages": 1, "text": "Hallo Welt"},
        duration_ms=1234,
    )

    result = await get_upload_result(sample_upload.upload_id)
    assert result is not None
    assert result.status == "completed"
    assert result.result_summary == "OCR erfolgreich"
    assert result.result_payload == {"pages": 1, "text": "Hallo Welt"}
    assert result.duration_ms == 1234
    assert result.completed_at is not None


@pytest.mark.asyncio
async def test_list_uploads_leer():
    """list_uploads gibt leere Liste zurück wenn keine Uploads vorhanden."""
    import moag.upload.db as _db
    from moag.upload.repository import list_uploads

    await _db.ensure_pool()
    await _db.ensure_schema()

    uploads, total = await list_uploads(status=None, operation=None, limit=20, offset=0)
    assert uploads == []
    assert total == 0


@pytest.mark.asyncio
async def test_list_uploads_mit_filter(sample_upload):
    """list_uploads filtert nach Status und Operation."""
    import moag.upload.db as _db
    from moag.upload.repository import create_upload, list_uploads
    from moag.upload.schemas import Upload

    await _db.ensure_pool()
    await _db.ensure_schema()

    # Zwei Uploads: ocr.standard (queued) + llm.text (queued)
    upload2 = Upload(
        upload_id="01J000000000000000000002ZZ",
        operation="llm.text",
        filename="doc.pdf",
        size_bytes=512,
        mime="application/pdf",
        uploaded_at=datetime.now(timezone.utc),
        status="queued",
        params={},
    )
    await create_upload(sample_upload, b"Datei1")
    await create_upload(upload2, b"Datei2")

    # Filter nach Operation
    ocr_only, ocr_total = await list_uploads(
        status=None, operation="ocr.standard", limit=20, offset=0
    )
    assert ocr_total == 1
    assert ocr_only[0].operation == "ocr.standard"

    # Filter nach Status
    all_queued, queued_total = await list_uploads(
        status="queued", operation=None, limit=20, offset=0
    )
    assert queued_total == 2


@pytest.mark.asyncio
async def test_list_uploads_mit_eintraegen_dict_zugriff(sample_upload):
    """list_uploads liefert Upload-Objekte mit korrektem dict-Zugriff wenn Einträge vorhanden.

    Regression-Test für Bug: row["upload_id"] → TypeError: tuple indices must be integers.
    Reproduziert den Live-Crash auf /api/v1/uploads wenn >= 1 Upload existiert.
    """
    import moag.upload.db as _db
    from moag.upload.repository import create_upload, list_uploads

    await _db.ensure_pool()
    await _db.ensure_schema()

    # Upload anlegen — jetzt ist die DB nicht leer
    await create_upload(sample_upload, b"Testinhalt fuer list-crash-repro")

    # Genau dieser Aufruf crashte live mit TypeError: tuple indices must be integers
    uploads, total = await list_uploads(status=None, operation=None, limit=20, offset=0)

    assert total == 1, f"Erwartet 1 Upload, bekommen: {total}"
    assert len(uploads) == 1
    u = uploads[0]
    assert u.upload_id == sample_upload.upload_id
    assert u.operation == "ocr.standard"
    assert u.filename == "test.pdf"
    assert u.size_bytes == 1024
    assert u.status == "queued"
    assert u.params == {"engine": "tesseract"}


@pytest.mark.asyncio
async def test_delete_upload(sample_upload):
    """delete_upload entfernt Upload aus DB + Filesystem-Cleanup."""
    import moag.upload.db as _db
    from moag.upload.repository import create_upload, delete_upload, get_upload, get_file_bytes

    await _db.ensure_pool()
    await _db.ensure_schema()

    await create_upload(sample_upload, b"zu loeschende Daten")

    # Vor Delete: vorhanden
    assert await get_upload(sample_upload.upload_id) is not None

    await delete_upload(sample_upload.upload_id)

    # Nach Delete: weg
    assert await get_upload(sample_upload.upload_id) is None
    assert await get_file_bytes(sample_upload.upload_id) is None
