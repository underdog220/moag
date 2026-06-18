"""
Smoke-Tests fuer /api/v1/oberon/* Routes.

Jede Route wird einmal mit gemockter Oberon-Antwort geprueft:
  - Status 200
  - Payload-Struktur (stichprobenartig)
  - Stub-Fallback wenn kein Token konfiguriert
"""
from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import httpx
import pytest
from fastapi.testclient import TestClient

from moag.api import create_app
from moag.settings_store import SettingsStore


# ── Fixtures ─────────────────────────────────────────────────────────────────


@pytest.fixture
def app_no_token(tmp_path):
    """App ohne Oberon-Token — alle Routen liefern Stub-Antwort."""
    settings_path = tmp_path / "settings.json"
    store = SettingsStore(settings_path)
    # Kein oberon_token in Default-Settings -> Stub-Modus
    return create_app(settings_store=store, enable_pipeline=False)


@pytest.fixture
def app_with_token(tmp_path):
    """App mit Oberon-Token — Routen leiten an Oberon weiter."""
    settings_path = tmp_path / "settings.json"
    store = SettingsStore(settings_path)
    # Token setzen
    from moag.models import SettingsUpdate
    store.update(SettingsUpdate(oberon_token="test-token"))
    return create_app(settings_store=store, enable_pipeline=False)


# ── Helpers fuer Mocked-Responses ────────────────────────────────────────────


def _make_mock_cockpit_client(get_return):
    """Erstellt einen Mock-CockpitClient der _get() immer get_return zurueckliefert."""
    mock = MagicMock()
    mock.__enter__ = MagicMock(return_value=mock)
    mock.__exit__ = MagicMock(return_value=False)
    mock.get_providers = MagicMock(return_value=get_return)
    mock.get_calls = MagicMock(return_value=get_return)
    mock.get_cost = MagicMock(return_value=get_return)
    mock.get_audit = MagicMock(return_value=get_return)
    mock.get_smoke = MagicMock(return_value=get_return)
    return mock


# ── Stub-Modus (kein Token) ───────────────────────────────────────────────────


def test_providers_stub(app_no_token):
    """Ohne Token: /providers liefert Stub-Antwort."""
    with TestClient(app_no_token) as client:
        resp = client.get("/api/v1/oberon/providers")
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("stub") is True
    assert "message" in data


def test_calls_stub(app_no_token):
    """Ohne Token: /calls liefert Stub-Antwort."""
    with TestClient(app_no_token) as client:
        resp = client.get("/api/v1/oberon/calls")
    assert resp.status_code == 200
    assert resp.json().get("stub") is True


def test_cost_stub(app_no_token):
    """Ohne Token: /cost liefert Stub-Antwort."""
    with TestClient(app_no_token) as client:
        resp = client.get("/api/v1/oberon/cost")
    assert resp.status_code == 200
    assert resp.json().get("stub") is True


def test_audit_stub(app_no_token):
    """Ohne Token: /audit liefert Stub-Antwort."""
    with TestClient(app_no_token) as client:
        resp = client.get("/api/v1/oberon/audit")
    assert resp.status_code == 200
    assert resp.json().get("stub") is True


def test_smoke_stub(app_no_token):
    """Ohne Token: /smoke liefert Stub-Antwort."""
    with TestClient(app_no_token) as client:
        resp = client.get("/api/v1/oberon/smoke")
    assert resp.status_code == 200
    assert resp.json().get("stub") is True


def test_instances_stub(app_no_token):
    """Ohne Token: /instances liefert Stub-Antwort."""
    with TestClient(app_no_token) as client:
        resp = client.get("/api/v1/oberon/instances")
    assert resp.status_code == 200
    assert resp.json().get("stub") is True


def test_pii_tuning_stub(app_no_token):
    """Ohne Token: /pii-tuning liefert Stub-Antwort."""
    with TestClient(app_no_token) as client:
        resp = client.get("/api/v1/oberon/pii-tuning")
    assert resp.status_code == 200
    assert resp.json().get("stub") is True


