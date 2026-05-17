"""
Tests fuer backend/moag/routes_ocrexpert.py

Endpoints:
  GET /api/v1/ocrexpert/capabilities
  GET /api/v1/ocrexpert/logs
  GET /api/v1/ocrexpert/openapi-summary
"""
from __future__ import annotations

import json

import httpx
import pytest
from fastapi.testclient import TestClient

from moag.api import create_app


# ── Fixtures ───────────────────────────────────────────────────────────────────


_HEALTH_RESPONSE = {
    "status": "ok",
    "version": "0.7.2",
    "engines_local": ["tesseract", "surya"],
    "engines_octoboss": ["tesseract"],
    "octoboss_reachable": True,
    "libreoffice_available": True,
    "shadow_writable": True,
}

_OPENAPI_RESPONSE = {
    "openapi": "3.1.0",
    "info": {"title": "OCRexpert API", "version": "0.7.2"},
    "paths": {
        "/api/v1/health": {
            "get": {"summary": "Health-Check", "tags": ["health"]}
        },
        "/api/v1/shadow/process": {
            "post": {"summary": "Shadow verarbeiten", "tags": ["shadow"]}
        },
    },
}


def _make_mock_transport(
    health_status: int = 200,
    health_body: dict | None = None,
    logs_status: int = 200,
    logs_body: str = "2026-05-17 INFO Zeile 1\n2026-05-17 INFO Zeile 2",
    openapi_status: int = 200,
    openapi_body: dict | None = None,
) -> httpx.MockTransport:
    hb = health_body if health_body is not None else _HEALTH_RESPONSE
    ob = openapi_body if openapi_body is not None else _OPENAPI_RESPONSE

    def handler(req: httpx.Request) -> httpx.Response:
        url = str(req.url)
        if "/api/v1/health" in url:
            if health_status == 200:
                return httpx.Response(200, json=hb)
            return httpx.Response(health_status, text="Fehler")
        if "/openapi.json" in url:
            if openapi_status == 200:
                return httpx.Response(200, json=ob)
            return httpx.Response(openapi_status, text="Fehler")
        if "/logs" in url:
            if logs_status == 200:
                return httpx.Response(200, text=logs_body)
            return httpx.Response(logs_status, text="Fehler")
        return httpx.Response(404, text="Nicht gefunden")

    return httpx.MockTransport(handler)


@pytest.fixture
def client(settings_store, monkeypatch) -> TestClient:
    """TestClient mit Mock-Transport fuer httpx (Standard-Happy-Path)."""
    transport = _make_mock_transport()
    real_client = httpx.AsyncClient

    monkeypatch.setattr(
        httpx, "AsyncClient",
        lambda **kw: real_client(transport=transport, **{k: v for k, v in kw.items() if k != "transport"}),
    )
    monkeypatch.setenv("MOAG_OCREXPERT_BASE_URL", "http://mock-ocrexpert")

    app = create_app(settings_store=settings_store, enable_pipeline=False)
    return TestClient(app, raise_server_exceptions=True)


# ── GET /api/v1/ocrexpert/capabilities ────────────────────────────────────────


def test_capabilities_happy_path(client: TestClient):
    """Korrekter Health-Response → 200 mit allen Capability-Feldern."""
    resp = client.get("/api/v1/ocrexpert/capabilities")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["status"] == "ok"
    assert data["version"] == "0.7.2"
    assert "tesseract" in data["engines_local"]
    assert "surya" in data["engines_local"]
    assert data["octoboss_reachable"] is True
    assert data["libreoffice_available"] is True
    assert data["shadow_writable"] is True
    assert "source_url" in data


def test_capabilities_upstream_error(settings_store, monkeypatch):
    """OCRexpert antwortet 503 → MOAG liefert 502."""
    transport = _make_mock_transport(health_status=503)
    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        httpx, "AsyncClient",
        lambda **kw: real_client(transport=transport, **{k: v for k, v in kw.items() if k != "transport"}),
    )
    monkeypatch.setenv("MOAG_OCREXPERT_BASE_URL", "http://mock-ocrexpert")
    app = create_app(settings_store=settings_store, enable_pipeline=False)
    c = TestClient(app, raise_server_exceptions=False)
    resp = c.get("/api/v1/ocrexpert/capabilities")
    assert resp.status_code == 502


