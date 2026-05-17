"""
OctoBoss-Proxy-Routes fuer MOAG — alle Read-Only-Endpunkte.

Prefix: /api/v1/octoboss

Routen:
  GET /nodes              → GET /seti/nodes am Hub
  GET /nodes/{node_id}    → GET /seti/nodes/{node_id}
  GET /overview           → GET /seti/overview
  GET /jobs               → GET /jobs  (mit ?state=&limit=)
  GET /assets             → GET /api/v1/assets (mit ?type=&name=)
  GET /cluster/status     → GET /admin/cluster/status
  GET /cluster/peers      → GET /api/v1/mesh/peers
  GET /ocr/status         → GET /ocr/status
  GET /llm/models         → GET /v1/models

Hub-URL kommt aus Settings (default_hub_id-Lookup), Fallback:
  http://192.168.200.71:18765
"""
from __future__ import annotations

import logging
from typing import Any, Optional

import httpx
from fastapi import APIRouter, HTTPException, Query, Request

from .settings_store import SettingsStore

logger = logging.getLogger("moag.routes_octoboss")

_FALLBACK_HUB = "http://192.168.200.71:18765"


def _resolve_hub(settings_store: SettingsStore) -> tuple[str, Optional[str]]:
    """Liefert (hub_base_url, token) aus den Settings.

    Bevorzugt den konfigurierten default_hub, faellt auf Fallback zurueck.
    """
    s = settings_store.get()
    target_id = s.default_hub_id
    for h in s.hubs:
        if h.id == target_id:
            url = (h.url or "").rstrip("/")
            token = h.token or s.api_token
            return (url or _FALLBACK_HUB, token or None)
    # Kein passender Hub → Fallback + globales Token
    return (_FALLBACK_HUB, s.api_token or None)


def _auth_headers(token: Optional[str]) -> dict[str, str]:
    if not token:
        return {}
    return {
        "Authorization": f"Bearer {token}",
        "X-DevLoop-Token": token,
    }


async def _proxy_get(
    hub_url: str,
    path: str,
    token: Optional[str],
    params: dict[str, str] | None = None,
) -> Any:
    """Sendet ein GET an den Hub und gibt das JSON-Ergebnis zurueck.

    Wirft HTTPException mit passenden Status-Codes wenn der Hub antwortet
    oder nicht erreichbar ist.
    """
    target = f"{hub_url}{path}"
    try:
        async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as cli:
            resp = await cli.get(
                target,
                headers=_auth_headers(token),
                params=params or {},
            )
        if resp.is_success:
            ct = resp.headers.get("content-type", "")
            if "application/json" in ct:
                return resp.json()
            return {"raw": resp.text}
        # Hub-Fehler durchreichen
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"OctoBoss-Hub {path} antwortete HTTP {resp.status_code}: {resp.text[:200]}",
        )
    except HTTPException:
        raise
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail=f"OctoBoss-Hub Timeout ({path})")
    except (httpx.ConnectError, httpx.HTTPError) as exc:
        raise HTTPException(
            status_code=502,
            detail=f"OctoBoss-Hub nicht erreichbar ({path}): {exc}",
        )


def build_octoboss_router(settings_store: SettingsStore) -> APIRouter:
    """Erstellt den FastAPI-Router fuer alle OctoBoss-Proxy-Routen."""
    router = APIRouter(prefix="/api/v1/octoboss", tags=["octoboss"])

    @router.get("/nodes")
    async def get_nodes() -> Any:
        """Node-Liste: GET /seti/nodes am OctoBoss-Hub.

        Liefert Hardware-Telemetrie, Ollama-Status, Mode und Modules pro Node.
        """
        hub_url, token = _resolve_hub(settings_store)
        return await _proxy_get(hub_url, "/seti/nodes", token)

    @router.get("/nodes/{node_id}")
    async def get_node(node_id: str) -> Any:
        """Node-Detail: GET /seti/nodes/{node_id} am OctoBoss-Hub."""
        hub_url, token = _resolve_hub(settings_store)
        return await _proxy_get(hub_url, f"/seti/nodes/{node_id}", token)

    @router.get("/overview")
    async def get_overview() -> Any:
        """Capability-Summary: GET /seti/overview am OctoBoss-Hub."""
        hub_url, token = _resolve_hub(settings_store)
        return await _proxy_get(hub_url, "/seti/overview", token)

    @router.get("/jobs")
    async def get_jobs(
        state: Optional[str] = Query(default=None),
        limit: int = Query(default=50, ge=1, le=500),
    ) -> Any:
        """Scheduler-Queue: GET /jobs am OctoBoss-Hub.

        ?state=pending|running|done|failed  (optional)
        ?limit=N
        """
        hub_url, token = _resolve_hub(settings_store)
        params: dict[str, str] = {"limit": str(limit)}
        if state:
            params["state"] = state
        return await _proxy_get(hub_url, "/jobs", token, params=params)

    @router.get("/assets")
    async def get_assets(
        type: Optional[str] = Query(default=None, alias="type"),
        name: Optional[str] = Query(default=None),
    ) -> Any:
        """Asset-Inventar: GET /api/v1/assets am OctoBoss-Hub.

        ?type=model|script|...  (optional)
        ?name=<teilname>        (optional)
        """
        hub_url, token = _resolve_hub(settings_store)
        params: dict[str, str] = {}
        if type:
            params["type"] = type
        if name:
            params["name"] = name
        return await _proxy_get(hub_url, "/api/v1/assets", token, params=params)

    @router.get("/cluster/status")
    async def get_cluster_status() -> Any:
        """Cluster-Modus / Primary / Replica: GET /admin/cluster/status."""
        hub_url, token = _resolve_hub(settings_store)
        return await _proxy_get(hub_url, "/admin/cluster/status", token)

    @router.get("/cluster/peers")
    async def get_cluster_peers() -> Any:
        """Mesh-Peers: GET /api/v1/mesh/peers am OctoBoss-Hub."""
        hub_url, token = _resolve_hub(settings_store)
        return await _proxy_get(hub_url, "/api/v1/mesh/peers", token)

    @router.get("/ocr/status")
    async def get_ocr_status() -> Any:
        """OCR-Gateway-Status: GET /ocr/status am OctoBoss-Hub."""
        hub_url, token = _resolve_hub(settings_store)
        return await _proxy_get(hub_url, "/ocr/status", token)

    @router.get("/llm/models")
    async def get_llm_models() -> Any:
        """OpenAI-kompatible Model-Liste: GET /v1/models am OctoBoss-Hub.

        Liefert Ollama-Modelle die ueber den Hub-Proxy erreichbar sind.
        """
        hub_url, token = _resolve_hub(settings_store)
        return await _proxy_get(hub_url, "/v1/models", token)

    return router


# Convenience-Export fuer api.py (analog routes_cluster / routes_cockpit)
router = None  # wird in api.py ueber build_octoboss_router(...) erzeugt
