"""
Tests fuer backend/moag/routes_ocr_upload.py (isoliert).

Der Router wird gegen eine eigene Minimal-FastAPI-App gehaengt (NICHT die volle
create_app), damit der Upload-Pfad fokussiert getestet werden kann.

Geprueft:
  - Happy-Path: Datei wird als multipart files= an OCRexpert /api/v1/process geleitet,
    OCRexpert-Antwort wird strukturiert zurueckgegeben.
  - Validierung lehnt unerlaubte Endung ab (HTTP 400, kein Upstream-Call).
  - Validierung lehnt zu grosse Datei ab (HTTP 400).
  - OCRexpert-Fehler (422) wird sauber als {ok: False, ...} weitergereicht.
  - OCRexpert-Timeout wird sauber als {ok: False, status: error} weitergereicht.
"""
from __future__ import annotations

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from moag.routes_ocr_upload import MAX_UPLOAD_MB, build_ocr_upload_router
from moag.settings_store import SettingsStore


# ── Test-App-Factory ─────────────────────────────────────────────────────────


def _make_app(settings_store: SettingsStore) -> FastAPI:
    app = FastAPI()
    app.include_router(build_ocr_upload_router(settings_store))
    return app


def _patch_httpx(monkeypatch, handler) -> dict:
    """Patcht httpx.AsyncClient auf MockTransport. Gibt ein captured-Dict zurueck,
    in das der Handler die gesehene Request schreiben kann."""
    captured: dict = {}

    def wrapped(req: httpx.Request) -> httpx.Response:
        captured["url"] = str(req.url)
        captured["method"] = req.method
        captured["content_type"] = req.headers.get("content-type", "")
        captured["body"] = req.content
        return handler(req)

    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        httpx, "AsyncClient",
        lambda **kw: real_client(
            transport=httpx.MockTransport(wrapped),
            **{k: v for k, v in kw.items() if k != "transport"},
        ),
    )
    return captured


_OCREXPERT_OK = {
    "status": "ok",
    "job_id": "abc123",
    "text": "Dies ist ein Testdokument.",
    "text_len": 26,
    "pages": 1,
    "quality": {"passed": True, "score": 0.91, "avg_confidence": 0.88, "reason": "ok"},
    "pdfa_url": None,
    "pdfa_base64": None,
    "duration_ms": 1500,
}


# ── Happy-Path ────────────────────────────────────────────────────────────────


def test_upload_happy_path_forwards_multipart(settings_store: SettingsStore, monkeypatch):
    """Erfolgreicher Upload: multipart files= geht an die OCRexpert /api/v1/process-URL,
    Antwort wird strukturiert mit ok=True zurueckgereicht."""
    # Base-URL deterministisch setzen
    from moag.models import SettingsUpdate
    settings_store.update(SettingsUpdate(ocrexpert_base_url="http://mock-ocrexpert"))

    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=_OCREXPERT_OK)

    captured = _patch_httpx(monkeypatch, handler)

    app = _make_app(settings_store)
    client = TestClient(app)
    resp = client.post(
        "/api/v1/ocrexpert/upload",
        files={"file": ("scan.pdf", b"%PDF-1.4 fake bytes", "application/pdf")},
        data={"output": "raw", "profile": "generic"},
    )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["ok"] is True
    assert body["status"] == "ok"
    assert body["upstream_status"] == 200
    assert body["result"]["text"] == "Dies ist ein Testdokument."
    assert body["filename"] == "scan.pdf"

    # Verdrahtung: ging an die richtige OCRexpert-URL als multipart POST
    assert captured["method"] == "POST"
    assert captured["url"].startswith("http://mock-ocrexpert/api/v1/process")
    assert "multipart/form-data" in captured["content_type"]
    # Die Datei-Bytes muessen im multipart-Body auftauchen (files= korrekt gesetzt)
    assert b"%PDF-1.4 fake bytes" in captured["body"]
    assert b'name="file"' in captured["body"]
    # OCRexpert-Parameter als Query-String
    assert "profile=generic" in captured["url"]
    assert "output=raw" in captured["url"]


def test_upload_passes_form_params_as_query(settings_store: SettingsStore, monkeypatch):
    """profile/output/language werden als Query-Params an OCRexpert durchgereicht."""
    from moag.models import SettingsUpdate
    settings_store.update(SettingsUpdate(ocrexpert_base_url="http://mock-ocrexpert"))

    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=_OCREXPERT_OK)

    captured = _patch_httpx(monkeypatch, handler)
    app = _make_app(settings_store)
    client = TestClient(app)
    resp = client.post(
        "/api/v1/ocrexpert/upload",
        files={"file": ("doc.pdf", b"data", "application/pdf")},
        data={"output": "pdfa", "profile": "rechnung", "language": "deu", "inline_pdfa": "true"},
    )
    assert resp.status_code == 200, resp.text
    url = captured["url"]
    assert "output=pdfa" in url
    assert "profile=rechnung" in url
    assert "language=deu" in url
    assert "inline_pdfa=true" in url


