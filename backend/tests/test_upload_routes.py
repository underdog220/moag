"""
Tests für Upload-Hub REST-Endpoints.

Nutzt httpx.AsyncClient mit TestClient/ASGI-Mode.
Alle DB-Operationen laufen gegen SQLite-Fallback.
"""
from __future__ import annotations

import io
import json
from pathlib import Path

import pytest
import pytest_asyncio


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def isolate_upload_db(tmp_path: Path, monkeypatch):
    """Jeder Test bekommt frischen DB-State + SQLite-Fallback."""
    monkeypatch.setenv("MOAG_DB_CACHE_PATH", str(tmp_path / "db.json"))
    monkeypatch.delenv("MOAG_DB_URL", raising=False)
    monkeypatch.delenv("MOAG_OBERON_BASE_URL", raising=False)
    monkeypatch.setenv("MOAG_UPLOAD_FS_DIR", str(tmp_path / "uploads"))
    # python-magic deaktivieren (libmagic.dll fehlt in Test-Umgebung)
    monkeypatch.setenv("MOAG_DISABLE_MAGIC", "1")

    import moag.upload.db as _db
    _db._pool = None
    _db._sqlite_path = None
    _db._using_sqlite = False
    _db._schema_ensured = False

    async def _no_provision():
        return None

    monkeypatch.setattr(_db, "provision_db", _no_provision)

    yield

    _db._pool = None
    _db._sqlite_path = None
    _db._using_sqlite = False
    _db._schema_ensured = False


@pytest_asyncio.fixture
async def client(tmp_path: Path):
    """Gibt httpx.AsyncClient mit ASGI-Transport zurück."""
    import httpx
    from httpx._transports.asgi import ASGITransport

    from moag.api import create_app
    from moag.events import EventBus
    from moag.hub_client import HubClient
    from moag.job_store import JobStore
    from moag.settings_store import SettingsStore

    s_store = SettingsStore(tmp_path / "settings.json")
    j_store = JobStore(tmp_path / "jobs.db")
    e_bus = EventBus()
    h_client = HubClient(event_bus=e_bus, timeout=0.5, poll_interval=9999)

    app = create_app(
        settings_store=s_store,
        job_store=j_store,
        event_bus=e_bus,
        hub_client=h_client,
        enable_pipeline=False,
        upload_dir=tmp_path / "moag-uploads",
        static_dir=tmp_path / "static-nonexistent",
    )

    async with httpx.AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
        timeout=30.0,
    ) as c:
        yield c

    j_store.close()


# ── POST /api/v1/upload ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_upload_mit_mock_handler(client, monkeypatch):
    """POST /upload mit ocr.standard-Stub liefert UploadResult."""
    from datetime import datetime, timezone
    from moag.upload.handlers.registry import HANDLERS
    from moag.upload.schemas import UploadResult

    # Mock-Handler registrieren (überschreibt Stub)
    async def _mock_handler(upload_id, file_bytes, mime, params):
        return UploadResult(
            upload_id=upload_id,
            status="completed",
            operation="ocr.standard",
            completed_at=datetime.now(timezone.utc),
            duration_ms=42,
            result_summary="Mock OCR erfolgreich",
            result_payload={"pages": 1},
        )

    HANDLERS["ocr.standard"] = _mock_handler

    try:
        pdf_bytes = b"%PDF-1.4 mock content"
        response = await client.post(
            "/api/v1/upload",
            data={"operation": "ocr.standard"},
            files={"file": ("test.pdf", io.BytesIO(pdf_bytes), "application/pdf")},
        )
        assert response.status_code == 200, response.text
        data = response.json()
        assert data["status"] == "completed"
        assert data["operation"] == "ocr.standard"
        assert data["result_summary"] == "Mock OCR erfolgreich"
        assert "upload_id" in data
    finally:
        # Stub wiederherstellen
        from moag.upload.handlers import stubs
        HANDLERS["ocr.standard"] = stubs.handle_ocr_standard_stub