def test_db_broker_stub(app_no_token):
    """Ohne Token: /db-broker/status liefert Stub-Antwort."""
    with TestClient(app_no_token) as client:
        resp = client.get("/api/v1/oberon/db-broker/status")
    assert resp.status_code == 200
    assert resp.json().get("stub") is True


def test_contract_stub(app_no_token):
    """Ohne Token: /contract/capabilities liefert Stub-Antwort."""
    with TestClient(app_no_token) as client:
        resp = client.get("/api/v1/oberon/contract/capabilities")
    assert resp.status_code == 200
    assert resp.json().get("stub") is True


def test_platform_status_stub(app_no_token):
    """Ohne Token: /platform/status liefert Stub-Antwort."""
    with TestClient(app_no_token) as client:
        resp = client.get("/api/v1/oberon/platform/status")
    assert resp.status_code == 200
    assert resp.json().get("stub") is True


# ── Mit Token: Upstream-Calls werden an Cockpit/Platform weitergeleitet ──────


def _providers_response_mock():
    """Erstellt ein Mock-ProvidersResponse."""
    from moag.clients.oberon_cockpit_schemas import ProviderEntry, ProvidersResponse
    from datetime import datetime, timezone
    return ProvidersResponse(
        providers=[
            ProviderEntry(
                id="anthropic",
                name="Anthropic",
                type="anthropic",
                status="healthy",
                is_default=True,
            )
        ]
    )


def test_providers_with_token(app_with_token):
    """Mit Token: /providers ruft CockpitClient auf und gibt Ergebnis zurueck."""
    mock_providers = _providers_response_mock()

    import moag.routes_oberon as _ro

    mock_client = MagicMock()
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    mock_client.get_providers = MagicMock(return_value=mock_providers)

    with patch.object(_ro, "_build_cockpit_client", return_value=mock_client):
        with TestClient(app_with_token) as client:
            resp = client.get("/api/v1/oberon/providers")

    assert resp.status_code == 200
    data = resp.json()
    assert "providers" in data
    assert len(data["providers"]) == 1
    assert data["providers"][0]["id"] == "anthropic"


def test_smoke_with_token(app_with_token):
    """Mit Token: /smoke ruft CockpitClient auf und gibt Smoke-Ergebnis zurueck."""
    from moag.clients.oberon_cockpit_schemas import SmokeCheck, SmokeSummary, SmokeResponse
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    mock_smoke = SmokeResponse(
        suites=[
            SmokeCheck(name="dsgvo-status", status="PASS", last_run=now, latency_ms=5, error=None),
        ],
        summary=SmokeSummary.model_validate({"pass": 1, "warn": 0, "fail": 0, "total": 1, "verdict": "PASS"}),
    )

    import moag.routes_oberon as _ro

    mock_client = MagicMock()
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    mock_client.get_smoke = MagicMock(return_value=mock_smoke)

    with patch.object(_ro, "_build_cockpit_client", return_value=mock_client):
        with TestClient(app_with_token) as client:
            resp = client.get("/api/v1/oberon/smoke")

    assert resp.status_code == 200
    data = resp.json()
    assert "suites" in data
    assert data["summary"]["verdict"] == "PASS"


def test_calls_since_invalid(app_with_token):
    """Ungueltige since-Zeit -> HTTP 400."""
    import moag.routes_oberon as _ro
    mock_client = MagicMock()
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)

    with patch.object(_ro, "_build_cockpit_client", return_value=mock_client):
        with TestClient(app_with_token) as client:
            resp = client.get("/api/v1/oberon/calls?since=kein-datum")
    assert resp.status_code == 400


def _audit_response_mock():
    """Erstellt ein leeres AuditResponse-Mock fuer get_audit."""
    from moag.clients.oberon_cockpit_schemas import AuditFilters, AuditResponse
    return AuditResponse(
        events=[],
        next_since=None,
        limit=100,
        returned=0,
        filters=AuditFilters(pii_type=None, client_id=None),
    )


