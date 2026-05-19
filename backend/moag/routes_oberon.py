"""
Oberon-API-Proxy — alle Oberon-Drilldown-Routen unter /api/v1/oberon/*.

Cockpit-Endpoints (Admin-Token):
  GET /api/v1/oberon/providers       → /api/v2/admin/cockpit/providers
  GET /api/v1/oberon/calls           → /api/v2/admin/cockpit/calls
  GET /api/v1/oberon/cost            → /api/v2/admin/cockpit/cost
  GET /api/v1/oberon/audit           → /api/v2/admin/cockpit/audit
  GET /api/v1/oberon/smoke           → /api/v2/admin/cockpit/smoke

Plattform-Endpoints (Standard-Bearer-Token):
  GET /api/v1/oberon/instances       → /api/v2/instances
  GET /api/v1/oberon/pii-tuning      → /api/v2/pii/tuning
  GET /api/v1/oberon/db-broker/status → /api/v2/database/status
  GET /api/v1/oberon/contract/capabilities → /api/v2/contract/capabilities
  GET /api/v1/oberon/platform/status → /api/v2/platform/status

Client-Instanzen werden pro Request gebaut (kein Singleton-Lifecycle-Problem).
Stub-Fallback wenn kein oberon_token konfiguriert.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query, Request

from moag.clients.oberon_cockpit_client import (
    CockpitClient,
    CockpitError,
    CockpitUnavailable,
)
from moag.clients.oberon_cockpit_schemas import CostGroupBy
from moag.clients.oberon_platform_client import (
    OberonPlatformClient,
    PlatformError,
    PlatformUnavailable,
)
from moag.settings_store import SettingsStore

logger = logging.getLogger("moag.routes_oberon")

# ── Router-Instanz (wird von create_app registriert) ────────────────────────

router = APIRouter(prefix="/api/v1/oberon", tags=["oberon"])

# SettingsStore-Referenz wird beim App-Start injiziert (siehe build_oberon_router)
_settings_store: Optional[SettingsStore] = None


def _get_settings_store() -> SettingsStore:
    if _settings_store is None:
        raise RuntimeError("OberonRouter: SettingsStore nicht injiziert — build_oberon_router() nicht aufgerufen?")
    return _settings_store


def _build_cockpit_client() -> Optional[CockpitClient]:
    """Baut CockpitClient aus Settings. None wenn kein Token vorhanden."""
    s = _get_settings_store().get()
    token = s.oberon_token
    if not token:
        return None
    base_url = s.oberon_base_url or "http://192.168.200.169:17900"
    return CockpitClient(base_url=base_url, token=token, timeout_s=5.0)


def _build_platform_client() -> Optional[OberonPlatformClient]:
    """Baut OberonPlatformClient aus Settings. None wenn kein Token vorhanden."""
    s = _get_settings_store().get()
    token = s.oberon_token
    if not token:
        return None
    base_url = s.oberon_base_url or "http://192.168.200.169:17900"
    return OberonPlatformClient(base_url=base_url, token=token, timeout_s=5.0)


def _cockpit_unavailable(exc: CockpitUnavailable) -> HTTPException:
    return HTTPException(status_code=502, detail={"status": "upstream_unavailable", "detail": str(exc)})


def _cockpit_error(exc: CockpitError) -> HTTPException:
    return HTTPException(status_code=exc.status_code or 502, detail={"status": "cockpit_error", "detail": str(exc)})


def _platform_unavailable(exc: PlatformUnavailable) -> HTTPException:
    return HTTPException(status_code=502, detail={"status": "upstream_unavailable", "detail": str(exc)})


def _platform_error(exc: PlatformError) -> HTTPException:
    return HTTPException(status_code=exc.status_code or 502, detail={"status": "platform_error", "detail": str(exc)})


def _no_token_response(endpoint: str) -> dict:
    """Stub-Antwort wenn kein Token konfiguriert."""
    return {
        "stub": True,
        "message": f"Kein Oberon-Token konfiguriert — {endpoint} nicht verfuegbar",
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }


# ── Cockpit-Endpoints ────────────────────────────────────────────────────────


@router.get("/providers")
def get_providers() -> Any:
    """GET /api/v2/admin/cockpit/providers — Provider-Liste mit Health + Latenz.

    Liefert alle konfigurierten LLM-Provider mit Status, Latenzmetriken
    und Modell-Profil-Matrix.
    Datenquelle: Oberon /api/v2/admin/cockpit/providers
    """
    client = _build_cockpit_client()
    if client is None:
        return _no_token_response("providers")
    try:
        with client:
            result = client.get_providers()
            return result.model_dump(mode="json")
    except CockpitUnavailable as exc:
        raise _cockpit_unavailable(exc)
    except CockpitError as exc:
        raise _cockpit_error(exc)


@router.get("/calls")
def get_calls(
    since: Optional[str] = Query(default=None, description="ISO-8601-Cursor fuer Pagination"),
    limit: int = Query(default=100, ge=1, le=500, description="Max. Anzahl Eintraege"),
    client_id: Optional[str] = Query(default=None, description="Filter auf Client-ID"),
    provider_id: Optional[str] = Query(default=None, description="Filter auf Provider-ID"),
) -> Any:
    """GET /api/v2/admin/cockpit/calls — Cursor-paginierter Recent-Calls-Stream.

    Datenquelle: Oberon /api/v2/admin/cockpit/calls
    """
    client = _build_cockpit_client()
    if client is None:
        return _no_token_response("calls")
    since_dt: Optional[datetime] = None
    if since:
        try:
            since_dt = datetime.fromisoformat(since.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Ungueltige since-Zeit: {since!r}")
    try:
        with client:
            result = client.get_calls(since=since_dt, limit=limit, client_id=client_id, provider_id=provider_id)
            return result.model_dump(mode="json")
    except CockpitUnavailable as exc:
        raise _cockpit_unavailable(exc)
    except CockpitError as exc:
        raise _cockpit_error(exc)


@router.get("/cost")
def get_cost(
    from_: Optional[str] = Query(default=None, alias="from", description="Zeitraum-Anfang (ISO-8601)"),
    to: Optional[str] = Query(default=None, description="Zeitraum-Ende (ISO-8601)"),
    group_by: CostGroupBy = Query(default="day", description="Gruppierung: client | model | day | provider"),
) -> Any:
    """GET /api/v2/admin/cockpit/cost — Aggregierte Kostendaten.

    Datenquelle: Oberon /api/v2/admin/cockpit/cost
    """
    from datetime import timedelta
    client = _build_cockpit_client()
    now = datetime.now(timezone.utc)
    if client is None:
        return _no_token_response("cost")
    try:
        from_dt = datetime.fromisoformat(from_.replace("Z", "+00:00")) if from_ else (now - timedelta(days=7))
        to_dt = datetime.fromisoformat(to.replace("Z", "+00:00")) if to else now
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Ungueltige Zeit-Parameter: {exc}")
    try:
        with client:
            result = client.get_cost(from_=from_dt, to=to_dt, group_by=group_by)
            return result.model_dump(mode="json")
    except CockpitUnavailable as exc:
        raise _cockpit_unavailable(exc)
    except CockpitError as exc:
        raise _cockpit_error(exc)


@router.get("/audit")
def get_audit(
    since: Optional[str] = Query(default=None, description="ISO-8601-Cursor fuer Pagination"),
    limit: int = Query(default=100, ge=1, le=500, description="Max. Anzahl Events"),
    pii_type: Optional[str] = Query(default=None, description="Filter auf PII-Typ"),
    client_id: Optional[str] = Query(default=None, description="Filter auf Client-ID"),
) -> Any:
    """GET /api/v2/admin/cockpit/audit — DSGVO-Audit-Event-Stream.

    Datenquelle: Oberon /api/v2/admin/cockpit/audit
    """
    client = _build_cockpit_client()
    if client is None:
        return _no_token_response("audit")
    since_dt: Optional[datetime] = None
    if since:
        try:
            since_dt = datetime.fromisoformat(since.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Ungueltige since-Zeit: {since!r}")
    try:
        with client:
            result = client.get_audit(limit=limit, since=since_dt, pii_type=pii_type, client_id=client_id)
            return result.model_dump(mode="json")
    except CockpitUnavailable as exc:
        raise _cockpit_unavailable(exc)
    except CockpitError as exc:
        raise _cockpit_error(exc)


@router.get("/smoke")
def get_smoke() -> Any:
    """GET /api/v2/admin/cockpit/smoke — Live-Health-Snapshot (6 Sub-Checks parallel).

    Datenquelle: Oberon /api/v2/admin/cockpit/smoke
    """
    client = _build_cockpit_client()
    if client is None:
        return _no_token_response("smoke")
    try:
        with client:
            result = client.get_smoke()
            return result.model_dump(mode="json")
    except CockpitUnavailable as exc:
        raise _cockpit_unavailable(exc)
    except CockpitError as exc:
        raise _cockpit_error(exc)


# ── Plattform-Endpoints ──────────────────────────────────────────────────────


@router.get("/instances")
def get_instances() -> Any:
    """GET /api/v2/instances — Aktive Oberon-Instanzen.

    Zeigt laufende DevLoop/Chat-Instanzen mit Kontext-Groesse und Modus.
    Datenquelle: Oberon /api/v2/instances
    """
    client = _build_platform_client()
    if client is None:
        return _no_token_response("instances")
    try:
        with client:
            return client.get_instances()
    except PlatformUnavailable as exc:
        raise _platform_unavailable(exc)
    except PlatformError as exc:
        raise _platform_error(exc)


@router.get("/pii-tuning")
def get_pii_tuning() -> Any:
    """GET /api/v2/pii/tuning — PII-Tuning-Konfiguration.

    Zeigt Schwellwerte und Erkennungsparameter der DSGVO-PII-Engine.
    Datenquelle: Oberon /api/v2/pii/tuning
    """
    client = _build_platform_client()
    if client is None:
        return _no_token_response("pii-tuning")
    try:
        with client:
            return client.get_pii_tuning()
    except PlatformUnavailable as exc:
        raise _platform_unavailable(exc)
    except PlatformError as exc:
        raise _platform_error(exc)


@router.get("/db-broker/status")
def get_db_broker_status() -> Any:
    """GET /api/v2/database/status — DB-Broker-Status.

    Zeigt alle via Oberon-Broker provisionierten Datenbanken und ihren Status.
    Datenquelle: Oberon /api/v2/database/status
    """
    client = _build_platform_client()
    if client is None:
        return _no_token_response("db-broker/status")
    try:
        with client:
            return client.get_db_broker_status()
    except PlatformUnavailable as exc:
        raise _platform_unavailable(exc)
    except PlatformError as exc:
        raise _platform_error(exc)


@router.get("/contract/capabilities")
def get_contract_capabilities() -> Any:
    """GET /api/v2/contract/capabilities — API-Kontrakt-Faehigkeiten.

    Listet alle vom Oberon-Server unterstuetzten API-Capabilities auf.
    Datenquelle: Oberon /api/v2/contract/capabilities
    """
    client = _build_platform_client()
    if client is None:
        return _no_token_response("contract/capabilities")
    try:
        with client:
            return client.get_contract_capabilities()
    except PlatformUnavailable as exc:
        raise _platform_unavailable(exc)
    except PlatformError as exc:
        raise _platform_error(exc)


@router.get("/contract/classification-guide")
def get_contract_classification_guide(request: Request) -> Any:
    """GET /api/v2/contract/classification-guide — DSGVO-Klassifizierungs-Leitfaden.

    Liefert publicationAllowlist, denyList und decisionTree.
    ETag-Passthrough: empfangenes If-None-Match wird an Oberon weitergereicht.
    Bei 304-Antwort von Oberon (Cache-Hit im Platform-Client) wird der gecachte
    Body unveraendert zurueckgeliefert.
    Empfohlene Cache-Strategie Client-seitig: 24h.
    Datenquelle: Oberon /api/v2/contract/classification-guide
    """
    client = _build_platform_client()
    if client is None:
        return _no_token_response("contract/classification-guide")

    # Wenn der Frontend-Client ein If-None-Match sendet, den ETag im Platform-Client
    # vorab befuellen, damit dieser 304-Optimierungen an Oberon weiterleitet.
    incoming_etag = request.headers.get("if-none-match") or request.headers.get("If-None-Match")
    if incoming_etag:
        client._etag.store("/api/v2/contract/classification-guide", incoming_etag, None)

    try:
        with client:
            return client.get_classification_guide()
    except PlatformUnavailable as exc:
        raise _platform_unavailable(exc)
    except PlatformError as exc:
        # 503 = DSGVO deaktiviert
        if exc.status_code == 503:
            raise HTTPException(
                status_code=503,
                detail={"status": "dsgvo_disabled", "detail": str(exc)},
            )
        raise _platform_error(exc)


@router.get("/platform/status")
def get_platform_status() -> Any:
    """GET /api/v2/platform/status — Plattform-Gesundheitsstatus.

    Zeigt den Gesamtzustand des Oberon-Servers (Uptime, Dienste, Version).
    Datenquelle: Oberon /api/v2/platform/status
    """
    client = _build_platform_client()
    if client is None:
        return _no_token_response("platform/status")
    try:
        with client:
            return client.get_platform_status()
    except PlatformUnavailable as exc:
        raise _platform_unavailable(exc)
    except PlatformError as exc:
        raise _platform_error(exc)


# ── Router-Factory (fuer create_app) ─────────────────────────────────────────


def build_oberon_router(settings_store: SettingsStore) -> APIRouter:
    """Injiziert den SettingsStore und gibt den konfigurierten Router zurueck.

    Muss von create_app() aufgerufen werden, bevor include_router() greift.
    """
    global _settings_store
    _settings_store = settings_store
    return router
