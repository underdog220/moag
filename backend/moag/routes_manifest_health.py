"""
Manifest-Health-Routen fuer MOAG.

Prefix: /api/v1/manifest

Routen:
  GET /health        → Manifest-Health-Check (Bootstrapper + Core)
  GET /health/bootstrapper → Nur Bootstrapper
  GET /health/core         → Nur Core

Hub-URL kommt aus Settings (default_hub_id), Fallback VDR:18765.
"""
from __future__ import annotations

import logging
from typing import Literal, Optional

from fastapi import APIRouter, Query

from .manifest_health import get_manifest_health
from .settings_store import SettingsStore

logger = logging.getLogger("moag.routes_manifest_health")

_FALLBACK_HUB = "http://192.168.200.71:18765"


def _resolve_hub(settings_store: SettingsStore) -> str:
    """Liefert Hub-Base-URL aus Settings (default_hub_id), Fallback VDR."""
    s = settings_store.get()
    target_id = s.default_hub_id
    for h in s.hubs:
        if h.id == target_id:
            url = (h.url or "").rstrip("/")
            if url:
                return url
    return _FALLBACK_HUB


def build_manifest_health_router(settings_store: SettingsStore) -> APIRouter:
    """Erstellt den FastAPI-Router fuer Manifest-Health-Checks."""
    router = APIRouter(prefix="/api/v1/manifest", tags=["manifest-health"])

    @router.get("/health")
    async def get_health(
        target: Literal["both", "bootstrapper", "core"] = Query(default="both"),
        hub_url: Optional[str] = Query(default=None),
    ) -> dict:
        """Manifest-Health-Check fuer Hub-Manifests (Bootstrapper + Core).

        Prueft via Live-Hub-API:
        - Schema-Konformitaet (default_version, versions{}, node_overrides)
        - Cross-Reference (default_version in versions{})
        - node_overrides-Werte sind Strings (nicht Objects — heute-morgen-Bug!)
        - EXE-Files verfuegbar (via Hub binaries.available)
        - SHA256-Konsistenz (Hub vs. Manifest)
        - Live-Konsistenz (Hub-API == Manifest-default_version)

        Query-Parameter:
          target   = "both" | "bootstrapper" | "core"  (Default: "both")
          hub_url  = Hub-URL (optional, ueberschreibt Settings-Hub)
        """
        effective_hub = (hub_url or "").rstrip("/") or _resolve_hub(settings_store)
        return await get_manifest_health(
            hub_base_url=effective_hub,
            target=target,
        )

    @router.get("/health/bootstrapper")
    async def get_bootstrapper_health(
        hub_url: Optional[str] = Query(default=None),
    ) -> dict:
        """Manifest-Health-Check nur fuer Bootstrapper-Manifest."""
        effective_hub = (hub_url or "").rstrip("/") or _resolve_hub(settings_store)
        return await get_manifest_health(
            hub_base_url=effective_hub,
            target="bootstrapper",
        )

    @router.get("/health/core")
    async def get_core_health(
        hub_url: Optional[str] = Query(default=None),
    ) -> dict:
        """Manifest-Health-Check nur fuer Core-Manifest."""
        effective_hub = (hub_url or "").rstrip("/") or _resolve_hub(settings_store)
        return await get_manifest_health(
            hub_base_url=effective_hub,
            target="core",
        )

    return router