def test_audit_default_since_30d(app_with_token):
    """Ohne since-Parameter setzt MOAG einen Default-Cursor ~30 Tage zurueck
    (umgeht Oberons 24h-Default, sonst bleibt die Anzeige meist leer)."""
    from datetime import datetime, timedelta, timezone

    import moag.routes_oberon as _ro

    mock_client = MagicMock()
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    mock_client.get_audit = MagicMock(return_value=_audit_response_mock())

    with patch.object(_ro, "_build_cockpit_client", return_value=mock_client):
        with TestClient(app_with_token) as client:
            resp = client.get("/api/v1/oberon/audit")

    assert resp.status_code == 200
    mock_client.get_audit.assert_called_once()
    since_arg = mock_client.get_audit.call_args.kwargs.get("since")
    assert since_arg is not None, "Default-since muss gesetzt sein"
    delta = datetime.now(timezone.utc) - since_arg
    # ~30 Tage, mit Toleranz fuer Test-Laufzeit
    assert timedelta(days=29, hours=23) <= delta <= timedelta(days=30, minutes=5)


def test_audit_explicit_since_passthrough(app_with_token):
    """Expliziter since-Parameter wird unveraendert durchgereicht (kein Default-Override)."""
    from datetime import datetime, timezone

    import moag.routes_oberon as _ro

    mock_client = MagicMock()
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    mock_client.get_audit = MagicMock(return_value=_audit_response_mock())

    with patch.object(_ro, "_build_cockpit_client", return_value=mock_client):
        with TestClient(app_with_token) as client:
            resp = client.get("/api/v1/oberon/audit?since=2026-05-01T00:00:00Z")

    assert resp.status_code == 200
    since_arg = mock_client.get_audit.call_args.kwargs.get("since")
    assert since_arg == datetime(2026, 5, 1, 0, 0, 0, tzinfo=timezone.utc)


def test_platform_instances_with_token(app_with_token):
    """Mit Token: /instances ruft OberonPlatformClient auf."""
    mock_instances = [{"id": "inst-1", "mode": "devloop", "context_size": 4096}]

    import moag.routes_oberon as _ro

    mock_client = MagicMock()
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    mock_client.get_instances = MagicMock(return_value=mock_instances)

    with patch.object(_ro, "_build_platform_client", return_value=mock_client):
        with TestClient(app_with_token) as client:
            resp = client.get("/api/v1/oberon/instances")

    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert data[0]["id"] == "inst-1"


def test_cockpit_unavailable_502(app_with_token):
    """Oberon nicht erreichbar -> HTTP 502."""
    from moag.clients.oberon_cockpit_client import CockpitUnavailable

    import moag.routes_oberon as _ro

    mock_client = MagicMock()
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    mock_client.get_providers = MagicMock(side_effect=CockpitUnavailable("Timeout"))

    with patch.object(_ro, "_build_cockpit_client", return_value=mock_client):
        with TestClient(app_with_token) as client:
            resp = client.get("/api/v1/oberon/providers")

    assert resp.status_code == 502


# ── Classification-Guide ──────────────────────────────────────────────────────


def test_classification_guide_stub(app_no_token):
    """Ohne Token: /contract/classification-guide liefert Stub-Antwort."""
    with TestClient(app_no_token) as client:
        resp = client.get("/api/v1/oberon/contract/classification-guide")
    assert resp.status_code == 200
    assert resp.json().get("stub") is True


