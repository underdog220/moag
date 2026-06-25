"""
Tests fuer routes_datenschutz.py — Datenschutzkonzept-Proxy.

Testet:
- Stub-Antwort wenn kein Token konfiguriert
- Proxy-GET fuer alle drei GET-Routen
- Proxy-POST fuer generate
- 502-Fehlerbehandlung bei Oberon-Ausfall
- 4xx-Weiterleitung
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

import httpx
import pytest
from fastapi.testclient import TestClient

from moag.api import create_app
from moag.settings_store import SettingsStore


# ── Fixtures ──────────────────────────────────────────────────────────────────

OBERON_DATENSCHUTZ_KONZEPT: dict[str, Any] = {
    "version": 3,
    "generated_at": "2026-06-25T10:00:00Z",
    "facts_snapshot": {
        "dsgvoEnabled": True,
        "failSafeMode": False,
        "nerMode": "standard",
        "sessionTtlMinutes": 30,
        "safeForCloudGate": True,
        "auditRetentionDays": 30,
        "provider": {"id": "oberon-local", "endpoint": "http://localhost", "model_standard": "claude-3", "model_heavy": "claude-3"},
        "aktiveScanner": ["presidio", "spacy"],
    },
    "claims": [
        {"statement": "Alle Calls gehen ueber DSGVO-Proxy.", "source_ref": "oberon.settings", "status": "ok"},
    ],
    "sources": [
        {"id": "src1", "title": "Oberon-Settings", "url": "http://oberon/settings", "type": "endpoint", "last_checked": "2026-06-25T09:00:00Z", "available": True, "check_note": None},
    ],
    "problems": [],
    "prose_markdown": "# Datenschutzkonzept\n\nAlle Calls werden via DSGVO-Proxy geroutet.",
    "scope_note": "Abdeckt automatisierte Datenfluesse. Kein juristisches VVT.",
    "integrity_guard_status": "ok",
    "integrity_guard_unlisted_urls": [],
}

OBERON_VERSIONS: dict[str, Any] = {
    "versions": [
        {"id": "v3", "version": 3, "generated_at": "2026-06-25T10:00:00Z", "is_current": True},
        {"id": "v2", "version": 2, "generated_at": "2026-06-20T08:00:00Z", "is_current": False},
    ]
}

OBERON_GENERATE_RESPONSE: dict[str, Any] = {
    "ok": True,
    "message": "Generierung gestartet",
    "version": 4,
}


def _make_app_with_token(tmp_path: Path, token: str = "test-token") -> TestClient:
    """Erstellt eine TestClient-Instanz mit Token in den Settings."""
    settings_path = tmp_path / "settings.json"
    settings_path.write_text(
        json.dumps({"oberon_token": token, "oberon_base_url": "http://mock-oberon:17900"}),
        encoding="utf-8",
    )
    store = SettingsStore(settings_path)
    app = create_app(settings_store=store, enable_pipeline=False)
    return TestClient(app, raise_server_exceptions=True)


def _make_app_no_token(tmp_path: Path) -> TestClient:
    """Erstellt eine TestClient-Instanz OHNE Token (Stub-Modus)."""
    settings_path = tmp_path / "settings.json"
    settings_path.write_text(
        json.dumps({"oberon_base_url": "http://mock-oberon:17900"}),
        encoding="utf-8",
    )
    store = SettingsStore(settings_path)
    app = create_app(settings_store=store, enable_pipeline=False)
    return TestClient(app, raise_server_exceptions=True)


# ── Stub-Tests (kein Token) ───────────────────────────────────────────────────

class TestStubModus:
    """Alle Endpunkte liefern Stub-Antwort wenn kein Token konfiguriert."""

    def test_get_konzept_stub(self, tmp_path: Path) -> None:
        client = _make_app_no_token(tmp_path)
        resp = client.get("/api/v1/oberon/datenschutz-konzept")
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("stub") is True
        assert "message" in data
        assert "fetched_at" in data

    def test_get_versions_stub(self, tmp_path: Path) -> None:
        client = _make_app_no_token(tmp_path)
        resp = client.get("/api/v1/oberon/datenschutz-konzept/versions")
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("stub") is True

    def test_get_version_detail_stub(self, tmp_path: Path) -> None:
        client = _make_app_no_token(tmp_path)
        resp = client.get("/api/v1/oberon/datenschutz-konzept/versions/v3")
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("stub") is True

    def test_post_generate_stub(self, tmp_path: Path) -> None:
        client = _make_app_no_token(tmp_path)
        resp = client.post("/api/v1/oberon/datenschutz-konzept/generate")
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("stub") is True


# ── Proxy-Tests (mit Token + Mock-Oberon) ────────────────────────────────────

class TestProxyMitToken:
    """Proxy leitet an Oberon weiter wenn Token konfiguriert ist."""

    def test_get_konzept_proxy(self, tmp_path: Path) -> None:
        client = _make_app_with_token(tmp_path)
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.content = json.dumps(OBERON_DATENSCHUTZ_KONZEPT).encode()
        mock_resp.json.return_value = OBERON_DATENSCHUTZ_KONZEPT

        with patch("httpx.get", return_value=mock_resp):
            resp = client.get("/api/v1/oberon/datenschutz-konzept")

        assert resp.status_code == 200
        data = resp.json()
        assert data["version"] == 3
        assert data["integrity_guard_status"] == "ok"
        assert len(data["claims"]) == 1

    def test_get_versions_proxy(self, tmp_path: Path) -> None:
        client = _make_app_with_token(tmp_path)
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.content = json.dumps(OBERON_VERSIONS).encode()
        mock_resp.json.return_value = OBERON_VERSIONS

        with patch("httpx.get", return_value=mock_resp):
            resp = client.get("/api/v1/oberon/datenschutz-konzept/versions")

        assert resp.status_code == 200
        data = resp.json()
        assert len(data["versions"]) == 2
        assert data["versions"][0]["is_current"] is True

    def test_get_version_detail_proxy(self, tmp_path: Path) -> None:
        client = _make_app_with_token(tmp_path)
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.content = json.dumps(OBERON_DATENSCHUTZ_KONZEPT).encode()
        mock_resp.json.return_value = OBERON_DATENSCHUTZ_KONZEPT

        with patch("httpx.get", return_value=mock_resp):
            resp = client.get("/api/v1/oberon/datenschutz-konzept/versions/v3")

        assert resp.status_code == 200
        data = resp.json()
        assert data["version"] == 3

    def test_post_generate_proxy(self, tmp_path: Path) -> None:
        client = _make_app_with_token(tmp_path)
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.content = json.dumps(OBERON_GENERATE_RESPONSE).encode()
        mock_resp.json.return_value = OBERON_GENERATE_RESPONSE

        with patch("httpx.post", return_value=mock_resp):
            resp = client.post("/api/v1/oberon/datenschutz-konzept/generate")

        assert resp.status_code == 200
        data = resp.json()
        assert data.get("ok") is True


# ── Fehlerbehandlung ──────────────────────────────────────────────────────────

class TestFehlerbehandlung:
    """Verbindungsfehler und 5xx werden als 502 weitergereicht."""

    def test_connection_error_liefert_502(self, tmp_path: Path) -> None:
        client = _make_app_with_token(tmp_path)
        with patch("httpx.get", side_effect=httpx.ConnectError("Verbindung verweigert")):
            resp = client.get("/api/v1/oberon/datenschutz-konzept")
        assert resp.status_code == 502
        assert "upstream_unavailable" in resp.json().get("detail", {}).get("status", "")

    def test_timeout_liefert_502(self, tmp_path: Path) -> None:
        client = _make_app_with_token(tmp_path)
        with patch("httpx.get", side_effect=httpx.TimeoutException("Timeout")):
            resp = client.get("/api/v1/oberon/datenschutz-konzept")
        assert resp.status_code == 502

    def test_oberon_500_liefert_502(self, tmp_path: Path) -> None:
        client = _make_app_with_token(tmp_path)
        mock_resp = MagicMock()
        mock_resp.status_code = 500
        mock_resp.content = b"Interner Fehler"
        mock_resp.text = "Interner Fehler"
        with patch("httpx.get", return_value=mock_resp):
            resp = client.get("/api/v1/oberon/datenschutz-konzept")
        assert resp.status_code == 502

    def test_oberon_404_liefert_404(self, tmp_path: Path) -> None:
        client = _make_app_with_token(tmp_path)
        mock_resp = MagicMock()
        mock_resp.status_code = 404
        mock_resp.content = b"Not Found"
        mock_resp.text = "Not Found"
        with patch("httpx.get", return_value=mock_resp):
            resp = client.get("/api/v1/oberon/datenschutz-konzept")
        assert resp.status_code == 404

    def test_generate_connection_error_liefert_502(self, tmp_path: Path) -> None:
        client = _make_app_with_token(tmp_path)
        with patch("httpx.post", side_effect=httpx.ConnectError("Verbindung verweigert")):
            resp = client.post("/api/v1/oberon/datenschutz-konzept/generate")
        assert resp.status_code == 502