# ── Validierung ───────────────────────────────────────────────────────────────


def test_upload_rejects_bad_extension(settings_store: SettingsStore, monkeypatch):
    """Unerlaubte Endung → 400, kein Upstream-Call."""
    upstream_called = {"n": 0}

    def handler(req: httpx.Request) -> httpx.Response:
        upstream_called["n"] += 1
        return httpx.Response(200, json=_OCREXPERT_OK)

    _patch_httpx(monkeypatch, handler)
    app = _make_app(settings_store)
    client = TestClient(app)
    resp = client.post(
        "/api/v1/ocrexpert/upload",
        files={"file": ("malware.exe", b"MZ...", "application/octet-stream")},
    )
    assert resp.status_code == 400
    assert "nicht unterstuetzt" in resp.json()["detail"]
    assert upstream_called["n"] == 0  # OCRexpert wurde NICHT aufgerufen


def test_upload_rejects_too_large(settings_store: SettingsStore, monkeypatch):
    """Datei groesser als Limit → 400."""
    upstream_called = {"n": 0}

    def handler(req: httpx.Request) -> httpx.Response:
        upstream_called["n"] += 1
        return httpx.Response(200, json=_OCREXPERT_OK)

    _patch_httpx(monkeypatch, handler)
    app = _make_app(settings_store)
    client = TestClient(app)
    big = b"x" * (MAX_UPLOAD_MB * 1024 * 1024 + 10)
    resp = client.post(
        "/api/v1/ocrexpert/upload",
        files={"file": ("riesig.pdf", big, "application/pdf")},
    )
    assert resp.status_code == 400
    assert "Limit" in resp.json()["detail"]
    assert upstream_called["n"] == 0


# ── OCRexpert-Fehler ──────────────────────────────────────────────────────────


def test_upload_upstream_422_passed_through(settings_store: SettingsStore, monkeypatch):
    """OCRexpert antwortet 422 → MOAG liefert 200 mit ok=False + Upstream-Detail,
    crasht NICHT (deterministisches Schema fuers Frontend)."""
    from moag.models import SettingsUpdate
    settings_store.update(SettingsUpdate(ocrexpert_base_url="http://mock-ocrexpert"))

    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(422, json={"detail": "Aktuell nur PDF (Upload-Endpoint)."})

    _patch_httpx(monkeypatch, handler)
    app = _make_app(settings_store)
    client = TestClient(app)
    resp = client.post(
        "/api/v1/ocrexpert/upload",
        files={"file": ("scan.pdf", b"data", "application/pdf")},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["ok"] is False
    assert body["status"] == "error"
    assert body["upstream_status"] == 422
    assert "422" in body["error"]
    assert body["upstream"]["detail"] == "Aktuell nur PDF (Upload-Endpoint)."


def test_upload_upstream_timeout(settings_store: SettingsStore, monkeypatch):
    """OCRexpert-Timeout → MOAG liefert 200 mit ok=False, status=error, ohne Crash."""
    from moag.models import SettingsUpdate
    settings_store.update(SettingsUpdate(ocrexpert_base_url="http://mock-ocrexpert"))

    def handler(req: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("zu langsam", request=req)

    _patch_httpx(monkeypatch, handler)
    app = _make_app(settings_store)
    client = TestClient(app)
    resp = client.post(
        "/api/v1/ocrexpert/upload",
        files={"file": ("scan.pdf", b"data", "application/pdf")},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["ok"] is False
    assert body["status"] == "error"
    assert "Timeout" in body["error"]
    assert body["upstream_status"] is None


def test_upload_upstream_connect_error(settings_store: SettingsStore, monkeypatch):
    """OCRexpert nicht erreichbar → ok=False, status=error."""
    from moag.models import SettingsUpdate
    settings_store.update(SettingsUpdate(ocrexpert_base_url="http://mock-ocrexpert"))

    def handler(req: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused", request=req)

    _patch_httpx(monkeypatch, handler)
    app = _make_app(settings_store)
    client = TestClient(app)
    resp = client.post(
        "/api/v1/ocrexpert/upload",
        files={"file": ("scan.pdf", b"data", "application/pdf")},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["ok"] is False
    assert body["status"] == "error"
    assert "nicht erreichbar" in body["error"]
