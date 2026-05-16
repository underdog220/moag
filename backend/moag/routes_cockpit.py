"""
Cockpit-API-Proxy (aus OCRexpert-GUI portiert, Phase 1).

Reicht Cockpit-Calls an Oberon durch:
  GET /api/cockpit/providers  → /api/v2/admin/cockpit/providers
  GET /api/cockpit/calls      → /api/v2/admin/cockpit/calls
  GET /api/cockpit/cost       → /api/v2/admin/cockpit/cost
  GET /api/cockpit/audit      → /api/v2/admin/cockpit/audit
  GET /api/cockpit/smoke      → /api/v2/admin/cockpit/smoke

Stub-Fallback:
  Wenn kein oberon_token in Settings konfiguriert ist, liefern
  wir Stub-Daten (Frontend-Entwicklung ohne Admin-Token).
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from moag.clients.oberon_cockpit_client import (
    CockpitClient,
    CockpitError,
    CockpitUnavailable,
)
from moag.clients.oberon_cockpit_schemas import (
    AuditFilters,
    AuditResponse,
    CallEntry,
    CallsResponse,
    CostGroupBy,
    CostResponse,
    ProviderEntry,
    ProviderProfileMap,
    ProvidersResponse,
    SmokeCheck,
    SmokeSummary,
    SmokeResponse,
)
from .settings_store import SettingsStore

logger = logging.getLogger("moag.routes_cockpit")


# ── Stub-Daten (Fallback bei fehlendem Admin-Token) ───────────────────────────


def _stub_providers() -> ProvidersResponse:
    now = datetime.now(timezone.utc)
    return ProvidersResponse(
        providers=[
            ProviderEntry(
                id="stub-anthropic",
                name="Anthropic (Stub)",
                type="anthropic",
                status="healthy",
                base_url="https://api.anthropic.com",
                api_key_hint="sk-ant-ap...STUB",
                latency_p50_ms=420.5,
                latency_p95_ms=1823.0,
                cost_per_1m_tokens_usd=None,
                last_check=now,
                is_default=True,
                profiles=ProviderProfileMap(
                    STANDARD="claude-3-5-haiku-20241022",
                    MINI=None,
                    HEAVY="claude-opus-4-7",
                    VISION=None,
                ),
            ),
        ]
    )


def _stub_calls() -> CallsResponse:
    now = datetime.now(timezone.utc)
    return CallsResponse(
        calls=[
            CallEntry(
                id=0,
                ts=now,
                client_id="moag",
                profile="STANDARD",
                model="claude-3-5-haiku-20241022",
                provider="anthropic",
                prompt_tokens=512,
                completion_tokens=128,
                total_tokens=640,
                duration_ms=820,
                pii_found=None,
                pii_anonymized=None,
                status="ok",
                error=None,
            )
        ],
        next_since=None,
        limit=100,
        returned=1,
    )


def _stub_cost(group_by: CostGroupBy = "day") -> CostResponse:
    now = datetime.now(timezone.utc)
    from_ = now - timedelta(days=7)
    return CostResponse.model_validate({
        "from": from_.isoformat(),
        "to": now.isoformat(),
        "group_by": group_by,
        "groups": [
            {
                "key": "2026-05-16",
                "calls": 0,
                "total_tokens": 0,
                "prompt_tokens": 0,
                "completion_tokens": 0,
                "total_cost_usd": "0.0",
            }
        ],
        "total": {
            "calls": 0,
            "total_tokens": 0,
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_cost_usd": "0.0",
        },
    })


def _stub_audit() -> AuditResponse:
    return AuditResponse(
        events=[],
        next_since=None,
        limit=100,
        returned=0,
        filters=AuditFilters(pii_type=None, client_id=None),
    )


def _stub_smoke() -> SmokeResponse:
    now = datetime.now(timezone.utc)
    checks = [
        SmokeCheck(name="dsgvo-status", status="PASS", last_run=now, latency_ms=1, error=None),
        SmokeCheck(name="pii-detect", status="PASS", last_run=now, latency_ms=1, error=None),
        SmokeCheck(name="ner-extract", status="WARN", last_run=now, latency_ms=1, error="Stub-Modus: kein Admin-Token konfiguriert"),
        SmokeCheck(name="octoboss-local", status="PASS", last_run=now, latency_ms=1, error=None),
        SmokeCheck(name="oberon-postgres", status="PASS", last_run=now, latency_ms=1, error=None),
        SmokeCheck(name="local-llm-hub", status="PASS", last_run=now, latency_ms=1, error=None),
    ]
    return SmokeResponse(
        suites=checks,
        summary=SmokeSummary.model_validate({
            "pass": 5,
            "warn": 1,
            "fail": 0,
            "total": 6,
            "verdict": "WARN",
        }),
    )


# ── CockpitClient aus Settings ──────────────────────────────────────────────


def _build_client(settings_store: SettingsStore) -> Optional[CockpitClient]:
    """Baut CockpitClient aus Settings. None wenn kein Oberon-Token vorhanden."""
    s = settings_store.get()
    token = s.oberon_token
    if not token:
        return None
    base_url = s.oberon_base_url or "http://192.168.200.169:17900"
    return CockpitClient(base_url=base_url, token=token, timeout_s=5.0)


# ── Router-Factory ────────────────────────────────────────────────────────────


def build_cockpit_router(settings_store: SettingsStore) -> APIRouter:
    """Baut den FastAPI-Router fuer die Oberon-Cockpit-Proxy-Routen."""
    router = APIRouter(prefix="/api/cockpit", tags=["cockpit"])

    @router.get("/providers", response_model=ProvidersResponse)
    def get_providers() -> ProvidersResponse:
        client = _build_client(settings_store)
        if client is None:
            logger.info("Cockpit /providers: kein Admin-Token — Stub-Antwort.")
            return _stub_providers()
        try:
            with client:
                return client.get_providers()
        except CockpitUnavailable as exc:
            logger.warning("Cockpit /providers upstream-Fehler: %s", exc)
            raise HTTPException(status_code=502, detail={"status": "upstream_unavailable", "detail": str(exc)})
        except CockpitError as exc:
            raise HTTPException(status_code=exc.status_code or 502, detail={"status": "cockpit_error", "detail": str(exc)})

    @router.get("/calls", response_model=CallsResponse)
    def get_calls(
        since: Optional[str] = Query(default=None),
        limit: int = Query(default=100, ge=1, le=500),
        client_id: Optional[str] = Query(default=None, alias="clientId"),
        provider_id: Optional[str] = Query(default=None, alias="providerId"),
    ) -> CallsResponse:
        client = _build_client(settings_store)
        if client is None:
            return _stub_calls()
        since_dt: Optional[datetime] = None
        if since:
            try:
                since_dt = datetime.fromisoformat(since.replace("Z", "+00:00"))
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Ungueltige since-Zeit: {since!r}")
        try:
            with client:
                return client.get_calls(since=since_dt, limit=limit, client_id=client_id, provider_id=provider_id)
        except CockpitUnavailable as exc:
            raise HTTPException(status_code=502, detail={"status": "upstream_unavailable", "detail": str(exc)})
        except CockpitError as exc:
            raise HTTPException(status_code=exc.status_code or 502, detail={"status": "cockpit_error", "detail": str(exc)})

    @router.get("/cost", response_model=CostResponse)
    def get_cost(
        from_: Optional[str] = Query(default=None, alias="from"),
        to: Optional[str] = Query(default=None),
        group_by: CostGroupBy = Query(default="day"),
    ) -> CostResponse:
        client = _build_client(settings_store)
        now = datetime.now(timezone.utc)
        if client is None:
            return _stub_cost(group_by)
        try:
            from_dt = datetime.fromisoformat(from_.replace("Z", "+00:00")) if from_ else (now - timedelta(days=7))
            to_dt = datetime.fromisoformat(to.replace("Z", "+00:00")) if to else now
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=f"Ungueltige Zeit-Parameter: {exc}")
        try:
            with client:
                return client.get_cost(from_=from_dt, to=to_dt, group_by=group_by)
        except CockpitUnavailable as exc:
            raise HTTPException(status_code=502, detail={"status": "upstream_unavailable", "detail": str(exc)})
        except CockpitError as exc:
            raise HTTPException(status_code=exc.status_code or 502, detail={"status": "cockpit_error", "detail": str(exc)})

    @router.get("/audit", response_model=AuditResponse)
    def get_audit(
        limit: int = Query(default=100, ge=1, le=500),
        since: Optional[str] = Query(default=None),
        pii_type: Optional[str] = Query(default=None),
        client_id: Optional[str] = Query(default=None),
    ) -> AuditResponse:
        client = _build_client(settings_store)
        if client is None:
            return _stub_audit()
        since_dt: Optional[datetime] = None
        if since:
            try:
                since_dt = datetime.fromisoformat(since.replace("Z", "+00:00"))
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Ungueltige since-Zeit: {since!r}")
        try:
            with client:
                return client.get_audit(limit=limit, since=since_dt, pii_type=pii_type, client_id=client_id)
        except CockpitUnavailable as exc:
            raise HTTPException(status_code=502, detail={"status": "upstream_unavailable", "detail": str(exc)})
        except CockpitError as exc:
            raise HTTPException(status_code=exc.status_code or 502, detail={"status": "cockpit_error", "detail": str(exc)})

    @router.get("/smoke", response_model=SmokeResponse)
    def get_smoke() -> SmokeResponse:
        client = _build_client(settings_store)
        if client is None:
            return _stub_smoke()
        try:
            with client:
                return client.get_smoke()
        except CockpitUnavailable as exc:
            raise HTTPException(status_code=502, detail={"status": "upstream_unavailable", "detail": str(exc)})
        except CockpitError as exc:
            raise HTTPException(status_code=exc.status_code or 502, detail={"status": "cockpit_error", "detail": str(exc)})

    return router
