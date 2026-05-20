"""
Manifest-Health-Routen fuer MOAG.

Prefix: /api/v1/manifest

Routen:
  GET /health        → Manifest-Health-Check (Bootstrapper + Core)
  GET /health/bootstrapper → Nur Bootstrapper
  GET /health/core         → Nur Core
  GET /health/all    → Alle konfigurierten Hubs parallel (Multi-Hub-View)

Hub-URL kommt aus Settings (default_hub_id), Fallback VDR:18765.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Literal, Optional

import httpx
from fastapi import APIRouter, Query

from .manifest_health import get_manifest_health
from .settings_store import SettingsStore

logger = logging.getLogger("moag.routes_manifest_health")

_FALLBACK_HUB = "http://192.168.200.71:18765"

# Timeout pro Hub-Probe in /health/all
_HUB_PROBE_TIMEOUT_S = 5.0


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


async def _probe_hub_with_timeout(
    hub_id: str,
    hub_url: str,
    is_active: bool,
    timeout_s: float,
) -> dict[str, Any]:
    """Fuehrt get_manifest_health fuer einen einzelnen Hub mit Timeout durch.

    Bei Timeout oder Verbindungsfehler wird health auf {"error": "timeout"} gesetzt.
    """
    try:
        health = await asyncio.wait_for(
            get_manifest_health(hub_base_url=hub_url, target="both"),
            timeout=timeout_s,
        )
    except asyncio.TimeoutError:
        logger.warning("Hub-Probe Timeout nach %.1fs: %s (%s)", timeout_s, hub_id, hub_url)
        health = {"error": "timeout", "detail": f"Hub {hub_url} hat nicht innerhalb von {timeout_s}s geantwortet."}
    except (httpx.ConnectError, httpx.HTTPError, OSError) as exc:
        logger.warning("Hub-Probe Verbindungsfehler: %s (%s): %s", hub_id, hub_url, exc)
        health = {"error": "connection_error", "detail": str(exc)}

    return {
        "id": hub_id,
        "url": hub_url,
        "is_active": is_active,
        "health": health,
    }


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

    @router.get("/health/all")
    async def get_health_all() -> dict:
        """Manifest-Health-Check fuer ALLE konfigurierten Hubs parallel.

        Fuer jeden Hub in settings_store.hubs wird get_manifest_health parallel
        aufgerufen (Timeout: 5s pro Hub). Nicht erreichbare Hubs liefern
        health.error statt health.manifests.

        Antwort-Schema:
          schema:        "manifest-health-all-v1"
          active_hub_id: ID des default_hub_id aus Settings
          hubs: [
            {
              id:        Hub-ID
              url:       Hub-URL
              is_active: true wenn id == default_hub_id
              health:    ManifestHealth-Daten (wie /health) oder {"error": "timeout"|"connection_error"}
            }, ...
          ]
        """
        s = settings_store.get()
        active_id = s.default_hub_id

        # Parallel-Probes fuer alle konfigurierten Hubs
        tasks = []
        for hub in s.hubs:
            hub_url_clean = (hub.url or "").rstrip("/")
            if not hub_url_clean:
                continue
            is_active = hub.id == active_id
            tasks.append(
                _probe_hub_with_timeout(
                    hub_id=hub.id,
                    hub_url=hub_url_clean,
                    is_active=is_active,
                    timeout_s=_HUB_PROBE_TIMEOUT_S,
                )
            )

        if not tasks:
            # Kein Hub konfiguriert — Fallback auf Default-Hub
            hub_results = [
                await _probe_hub_with_timeout(
                    hub_id="fallback",
                    hub_url=_FALLBACK_HUB,
                    is_active=True,
                    timeout_s=_HUB_PROBE_TIMEOUT_S,
                )
            ]
            active_id = "fallback"
        else:
            hub_results = list(await asyncio.gather(*tasks))

        return {
            "schema": "manifest-health-all-v1",
            "active_hub_id": active_id,
            "hubs": hub_results,
        }

    return router