def test_capabilities_connect_error(settings_store, monkeypatch):
    """OCRexpert nicht erreichbar → MOAG liefert 502."""
    def failing_handler(req: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused")

    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        httpx, "AsyncClient",
        lambda **kw: real_client(
            transport=httpx.MockTransport(failing_handler),
            **{k: v for k, v in kw.items() if k != "transport"},
        ),
    )
    monkeypatch.setenv("MOAG_OCREXPERT_BASE_URL", "http://mock-ocrexpert")
    app = create_app(settings_store=settings_store, enable_pipeline=False)
    c = TestClient(app, raise_server_exceptions=False)
    resp = c.get("/api/v1/ocrexpert/capabilities")
    assert resp.status_code == 502


# ── GET /api/v1/ocrexpert/logs ────────────────────────────────────────────────


def test_logs_happy_path(client: TestClient):
    """Logs-Response → 200 Plain-Text mit Zeilen."""
    resp = client.get("/api/v1/ocrexpert/logs?n=100")
    assert resp.status_code == 200
    assert "Zeile 1" in resp.text
    assert "Zeile 2" in resp.text


def test_logs_tail_limiting(settings_store, monkeypatch):
    """Wenn Service mehr Zeilen liefert als n, werden sie getrimmt."""
    big_log = "\n".join(f"Zeile {i}" for i in range(500))
    transport = _make_mock_transport(logs_body=big_log)
    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        httpx, "AsyncClient",
        lambda **kw: real_client(transport=transport, **{k: v for k, v in kw.items() if k != "transport"}),
    )
    monkeypatch.setenv("MOAG_OCREXPERT_BASE_URL", "http://mock-ocrexpert")
    app = create_app(settings_store=settings_store, enable_pipeline=False)
    c = TestClient(app)
    resp = c.get("/api/v1/ocrexpert/logs?n=10")
    assert resp.status_code == 200
    lines = resp.text.strip().splitlines()
    assert len(lines) == 10
    # Letzte 10 Zeilen (490..499)
    assert "Zeile 490" in resp.text


def test_logs_upstream_error(settings_store, monkeypatch):
    """Logs-Endpoint nicht erreichbar → 502."""
    transport = _make_mock_transport(logs_status=500)
    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        httpx, "AsyncClient",
        lambda **kw: real_client(transport=transport, **{k: v for k, v in kw.items() if k != "transport"}),
    )
    monkeypatch.setenv("MOAG_OCREXPERT_BASE_URL", "http://mock-ocrexpert")
    app = create_app(settings_store=settings_store, enable_pipeline=False)
    c = TestClient(app, raise_server_exceptions=False)
    resp = c.get("/api/v1/ocrexpert/logs")
    assert resp.status_code == 502


# ── GET /api/v1/ocrexpert/openapi-summary ────────────────────────────────────


def test_openapi_summary_happy_path(client: TestClient):
    """OpenAPI-Summary → 200 mit title, version, endpoints-Liste."""
    resp = client.get("/api/v1/ocrexpert/openapi-summary")
    assert resp.status_code == 200
    data = resp.json()
    assert data["title"] == "OCRexpert API"
    assert data["version"] == "0.7.2"
    endpoints = data["endpoints"]
    assert len(endpoints) == 2
    methods = {e["method"] for e in endpoints}
    assert "GET" in methods
    assert "POST" in methods
    paths = {e["path"] for e in endpoints}
    assert "/api/v1/health" in paths
    assert "/api/v1/shadow/process" in paths


def test_openapi_summary_upstream_error(settings_store, monkeypatch):
    """OpenAPI-Endpoint fehlgeschlagen → 502."""
    transport = _make_mock_transport(openapi_status=503)
    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        httpx, "AsyncClient",
        lambda **kw: real_client(transport=transport, **{k: v for k, v in kw.items() if k != "transport"}),
    )
    monkeypatch.setenv("MOAG_OCREXPERT_BASE_URL", "http://mock-ocrexpert")
    app = create_app(settings_store=settings_store, enable_pipeline=False)
    c = TestClient(app, raise_server_exceptions=False)
    resp = c.get("/api/v1/ocrexpert/openapi-summary")
    assert resp.status_code == 502
