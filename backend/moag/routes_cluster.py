"""
Schwarm-Cluster-Status-Proxy (aus OCRexpert-GUI portiert, Phase 1).

Diese Routen reichen Cluster-Status-Calls an den aktuellen OctoBoss-Hub
(Default-Hub aus den Settings) durch.

Endpoints (alle unter /api/cluster):
  GET  /status              → /admin/cluster/status am Hub
  GET  /peers               → peers-Liste aus /admin/cluster/status am Hub
  POST /election/trigger    → /admin/election-trigger am Hub
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional

import httpx
from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field

from .settings_store import SettingsStore

logger = logging.getLogger("moag.routes_cluster")


# ── Pydantic-Schemata ──────────────────────────────────────────────────────────


class PeerInfo(BaseModel):
    model_config = ConfigDict(extra="allow")

    instance_id: str
    hostname: Optional[str] = None
    address: str
    port: int
    url: str
    mode: str
    epoch: int = 0
    last_beacon: Optional[datetime] = None
    online: bool = False
    last_known_mode: Optional[str] = None
    last_known_epoch: Optional[int] = None


class ElectionInfo(BaseModel):
    model_config = ConfigDict(extra="allow")

    timestamp: Optional[datetime] = None
    winner_id: Optional[str] = None
    reason: Optional[str] = None
    cooldown_remaining_s: float = 0.0


class ClusterStatus(BaseModel):
    model_config = ConfigDict(extra="allow")

    instance_id: str
    hostname: Optional[str] = None
    mode: str
    epoch: int = 0
    priority: int = 0
    primary_id: Optional[str] = None
    primary_address: Optional[str] = None
    node_count: int = 0
    compute_score: int = 0
    operator_priority: int = 0
    uptime_seconds: int = 0
    version: Optional[str] = None
    site_id: Optional[str] = None
    last_election: Optional[ElectionInfo] = None
    election_eligible: bool = True
    cooldown_remaining_s: float = 0.0
    load_threshold_percent: Optional[float] = None
    mode_aware_routing_enabled: Optional[bool] = None
    raw_hub_response: Optional[dict[str, Any]] = None


class PeersResponse(BaseModel):
    model_config = ConfigDict(extra="allow")
    peers: list[PeerInfo]


class ElectionTriggerRequest(BaseModel):
    reason: Optional[str] = Field(default=None)


class ElectionTriggerResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    accepted: bool
    election_id: Optional[str] = None
    cooldown_remaining_s: float = 0.0
    message: Optional[str] = None
    winner: Optional[str] = None
    i_am_winner: Optional[bool] = None
    epoch: Optional[int] = None
    peers_asked: Optional[int] = None
    peers_responded: Optional[int] = None
    reason: Optional[str] = None
    detail: Optional[str] = None


# ── Adapter Hub-0.9.3 → GUI-Schema ────────────────────────────────────────────


def _adapt_cluster_status_response(hub_data: dict[str, Any]) -> ClusterStatus:
    if "instance_id" in hub_data and "self_info" not in hub_data:
        out = ClusterStatus(**hub_data)
        out.raw_hub_response = hub_data
        return out

    si = hub_data.get("self_info") or {}
    primary_obj = hub_data.get("primary") or {}
    last_election_raw = hub_data.get("last_election")

    last_election: Optional[ElectionInfo] = None
    if isinstance(last_election_raw, dict):
        try:
            last_election = ElectionInfo(
                timestamp=last_election_raw.get("timestamp"),
                winner_id=last_election_raw.get("winner_id"),
                reason=last_election_raw.get("reason"),
                cooldown_remaining_s=float(hub_data.get("cooldown_remaining_s") or 0.0),
            )
        except Exception:
            last_election = None

    primary_id = primary_obj.get("id") or si.get("primary_id")
    primary_address = primary_obj.get("address") or si.get("primary_address")

    return ClusterStatus(
        instance_id=si.get("instance_id") or hub_data.get("instance_id") or "unknown",
        hostname=si.get("hostname") or hub_data.get("hostname"),
        mode=si.get("mode") or hub_data.get("mode") or "standalone",
        epoch=int(si.get("epoch") or 0),
        priority=int(si.get("operator_priority") or 0),
        primary_id=primary_id,
        primary_address=primary_address,
        node_count=int(si.get("node_count") or 0),
        compute_score=int(si.get("compute_score") or 0),
        operator_priority=int(si.get("operator_priority") or 0),
        uptime_seconds=int(si.get("uptime_seconds") or 0),
        version=si.get("version") or hub_data.get("version"),
        site_id=si.get("site_id") or hub_data.get("site_id"),
        last_election=last_election,
        election_eligible=bool(hub_data.get("election_eligible", True)),
        cooldown_remaining_s=float(hub_data.get("cooldown_remaining_s") or 0.0),
        load_threshold_percent=hub_data.get("load_threshold_percent"),
        mode_aware_routing_enabled=hub_data.get("mode_aware_routing_enabled"),
        raw_hub_response=hub_data,
    )


def _adapt_peers_from_cluster_status(hub_data: dict[str, Any]) -> PeersResponse:
    raw_peers = hub_data.get("peers")
    if not isinstance(raw_peers, list):
        return PeersResponse(peers=[])

    out: list[PeerInfo] = []
    for p in raw_peers:
        if not isinstance(p, dict):
            continue
        instance_id = p.get("id") or p.get("instance_id")
        if not instance_id:
            continue
        address = str(p.get("address") or "")
        port = int(p.get("port") or 0)
        url = p.get("url") or (f"http://{address}:{port}" if address else "")
        try:
            out.append(
                PeerInfo(
                    instance_id=str(instance_id),
                    hostname=p.get("hostname"),
                    address=address,
                    port=port,
                    url=url,
                    mode=str(p.get("mode") or "standalone"),
                    epoch=int(p.get("epoch") or 0),
                    last_beacon=p.get("last_beacon"),
                    online=bool(p.get("online", False)),
                    last_known_mode=p.get("last_known_mode"),
                    last_known_epoch=p.get("last_known_epoch"),
                )
            )
        except Exception as e:
            logger.warning("Peer-Eintrag uebersprungen: %s (%s)", p, e)
    return PeersResponse(peers=out)


def _adapt_election_trigger_response(hub_data: dict[str, Any]) -> ElectionTriggerResponse:
    if "accepted" in hub_data:
        return ElectionTriggerResponse(**hub_data)

    winner = hub_data.get("winner")
    epoch = hub_data.get("epoch")
    election_id: Optional[str] = None
    if winner and epoch is not None:
        election_id = f"{winner}@{epoch}"
    elif winner:
        election_id = str(winner)

    return ElectionTriggerResponse(
        accepted=bool(winner),
        election_id=election_id,
        cooldown_remaining_s=0.0,
        message=hub_data.get("detail") or hub_data.get("reason"),
        winner=winner,
        i_am_winner=hub_data.get("i_am_winner"),
        epoch=epoch,
        peers_asked=hub_data.get("peers_asked"),
        peers_responded=hub_data.get("peers_responded"),
        reason=hub_data.get("reason"),
        detail=hub_data.get("detail"),
    )


# ── Hilfsfunktionen ────────────────────────────────────────────────────────────


def _resolve_hub(settings_store: SettingsStore) -> tuple[Optional[str], Optional[str]]:
    s = settings_store.get()
    target_id = s.default_hub_id
    for h in s.hubs:
        if h.id == target_id:
            url = (h.url or "").rstrip("/")
            token = h.token or s.api_token
            return (url or None, token or None)
    return (None, None)


def _auth_headers(token: Optional[str]) -> dict[str, str]:
    if not token:
        return {}
    return {"Authorization": f"Bearer {token}"}


def _stub_status(reason: str = "stub") -> ClusterStatus:
    now = datetime.now(timezone.utc)
    return ClusterStatus(
        instance_id="stub-00000000-0000-0000-0000-000000000000",
        hostname="moag-stub",
        mode="standalone",
        epoch=0,
        priority=10,
        primary_id="stub-00000000-0000-0000-0000-000000000000",
        primary_address="127.0.0.1:8765",
        node_count=0,
        compute_score=0,
        operator_priority=10,
        uptime_seconds=0,
        version="stub",
        site_id="local",
        last_election=ElectionInfo(
            timestamp=now,
            winner_id="stub-00000000-0000-0000-0000-000000000000",
            reason=f"Mock/Fallback: {reason}",
            cooldown_remaining_s=0.0,
        ),
        election_eligible=True,
        cooldown_remaining_s=0.0,
        load_threshold_percent=85.0,
        mode_aware_routing_enabled=True,
    )


def _stub_peers() -> PeersResponse:
    now = datetime.now(timezone.utc)
    return PeersResponse(
        peers=[
            PeerInfo(
                instance_id="stub-00000000-0000-0000-0000-000000000000",
                hostname="moag-stub",
                address="127.0.0.1",
                port=8765,
                url="http://127.0.0.1:8765",
                mode="standalone",
                epoch=0,
                last_beacon=now,
                online=True,
                last_known_mode="standalone",
                last_known_epoch=0,
            ),
        ],
    )


# ── Router ────────────────────────────────────────────────────────────────────


def build_cluster_router(settings_store: SettingsStore) -> APIRouter:
    """Baut den FastAPI-Router fuer die Schwarm-Cluster-Status-Proxy-Routen."""
    router = APIRouter(prefix="/api/cluster", tags=["cluster-swarm"])

    async def _proxy_get(path: str, *, mock_response: Any) -> Any:
        url_base, token = _resolve_hub(settings_store)
        if not url_base:
            logger.info("Cluster-Proxy %s: kein Hub konfiguriert — Mock-Antwort.", path)
            return mock_response
        target = url_base + path
        try:
            async with httpx.AsyncClient(timeout=5.0, follow_redirects=True) as cli:
                resp = await cli.get(target, headers=_auth_headers(token))
            if resp.is_success:
                ct = resp.headers.get("content-type", "")
                if "application/json" in ct:
                    return resp.json()
                return resp.text
            logger.info("Cluster-Proxy %s: Hub antwortet HTTP %s — Mock-Antwort.", path, resp.status_code)
            return mock_response
        except (httpx.TimeoutException, httpx.HTTPError, OSError) as exc:
            logger.info("Cluster-Proxy %s: Hub-Fehler %s — Mock-Antwort.", path, exc)
            return mock_response

    @router.get("/status", response_model=ClusterStatus)
    async def get_cluster_status(
        mock: bool = Query(default=False),
    ) -> ClusterStatus:
        if mock:
            return _stub_status("query=mock")
        data = await _proxy_get(
            "/admin/cluster/status",
            mock_response=_stub_status("hub-unreachable").model_dump(mode="json"),
        )
        if isinstance(data, dict):
            try:
                return _adapt_cluster_status_response(data)
            except Exception as e:
                logger.warning("ClusterStatus-Schema vom Hub passt nicht: %s", e)
                return _stub_status(f"schema-drift: {type(e).__name__}")
        return _stub_status("non-dict-response")

    @router.get("/peers", response_model=PeersResponse)
    async def get_cluster_peers(
        mock: bool = Query(default=False),
    ) -> PeersResponse:
        if mock:
            return _stub_peers()
        data = await _proxy_get(
            "/admin/cluster/status",
            mock_response=_stub_status("hub-unreachable").model_dump(mode="json"),
        )
        if isinstance(data, dict):
            try:
                if "self_info" in data or "peers" in data:
                    return _adapt_peers_from_cluster_status(data)
                if "peers" in data:
                    return PeersResponse(peers=[PeerInfo(**p) for p in data["peers"]])
            except Exception as e:
                logger.warning("PeersResponse-Schema vom Hub passt nicht: %s", e)
                return _stub_peers()
        if isinstance(data, list):
            try:
                return PeersResponse(peers=[PeerInfo(**p) for p in data])
            except Exception:
                return _stub_peers()
        return _stub_peers()

    @router.post("/election/trigger", response_model=ElectionTriggerResponse)
    async def trigger_election(
        request: Request,
        body: ElectionTriggerRequest = ElectionTriggerRequest(),
        mock: bool = Query(default=False),
    ) -> ElectionTriggerResponse:
        if mock:
            return ElectionTriggerResponse(
                accepted=True,
                election_id="mock-election",
                cooldown_remaining_s=0.0,
                message="Mock-Election (kein Hub kontaktiert).",
            )

        s = settings_store.get()
        local_token = s.api_token or ""
        client_auth = request.headers.get("authorization", "")
        client_token = ""
        if client_auth.lower().startswith("bearer "):
            client_token = client_auth.split(None, 1)[1].strip()
        if not local_token and not client_token:
            raise HTTPException(
                status_code=403,
                detail="Election-Trigger verlangt Operator-Token (api_token in Settings).",
            )
        if local_token and client_token and local_token != client_token:
            raise HTTPException(
                status_code=403,
                detail="Operator-Token stimmt nicht mit lokalem api_token ueberein.",
            )

        url_base, token = _resolve_hub(settings_store)
        if not url_base:
            raise HTTPException(status_code=503, detail="Kein Default-Hub konfiguriert.")

        target = url_base + "/admin/election-trigger"
        payload = body.model_dump(exclude_none=True) or {}
        try:
            async with httpx.AsyncClient(timeout=5.0, follow_redirects=True) as cli:
                resp = await cli.post(target, headers=_auth_headers(token), json=payload)
            if resp.is_success:
                ct = resp.headers.get("content-type", "")
                if "application/json" in ct:
                    data = resp.json()
                    if isinstance(data, dict):
                        try:
                            return _adapt_election_trigger_response(data)
                        except Exception as e:
                            logger.warning("ElectionTriggerResponse-Adapter-Fehler: %s", e)
                return ElectionTriggerResponse(
                    accepted=True,
                    message=f"Hub-Antwort HTTP {resp.status_code}",
                )
            raise HTTPException(
                status_code=resp.status_code,
                detail=f"Hub lehnte Election ab: HTTP {resp.status_code} {resp.text[:200]}",
            )
        except httpx.TimeoutException:
            raise HTTPException(status_code=504, detail="Hub antwortete nicht (Timeout 5s).")
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"Hub-Aufruf fehlgeschlagen: {exc}")

    return router
