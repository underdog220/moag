"""
OpenAPI-Browser-Router fuer MOAG.

Endpoints:
  GET /api/v1/openapi/targets   — Liste aller bekannten Systeme
  GET /api/v1/openapi/{target}  — Geparste Endpoint-Liste fuer ein System

Fuer target="moag": nutzt request.app.openapi() (FastAPI generiert die Spec).
Fuer Sub-Systeme: holt per httpx.AsyncClient das /openapi.json (timeout 5s).
Nicht-Erreichbarkeit / Timeout → HTTP 200 mit reachable=false (kein 500).
"""
from __future__ import annotations

import logging
from typing import Any

import httpx
from fastapi import APIRouter, Request

from .settings_store import SettingsStore

logger = logging.getLogger("moag.routes_openapi")


def build_openapi_router(settings_store: SettingsStore) -> APIRouter:
    """Erstellt den OpenAPI-Browser-Router mit Zugriff auf den Settings-Store."""

    router = APIRouter(prefix="/api/v1/openapi", tags=["openapi-browser"])

    # ── Hilfsfunktionen ────────────────────────────────────────────────────────

    def _get_targets(s: Any) -> list[dict[str, str]]:
        """Baut die Target-Liste aus dem Settings-Objekt.

        Enthält MOAG selbst + alle konfigurierten Sub-Systeme.
        OctoBoss-URL wird aus dem Default-Hub ermittelt (Fallback: erster Hub).
        """
        # OctoBoss-URL aus Hubs ermitteln
        octoboss_url = ""
        for h in s.hubs:
            if h.id == s.default_hub_id:
                octoboss_url = h.url
                break
        if not octoboss_url and s.hubs:
            octoboss_url = s.hubs[0].url

        targets: list[dict[str, str]] = [
            {"id": "moag",         "name": "MOAG (lokal)",        "url": ""},
            {"id": "oberon",       "name": "Oberon",               "url": s.oberon_base_url},
            {"id": "octoboss",     "name": "OctoBoss (Hub)",       "url": octoboss_url},
            {"id": "ocrexpert",    "name": "OCRexpert",            "url": s.ocrexpert_base_url},
            {"id": "nasdominator", "name": "NasDominator",         "url": s.nasdominator_base_url},
            {"id": "custos",       "name": "Custos",               "url": s.custos_base_url},
            {"id": "panopticor",   "name": "Panopticor",           "url": s.panopticor_base_url},
        ]
        return targets

    def _parse_paths(openapi_spec: dict) -> list[dict[str, Any]]:
        """Parst paths{} aus einer OpenAPI-3.x-Spec und liefert eine flache Endpoint-Liste.

        Jeder Eintrag enthaelt: path, method, summary, tags.
        Unbekannte HTTP-Methoden (z.B. 'servers', 'parameters') werden uebersprungen.
        """
        HTTP_METHODS = {"get", "post", "put", "delete", "patch", "head", "options"}
        endpoints: list[dict[str, Any]] = []

        paths = openapi_spec.get("paths") or {}
        for path, path_item in paths.items():
            if not isinstance(path_item, dict):
                continue
            for method, operation in path_item.items():
                if method.lower() not in HTTP_METHODS:
                    continue
                if not isinstance(operation, dict):
                    continue
                endpoints.append({
                    "path": path,
                    "method": method.upper(),
                    "summary": operation.get("summary") or "",
                    "tags": operation.get("tags") or [],
                })

        return endpoints

    # ── Endpoints ──────────────────────────────────────────────────────────────

    @router.get("/targets")
    async def list_targets() -> list[dict[str, str]]:
        """Liefert alle bekannten Systeme als {id, name, url}.

        Quelle: Settings (oberon_base_url, hubs[], etc.).
        """
        s = settings_store.get()
        return _get_targets(s)

    @router.get("/{target}")
    async def get_target_endpoints(target: str, request: Request) -> dict[str, Any]:
        """Liefert die geparste Endpoint-Liste fuer das angegebene Target.

        Fuer target='moag': nutzt die FastAPI-eigene OpenAPI-Spec.
        Fuer alle anderen: holt /openapi.json per HTTP (timeout 5s).

        Bei Nicht-Erreichbarkeit oder Fehler: reachable=false, keine Exception.
        """
        s = settings_store.get()
        targets_by_id = {t["id"]: t for t in _get_targets(s)}

        if target not in targets_by_id:
            return {
                "target": target,
                "reachable": False,
                "error": f"Unbekanntes Target '{target}'. Bekannte IDs: {list(targets_by_id)}",
                "endpoints": [],
                "endpoint_count": 0,
            }

        # MOAG selbst — FastAPI generiert die Spec in-process
        if target == "moag":
            try:
                spec = request.app.openapi()
                endpoints = _parse_paths(spec)
                return {
                    "target": "moag",
                    "reachable": True,
                    "endpoint_count": len(endpoints),
                    "endpoints": endpoints,
                }
            except Exception as exc:
                logger.warning("MOAG-Spec konnte nicht gelesen werden: %s", exc)
                return {
                    "target": "moag",
                    "reachable": False,
                    "error": str(exc)[:300],
                    "endpoints": [],
                    "endpoint_count": 0,
                }

        # Sub-System: /openapi.json per HTTP holen
        info = targets_by_id[target]
        base_url = (info.get("url") or "").rstrip("/")
        if not base_url:
            return {
                "target": target,
                "reachable": False,
                "error": "Keine URL konfiguriert.",
                "endpoints": [],
                "endpoint_count": 0,
            }

        url = f"{base_url}/openapi.json"
        try:
            async with httpx.AsyncClient(timeout=5.0, follow_redirects=True) as client:
                resp = await client.get(url)

            if resp.status_code == 401 or resp.status_code == 403:
                return {
                    "target": target,
                    "reachable": False,
                    "error": f"HTTP {resp.status_code} — Authentifizierung erforderlich.",
                    "endpoints": [],
                    "endpoint_count": 0,
                }

            if not resp.is_success:
                return {
                    "target": target,
                    "reachable": False,
                    "error": f"HTTP {resp.status_code}",
                    "endpoints": [],
                    "endpoint_count": 0,
                }

            spec = resp.json()
            endpoints = _parse_paths(spec)
            return {
                "target": target,
                "reachable": True,
                "endpoint_count": len(endpoints),
                "endpoints": endpoints,
            }

        except httpx.TimeoutException:
            return {
                "target": target,
                "reachable": False,
                "error": "Timeout nach 5s",
                "endpoints": [],
                "endpoint_count": 0,
            }
        except Exception as exc:
            logger.warning("OpenAPI-Fetch fuer '%s' fehlgeschlagen: %s", target, exc)
            return {
                "target": target,
                "reachable": False,
                "error": f"{type(exc).__name__}: {exc}"[:300],
                "endpoints": [],
                "endpoint_count": 0,
            }

    return router
