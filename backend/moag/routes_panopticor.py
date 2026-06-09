"""
Panopticor-Proxy-Routes fuer MOAG.

Prefix: /api/v1/panopticor

Routen:
  GET /status  ->  ruft Adapter get_status() ab und liefert SystemStatus als JSON.

base_url aus Settings (panopticor_base_url), Default http://127.0.0.1:8787.
Defensive Fehlerbehandlung: Adapter gibt bei Bridge-Ausfall ok=False, kein Crash.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter

from moag.adapters import panopticor as _panopticor
from moag.schemas import SystemStatus
from moag.settings_store import SettingsStore

logger = logging.getLogger("moag.routes_panopticor")

_DEFAULT_BASE = "http://127.0.0.1:8787"


def build_panopticor_router(settings_store: SettingsStore) -> APIRouter:
    router = APIRouter(prefix="/api/v1/panopticor", tags=["panopticor"])

    @router.get("/status", response_model=SystemStatus)
    async def get_panopticor_status() -> SystemStatus:
        """Liefert den aktuellen Panopticor-Bridge-Status (GET /status -> SystemStatus)."""
        s = settings_store.get()
        base_url: str = (
            getattr(s, "panopticor_base_url", None) or _DEFAULT_BASE
        ).rstrip("/")
        token: str | None = getattr(s, "panopticor_token", None) or None
        return await _panopticor.get_status(base_url=base_url, token=token)

    return router
