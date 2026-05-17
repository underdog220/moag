"""
Custos-Drilldown-Routen — prefix /api/v1/custos.

Endpoints:
  GET  /api/v1/custos/health              — Custos-Service-Health
  GET  /api/v1/custos/findings            — Findings (optional: severity, limit, offset)
  GET  /api/v1/custos/rules               — Liste registrierter Rules
  GET  /api/v1/custos/rules/{rule_id}/last-run — letzter Engine-Lauf fuer eine Regel
  GET  /api/v1/custos/audit               — Engine-Status aller Regeln (Audit-Trail)

Bei Service-down: HTTP 502.
"""
from __future__ import annotations

import logging
from typing import Any, Optional

import httpx
from fastapi import APIRouter, HTTPException, Query

from moag.settings_store import SettingsStore

logger = logging.getLogger("moag.routes_custos")

_settings_store: Optional[SettingsStore] = None


def build_custos_router(settings_store: SettingsStore) -> APIRouter:
    """Erstellt den Custos-Router mit Settings-Zugang."""
    global _settings_store
    _settings_store = settings_store

    router = APIRouter(prefix="/api/v1/custos", tags=["custos"])

    def _base() -> str:
        s = _settings_store.get()  # type: ignore[union-attr]
        return s.custos_base_url.rstrip("/")

    async def _get(path: str, params: dict | None = None) -> Any:
        """HTTP-GET gegen Custos; wirft 502 wenn nicht erreichbar."""
        base = _base()
        url = f"{base}{path}"
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.get(url, params=params)
            if not resp.is_success:
                raise HTTPException(
                    status_code=502,
                    detail=f"Custos antwortet HTTP {resp.status_code} auf {path}",
                )
            return resp.json()
        except HTTPException:
            raise
        except httpx.TimeoutException:
            raise HTTPException(
                status_code=502,
                detail=f"Custos Timeout (8s) auf {url}",
            )
        except Exception as exc:
            logger.warning("Custos-Proxy Fehler: %s", exc)
            raise HTTPException(
                status_code=502,
                detail=f"Custos nicht erreichbar: {type(exc).__name__}: {exc}",
            )

    @router.get("/health")
    async def custos_health() -> dict:
        """Custos Liveness-Check (GET /api/health)."""
        return await _get("/api/health")

    @router.get("/findings")
    async def custos_findings(
        severity: str | None = Query(
            default=None,
            description="Filter nach Schwere: INFO | WARN | CRIT",
        ),
        status: str | None = Query(
            default=None,
            description="Filter nach Status: OFFEN | IN_ARBEIT | GELOEST | IRRELEVANT",
        ),
        limit: int = Query(default=100, ge=1, le=500),
        offset: int = Query(default=0, ge=0),
    ) -> list:
        """Findings von Custos abrufen (GET /api/findings).

        severity wird auf Custos-Spalte 'schwere' gemappt.
        """
        params: dict[str, Any] = {"limit": limit, "offset": offset}
        if severity:
            params["schwere"] = severity.upper()
        if status:
            params["status"] = status.upper()
        return await _get("/api/findings", params=params)

    @router.get("/rules")
    async def custos_rules() -> list:
        """Alle Compliance-Regeln von Custos (GET /api/regeln)."""
        return await _get("/api/regeln")

    @router.get("/rules/{rule_id}/last-run")
    async def custos_rule_last_run(rule_id: str) -> dict:
        """Detail einer Regel inkl. letzter_lauf (GET /api/regeln/{id}).

        Liefert das Regel-Objekt von Custos — letzter_lauf ist darin enthalten.
        """
        return await _get(f"/api/regeln/{rule_id}")

    @router.get("/audit")
    async def custos_audit(
        limit: int = Query(
            default=50, ge=1, le=500,
            description="Maximale Anzahl Eintraege (Regeln nach letztem Lauf sortiert).",
        ),
    ) -> dict:
        """Engine-Status aller Regeln als Audit-Trail (GET /api/engine/status).

        Liefert fuer jede Regel: regel_id, aktiv, laufintervall_minuten, letzter_lauf.
        """
        data = await _get("/api/engine/status")
        # Optionales limit auf die Regeln-Liste anwenden
        regeln = data.get("regeln", [])
        if limit < len(regeln):
            data = dict(data)
            data["regeln"] = regeln[:limit]
        return data

    return router