def test_classification_guide_200(app_with_token):
    """Mit Token: /contract/classification-guide liefert Leitfaden-Daten."""
    mock_guide = {
        "contractVersion": "2026-12",
        "legalBasis": "DSGVO Art. 5(1)(c)",
        "publicationAllowlist": [
            {
                "subtype": "mietspiegel",
                "description": "Oeffentlicher Mietspiegel",
                "evidenceExamples": ["Mietspiegel Nuernberg 2024"],
                "exampleId": "MS_Nuernberg_2024",
                "legalNote": "Oeffentliches Dokument",
            }
        ],
        "denyList": [
            {"doctypePattern": "mietvertrag", "reason": "Personenbezogen", "alternative": "Redacted-Version"}
        ],
        "decisionTree": {
            "publishedByPublicAuthority": "→ In Allowlist pruefen",
            "containsIndividualPersonData": "→ DENY",
        },
    }

    import moag.routes_oberon as _ro

    mock_client = MagicMock()
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    mock_client.get_classification_guide = MagicMock(return_value=mock_guide)
    mock_client._etag = MagicMock()
    mock_client._etag.store = MagicMock()

    with patch.object(_ro, "_build_platform_client", return_value=mock_client):
        with TestClient(app_with_token) as client:
            resp = client.get("/api/v1/oberon/contract/classification-guide")

    assert resp.status_code == 200
    data = resp.json()
    assert "publicationAllowlist" in data
    assert data["publicationAllowlist"][0]["subtype"] == "mietspiegel"
    assert "denyList" in data
    assert "decisionTree" in data


def test_classification_guide_etag_passthrough(app_with_token):
    """If-None-Match-Header wird an Oberon weitergereicht (ETag-Caching)."""
    mock_guide = {"contractVersion": "2026-12", "publicationAllowlist": [], "denyList": [], "decisionTree": {}}

    import moag.routes_oberon as _ro

    mock_client = MagicMock()
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    mock_client.get_classification_guide = MagicMock(return_value=mock_guide)
    mock_client._etag = MagicMock()
    mock_client._etag.store = MagicMock()

    with patch.object(_ro, "_build_platform_client", return_value=mock_client):
        with TestClient(app_with_token) as client:
            resp = client.get(
                "/api/v1/oberon/contract/classification-guide",
                headers={"If-None-Match": '"etag-abc-123"'},
            )

    assert resp.status_code == 200
    # ETag-Wert wurde an den Platform-Client-Cache uebergeben
    mock_client._etag.store.assert_called_once_with(
        "/api/v2/contract/classification-guide",
        '"etag-abc-123"',
        None,
    )


def test_classification_guide_503_dsgvo_disabled(app_with_token):
    """503 von Oberon (DSGVO deaktiviert) → HTTP 503 an Frontend."""
    from moag.clients.oberon_platform_client import PlatformError

    import moag.routes_oberon as _ro

    mock_client = MagicMock()
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    mock_client._etag = MagicMock()
    mock_client._etag.store = MagicMock()
    mock_client.get_classification_guide = MagicMock(
        side_effect=PlatformError("DSGVO deaktiviert", status_code=503, body="DSGVO deaktiviert")
    )

    with patch.object(_ro, "_build_platform_client", return_value=mock_client):
        with TestClient(app_with_token) as client:
            resp = client.get("/api/v1/oberon/contract/classification-guide")

    assert resp.status_code == 503
    data = resp.json()
    assert data["detail"]["status"] == "dsgvo_disabled"


# ── DSGVO-Revision (Document-Store) ───────────────────────────────────────────


def test_revision_documents_stub(app_no_token):
    """Ohne Token: /revision/documents liefert Stub-Antwort."""
    with TestClient(app_no_token) as client:
        resp = client.get("/api/v1/oberon/revision/documents")
    assert resp.status_code == 200
    assert resp.json().get("stub") is True


