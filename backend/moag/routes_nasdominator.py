"""
NasDominator-Routen — Prefix: /api/v1/nasdominator

Endpoints:
  GET /health      — NasDominator-Health-Snapshot (SystemStatus)
  GET /services    — Liste der ueberwachten Critical-Services
  GET /metrics     — CPU/RAM/Storage-Metriken
  GET /containers  — Container-Liste
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request

from moag.adapters import nasdominator as _nasdominator

logger = logging.getLogger("moag.routes.nasdominator")


def build_nasdominator_router(settings_store) -> APIRouter:
    router = APIRouter(prefix="/api/v1/nasdominator", tags=["NasDominator"])

    def _get_params():
        """Holt base_url, user + password aus den Settings."""
        s = settings_store.get()
        base_url = s.nasdominator_base_url or "http://192.168.200.169:9090"
        username: str | None = getattr(s, "nasdominator_user", None) or None
        password: str | None = getattr(s, "nasdominator_password", None) or None
        return base_url, username, password

    @router.get("/health")
    async def get_nasdominator_health():
        """
        NasDominator-Health-Snapshot.

        Liefert SystemStatus mit Score 0..100.
        Bei Service-Down: HTTP 502 mit ehrlicher Fehlermeldung.
        Quelle: /api/auth/status (public) + /api/dashboard (Auth).
        """
        base_url, username, password = _get_params()
        status = await _nasdominator.get_status(
            base_url=base_url, username=username, password=password
        )
        if not status.ok and status.error and "nicht erreichbar" in (status.error or ""):
            raise HTTPException(
                status_code=502,
                detail=f"NasDominator nicht erreichbar: {status.error}",
            )
        return status.model_dump()

    @router.get("/services")
    async def get_nasdominator_services():
        """
        Liste der ueberwachten Critical-Services (Oberon, OctoBoss, Postgres, ...).

        Quelle: /api/services/monitored.
        Bei 401: JSON mit auth_required=true, leere services-Liste.
        Bei Service-Down: HTTP 502.
        """
        base_url, username, password = _get_params()
        try:
            result = await _nasdominator.get_services(
                base_url=base_url, username=username, password=password
            )
            return result
        except Exception as exc:
            logger.exception("NasDominator /services Fehler: %s", exc)
            raise HTTPException(status_code=502, detail=f"NasDominator nicht erreichbar: {exc}")

    @router.get("/metrics")
    async def get_nasdominator_metrics():
        """
        Aktueller Metrik-Snapshot: CPU, RAM, Storage.

        Quelle: /api/metrics/latest.
        Bei 401: JSON mit auth_required=true, leere metrics.
        Bei Service-Down: HTTP 502.
        """
        base_url, username, password = _get_params()
        try:
            result = await _nasdominator.get_metrics(
                base_url=base_url, username=username, password=password
            )
            return result
        except Exception as exc:
            logger.exception("NasDominator /metrics Fehler: %s", exc)
            raise HTTPException(status_code=502, detail=f"NasDominator nicht erreichbar: {exc}")

    @router.get("/containers")
    async def get_nasdominator_containers():
        """
        Container-Liste aus NasDominator.

        Quelle: /api/services/containers.
        Bei 401: JSON mit auth_required=true, leere containers-Liste.
        Bei Service-Down: HTTP 502.
        """
        base_url, username, password = _get_params()
        try:
            result = await _nasdominator.get_containers(
                base_url=base_url, username=username, password=password
            )
            return result
        except Exception as exc:
            logger.exception("NasDominator /containers Fehler: %s", exc)
            raise HTTPException(status_code=502, detail=f"NasDominator nicht erreichbar: {exc}")

    return router