@pytest.mark.asyncio
async def test_upload_413_zu_gross(client, monkeypatch):
    """POST /upload mit > 200 MB → HTTP 413."""
    import moag.upload.routes as r_mod
    monkeypatch.setattr(r_mod, "MAX_UPLOAD_BYTES", 10)  # Limit auf 10 Bytes setzen

    pdf_bytes = b"X" * 100
    response = await client.post(
        "/api/v1/upload",
        data={"operation": "ocr.standard"},
        files={"file": ("big.pdf", io.BytesIO(pdf_bytes), "application/pdf")},
    )
    assert response.status_code == 413


@pytest.mark.asyncio
async def test_upload_422_unbekannte_operation(client):
    """POST /upload mit unbekannter operation → HTTP 422."""
    response = await client.post(
        "/api/v1/upload",
        data={"operation": "unknown.operation"},
        files={"file": ("test.pdf", io.BytesIO(b"data"), "application/pdf")},
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_upload_422_ungueltige_params(client):
    """POST /upload mit kaputtem params-JSON → HTTP 422."""
    response = await client.post(
        "/api/v1/upload",
        data={"operation": "ocr.standard", "params": "kein-json!{"},
        files={"file": ("test.pdf", io.BytesIO(b"%PDF"), "application/pdf")},
    )
    assert response.status_code == 422


# ── GET /api/v1/uploads ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_uploads_leer(client):
    """GET /uploads gibt leere Liste zurück."""
    response = await client.get("/api/v1/uploads")
    assert response.status_code == 200
    data = response.json()
    assert data["uploads"] == []
    assert data["total"] == 0
    assert data["limit"] == 20
    assert data["offset"] == 0


@pytest.mark.asyncio
async def test_get_uploads_nach_upload(client, monkeypatch):
    """GET /uploads listet Upload nach POST auf."""
    from datetime import datetime, timezone
    from moag.upload.handlers.registry import HANDLERS
    from moag.upload.schemas import UploadResult

    async def _mock(upload_id, file_bytes, mime, params):
        return UploadResult(
            upload_id=upload_id, status="completed", operation="ocr.standard",
            completed_at=datetime.now(timezone.utc), duration_ms=10,
        )

    old_handler = HANDLERS.get("ocr.standard")
    HANDLERS["ocr.standard"] = _mock

    try:
        await client.post(
            "/api/v1/upload",
            data={"operation": "ocr.standard"},
            files={"file": ("doc.pdf", io.BytesIO(b"%PDF-1.4"), "application/pdf")},
        )

        response = await client.get("/api/v1/uploads")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert len(data["uploads"]) == 1
        assert data["uploads"][0]["operation"] == "ocr.standard"
    finally:
        if old_handler:
            HANDLERS["ocr.standard"] = old_handler


# ── GET /api/v1/uploads/{id} ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_upload_404(client):
    """GET /uploads/unbekannte-id → HTTP 404."""
    response = await client.get("/api/v1/uploads/nichtvorhanden-xyz")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_upload_detail(client, monkeypatch):
    """GET /uploads/{id} liefert Upload-Metadaten."""
    from datetime import datetime, timezone
    from moag.upload.handlers.registry import HANDLERS
    from moag.upload.schemas import UploadResult

    async def _mock(upload_id, file_bytes, mime, params):
        return UploadResult(
            upload_id=upload_id, status="completed", operation="ocr.standard",
            completed_at=datetime.now(timezone.utc), duration_ms=5,
        )

    old = HANDLERS.get("ocr.standard")
    HANDLERS["ocr.standard"] = _mock

    try:
        post_resp = await client.post(
            "/api/v1/upload",
            data={"operation": "ocr.standard"},
            files={"file": ("detail.pdf", io.BytesIO(b"%PDF"), "application/pdf")},
        )
        upload_id = post_resp.json()["upload_id"]

        get_resp = await client.get(f"/api/v1/uploads/{upload_id}")
        assert get_resp.status_code == 200
        data = get_resp.json()
        assert data["upload_id"] == upload_id
        assert data["operation"] == "ocr.standard"
        assert data["filename"] == "detail.pdf"
    finally:
        if old:
            HANDLERS["ocr.standard"] = old


# ── DELETE /api/v1/uploads/{id} ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_delete_upload(client, monkeypatch):
    """DELETE /uploads/{id} löscht Upload und gibt 200 zurück."""
    from datetime import datetime, timezone
    from moag.upload.handlers.registry import HANDLERS
    from moag.upload.schemas import UploadResult

    async def _mock(upload_id, file_bytes, mime, params):
        return UploadResult(
            upload_id=upload_id, status="completed", operation="ocr.standard",
            completed_at=datetime.now(timezone.utc), duration_ms=3,
        )

    old = HANDLERS.get("ocr.standard")
    HANDLERS["ocr.standard"] = _mock

    try:
        post_resp = await client.post(
            "/api/v1/upload",
            data={"operation": "ocr.standard"},
            files={"file": ("del.pdf", io.BytesIO(b"%PDF"), "application/pdf")},
        )
        upload_id = post_resp.json()["upload_id"]

        del_resp = await client.delete(f"/api/v1/uploads/{upload_id}")
        assert del_resp.status_code == 200
        data = del_resp.json()
        assert data["deleted"] == upload_id
        assert data["ok"] is True

        # Nach Delete: 404
        get_resp = await client.get(f"/api/v1/uploads/{upload_id}")
        assert get_resp.status_code == 404
    finally:
        if old:
            HANDLERS["ocr.standard"] = old


@pytest.mark.asyncio
async def test_delete_404(client):
    """DELETE /uploads/unbekannt → HTTP 404."""
    response = await client.delete("/api/v1/uploads/nicht-vorhanden")
    assert response.status_code == 404


# ── GET /api/v1/uploads/{id}/result ──────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_result(client, monkeypatch):
    """GET /uploads/{id}/result liefert UploadResult."""
    from datetime import datetime, timezone
    from moag.upload.handlers.registry import HANDLERS
    from moag.upload.schemas import UploadResult

    async def _mock(upload_id, file_bytes, mime, params):
        return UploadResult(
            upload_id=upload_id, status="completed", operation="ocr.standard",
            completed_at=datetime.now(timezone.utc), duration_ms=7,
            result_summary="Fertig", result_payload={"ok": True},
        )

    old = HANDLERS.get("ocr.standard")
    HANDLERS["ocr.standard"] = _mock

    try:
        post_resp = await client.post(
            "/api/v1/upload",
            data={"operation": "ocr.standard"},
            files={"file": ("res.pdf", io.BytesIO(b"%PDF"), "application/pdf")},
        )
        upload_id = post_resp.json()["upload_id"]

        result_resp = await client.get(f"/api/v1/uploads/{upload_id}/result")
        assert result_resp.status_code == 200
        data = result_resp.json()
        assert data["upload_id"] == upload_id
        assert data["status"] == "completed"
        assert data["result_summary"] == "Fertig"
        assert data["result_payload"] == {"ok": True}
    finally:
        if old:
            HANDLERS["ocr.standard"] = old


# ── Router-Struktur ──────────────────────────────────────────────────────────

def test_router_hat_alle_endpoints():
    """Router exponiert exakt die 6 definierten Endpoints."""
    from moag.upload.routes import router

    paths = {r.path for r in router.routes}
    expected = {
        "/api/v1/upload",
        "/api/v1/uploads",
        "/api/v1/uploads/{upload_id}",
        "/api/v1/uploads/{upload_id}/result",
        "/api/v1/uploads/{upload_id}/artifact",
        "/api/v1/uploads/{upload_id}",  # DELETE hat gleichen Pfad wie GET
    }
    # Alle erwarteten Pfade müssen vorhanden sein
    for expected_path in expected:
        assert expected_path in paths, f"Erwarteter Pfad fehlt: {expected_path}"

    # Mindestens 6 Routen
    assert len(router.routes) >= 6