def test_revision_documents_with_token(app_with_token):
    """Mit Token: /revision/documents reicht die Oberon-Dokumentliste durch."""
    mock_list = {
        "documents": [
            {
                "sessionId": "doc.pdf_123",
                "clientId": "valiador",
                "documentType": "Grundbuchauszug",
                "filename": "doc.pdf",
                "hatOriginalText": True,
                "hatOberonAnonymisiert": True,
                "oberonPiiFound": True,
                "oberonPiiTypes": ["PERSON", "ADRESSE"],
                "timestamp": "2026-06-18T08:00:00Z",
            }
        ],
        "count": 1,
    }

    import moag.routes_oberon as _ro

    mock_client = MagicMock()
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    mock_client.get_dsgvo_documents = MagicMock(return_value=mock_list)

    with patch.object(_ro, "_build_platform_client", return_value=mock_client):
        with TestClient(app_with_token) as client:
            resp = client.get("/api/v1/oberon/revision/documents")

    assert resp.status_code == 200
    data = resp.json()
    assert data["count"] == 1
    assert data["documents"][0]["sessionId"] == "doc.pdf_123"
    assert data["documents"][0]["oberonPiiTypes"] == ["PERSON", "ADRESSE"]


def test_revision_file_with_token(app_with_token):
    """Mit Token: /revision/documents/{id}/{datei} liefert Text-Inhalt als JSON."""
    import moag.routes_oberon as _ro

    mock_client = MagicMock()
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    mock_client.get_dsgvo_document_file = MagicMock(
        return_value=("Max Mustermann, Hauptstr. 1", "text/plain; charset=utf-8")
    )

    with patch.object(_ro, "_build_platform_client", return_value=mock_client):
        with TestClient(app_with_token) as client:
            resp = client.get("/api/v1/oberon/revision/documents/doc.pdf_123/original.txt")

    assert resp.status_code == 200
    data = resp.json()
    assert data["session_id"] == "doc.pdf_123"
    assert data["datei"] == "original.txt"
    assert data["content"] == "Max Mustermann, Hauptstr. 1"
    assert "text/plain" in data["content_type"]
    mock_client.get_dsgvo_document_file.assert_called_once_with("doc.pdf_123", "original.txt")


def test_revision_file_whitelist_rejects_unknown(app_with_token):
    """Nicht-Whitelist-Dateiname -> HTTP 400 (Path-Traversal-Schutz), kein Oberon-Call."""
    import moag.routes_oberon as _ro

    mock_client = MagicMock()
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    mock_client.get_dsgvo_document_file = MagicMock()

    with patch.object(_ro, "_build_platform_client", return_value=mock_client):
        with TestClient(app_with_token) as client:
            resp = client.get("/api/v1/oberon/revision/documents/doc.pdf_123/secrets.env")

    assert resp.status_code == 400
    assert resp.json()["detail"]["status"] == "datei_nicht_erlaubt"
    mock_client.get_dsgvo_document_file.assert_not_called()


def test_revision_file_stub(app_no_token):
    """Ohne Token: /revision/documents/{id}/{datei} liefert Stub (Whitelist-Datei)."""
    with TestClient(app_no_token) as client:
        resp = client.get("/api/v1/oberon/revision/documents/doc.pdf_123/original.txt")
    assert resp.status_code == 200
    assert resp.json().get("stub") is True


def test_revision_documents_unavailable_502(app_with_token):
    """Oberon nicht erreichbar -> HTTP 502."""
    from moag.clients.oberon_platform_client import PlatformUnavailable

    import moag.routes_oberon as _ro

    mock_client = MagicMock()
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    mock_client.get_dsgvo_documents = MagicMock(side_effect=PlatformUnavailable("Timeout"))

    with patch.object(_ro, "_build_platform_client", return_value=mock_client):
        with TestClient(app_with_token) as client:
            resp = client.get("/api/v1/oberon/revision/documents")

    assert resp.status_code == 502


def test_revision_pdf_raw_with_token(app_with_token):
    """Mit Token: /revision/.../{pdf}/raw liefert Binaer-Bytes mit Content-Type."""
    import moag.routes_oberon as _ro

    mock_client = MagicMock()
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    mock_client.get_dsgvo_document_bytes = MagicMock(
        return_value=(b"%PDF-1.4 fake bytes", "application/pdf")
    )

    with patch.object(_ro, "_build_platform_client", return_value=mock_client):
        with TestClient(app_with_token) as client:
            resp = client.get("/api/v1/oberon/revision/documents/doc_1/original.pdf/raw")

    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("application/pdf")
    assert resp.content.startswith(b"%PDF")
    mock_client.get_dsgvo_document_bytes.assert_called_once_with("doc_1", "original.pdf")


def test_revision_pdf_raw_whitelist(app_with_token):
    """Nicht-PDF-Whitelist-Name -> 400, kein Oberon-Call."""
    import moag.routes_oberon as _ro

    mock_client = MagicMock()
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    mock_client.get_dsgvo_document_bytes = MagicMock()

    with patch.object(_ro, "_build_platform_client", return_value=mock_client):
        with TestClient(app_with_token) as client:
            resp = client.get("/api/v1/oberon/revision/documents/doc_1/original.txt/raw")

    assert resp.status_code == 400
    mock_client.get_dsgvo_document_bytes.assert_not_called()


def test_revision_pdf_raw_no_token(app_no_token):
    """Ohne Token: PDF-Raw -> 503 (kein Stub-Body fuer Binaer)."""
    with TestClient(app_no_token) as client:
        resp = client.get("/api/v1/oberon/revision/documents/doc_1/original.pdf/raw")
    assert resp.status_code == 503


# ── Revisions-Verdikt (MOAG-lokal) ────────────────────────────────────────────


@pytest.fixture
def app_with_review(tmp_path):
    """App mit isoliertem Verdikt-Store (tmp) — kein Oberon-Token noetig."""
    from moag.dsgvo_review_store import DsgvoReviewStore

    store = SettingsStore(tmp_path / "settings.json")
    review = DsgvoReviewStore(tmp_path / "review.db")
    return create_app(settings_store=store, review_store=review, enable_pipeline=False)


def test_verdict_set_and_list(app_with_review):
    """POST setzt ein Verdikt, GET liefert es zurueck."""
    with TestClient(app_with_review) as client:
        # Anfangs leer
        r0 = client.get("/api/v1/oberon/revision/verdicts")
        assert r0.status_code == 200
        assert r0.json()["verdicts"] == {}

        # Setzen
        r1 = client.post(
            "/api/v1/oberon/revision/verdict",
            json={"session_id": "doc_1", "verdict": "geprueft", "reviewer": "roman", "note": "ok"},
        )
        assert r1.status_code == 200
        assert r1.json()["verdict"] == "geprueft"
        assert r1.json()["reviewer"] == "roman"

        # In der Liste
        r2 = client.get("/api/v1/oberon/revision/verdicts")
        v = r2.json()["verdicts"]
        assert v["doc_1"]["verdict"] == "geprueft"
        assert v["doc_1"]["note"] == "ok"


def test_verdict_beanstandet_and_reset(app_with_review):
    """'beanstandet' wird gespeichert, 'offen' loescht wieder."""
    with TestClient(app_with_review) as client:
        client.post("/api/v1/oberon/revision/verdict", json={"session_id": "doc_2", "verdict": "beanstandet"})
        assert client.get("/api/v1/oberon/revision/verdicts").json()["verdicts"]["doc_2"]["verdict"] == "beanstandet"

        # Zuruecksetzen
        r = client.post("/api/v1/oberon/revision/verdict", json={"session_id": "doc_2", "verdict": "offen"})
        assert r.status_code == 200
        assert r.json()["verdict"] == "offen"
        assert client.get("/api/v1/oberon/revision/verdicts").json()["verdicts"] == {}


def test_verdict_invalid_rejected(app_with_review):
    """Unbekanntes Verdikt -> HTTP 400."""
    with TestClient(app_with_review) as client:
        r = client.post("/api/v1/oberon/revision/verdict", json={"session_id": "doc_3", "verdict": "vielleicht"})
        assert r.status_code == 400
        assert r.json()["detail"]["status"] == "ungueltiges_verdikt"
