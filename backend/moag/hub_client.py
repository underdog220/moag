"""
Hub-Multi-Discovery — pollt alle in den Settings konfigurierten Hubs
parallel und cached die Ergebnisse.

Endpoints, die wir fragen (analog OctoBoss-Hub):
  HEAD /health        → Reachability + Latency
  GET  /seti/nodes    → Liste der verbundenen Nodes

Cache-Strategie:
  TTL = 5 s. get_status() liefert immer den letzten Snapshot, ein
  Hintergrund-Task aktualisiert in einer Schleife.
"""
from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timezone
from typing import Any, Optional

import httpx

from .events import EventBus
from .models import (
    ClusterNode,
    EngineMatrix,
    HubConfig,
    HubStatus,
    ModuleInfo,
    NodeHardware,
)

logger = logging.getLogger("moag.hub_client")

DEFAULT_TIMEOUT = 3.0
POLL_INTERVAL = 5.0


class HubClient:
    """
    Async-Multi-Hub-Client. Cached HubStatus + ClusterNode pro Hub.
    """

    def __init__(self, event_bus: EventBus | None = None,
                 timeout: float = DEFAULT_TIMEOUT,
                 poll_interval: float = POLL_INTERVAL):
        self._event_bus = event_bus
        self._timeout = timeout
        self._poll_interval = poll_interval
        self._hubs: list[HubConfig] = []
        self._default_hub_id: str = ""
        self._status_cache: dict[str, HubStatus] = {}
        self._nodes_cache: dict[str, list[ClusterNode]] = {}
        self._task: asyncio.Task | None = None
        self._lock = asyncio.Lock()

    def configure(self, hubs: list[HubConfig], default_hub_id: str) -> None:
        self._hubs = list(hubs)
        self._default_hub_id = default_hub_id
        for hub_id in list(self._status_cache):
            if hub_id not in {h.id for h in hubs}:
                self._status_cache.pop(hub_id, None)
                self._nodes_cache.pop(hub_id, None)

    async def start(self) -> None:
        if self._task is not None and not self._task.done():
            return
        await self.poll_once()
        self._task = asyncio.create_task(self._poll_loop(), name="hub-client-poll")

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):
                pass
            self._task = None

    async def _poll_loop(self) -> None:
        try:
            while True:
                await asyncio.sleep(self._poll_interval)
                await self.poll_once()
        except asyncio.CancelledError:
            return

    async def poll_once(self) -> dict[str, HubStatus]:
        if not self._hubs:
            return self._status_cache
        async with self._lock:
            tasks = [self._poll_hub(h) for h in self._hubs]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            for hub, res in zip(self._hubs, results):
                if isinstance(res, Exception):
                    logger.debug("Hub %s Poll-Exception: %s", hub.id, res)
                    res = self._error_status(hub, str(res))
                self._maybe_emit_status_change(hub.id, res)
                self._status_cache[hub.id] = res
            return dict(self._status_cache)

    async def _poll_hub(self, hub: HubConfig) -> HubStatus:
        is_default = (hub.id == self._default_hub_id)
        last_check = datetime.now(timezone.utc)

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            t0 = time.perf_counter()
            try:
                resp = await client.head(f"{hub.url.rstrip('/')}/health")
                if resp.status_code >= 400:
                    resp = await client.get(f"{hub.url.rstrip('/')}/health")
                latency_ms = int((time.perf_counter() - t0) * 1000)
                if resp.status_code >= 400:
                    return HubStatus(
                        id=hub.id, name=hub.name, url=hub.url,
                        reachable=False, latency_ms=latency_ms,
                        nodes_total=0, nodes_connected=0, engines_count=0,
                        is_default=is_default, last_check=last_check,
                        error=f"HTTP {resp.status_code}",
                    )
            except Exception as e:
                latency_ms = int((time.perf_counter() - t0) * 1000)
                return HubStatus(
                    id=hub.id, name=hub.name, url=hub.url,
                    reachable=False, latency_ms=latency_ms,
                    nodes_total=0, nodes_connected=0, engines_count=0,
                    is_default=is_default, last_check=last_check,
                    error=str(e)[:200],
                )

            try:
                nodes = await self._fetch_nodes(client, hub)
            except Exception as e:
                logger.debug("Hub %s /seti/nodes fehlgeschlagen: %s", hub.id, e)
                nodes = []

        self._nodes_cache[hub.id] = nodes
        connected = sum(1 for n in nodes if n.connected)
        engines_count = self._count_engines(nodes)

        return HubStatus(
            id=hub.id, name=hub.name, url=hub.url,
            reachable=True, latency_ms=latency_ms,
            nodes_total=len(nodes),
            nodes_connected=connected,
            engines_count=engines_count,
            is_default=is_default, last_check=last_check,
        )

    async def _fetch_nodes(self, client: httpx.AsyncClient, hub: HubConfig) -> list[ClusterNode]:
        headers = {}
        if hub.token:
            headers["Authorization"] = f"Bearer {hub.token}"
            headers["X-DevLoop-Token"] = hub.token

        for path in ("/seti/nodes", "/api/v1/nodes"):
            url = f"{hub.url.rstrip('/')}{path}"
            try:
                resp = await client.get(url, headers=headers)
                if resp.status_code == 404:
                    continue
                resp.raise_for_status()
                data = resp.json()
                return self._map_nodes(data)
            except (httpx.HTTPError, ValueError) as e:
                logger.debug("Hub %s %s fehlgeschlagen: %s", hub.id, path, e)
                continue
        return []

    @staticmethod
    def _map_nodes(data: Any) -> list[ClusterNode]:
        if isinstance(data, dict):
            data = data.get("nodes") or data.get("items") or []
        if not isinstance(data, list):
            return []
        nodes: list[ClusterNode] = []
        for n in data:
            if not isinstance(n, dict):
                continue
            try:
                # hardware_direct (HwDirectPullPoller) hat echte Lastwerte;
                # hardware (Heartbeat) liefert gpu_load/cpu_load als null — bekannter Bug.
                # Fallback-Logik einmalig hier, nicht im Frontend.
                hw_direct = n.get("hardware_direct") or {}
                hw_hb = n.get("hardware") or {}
                # Effektiver Rohwert: hardware_direct bevorzugt, Fallback hardware
                hw_raw: dict = hw_direct if hw_direct else hw_hb
                # Quell-Flag: "direct" wenn hardware_direct existiert und nicht leer
                hw_source: Optional[str] = (
                    "direct" if hw_direct else ("heartbeat" if hw_hb else None)
                )
                hw_at: Optional[str] = n.get("hardware_direct_at")
                hw = NodeHardware(
                    gpu_name=hw_raw.get("gpu_name"),
                    gpu_load_percent=hw_raw.get("gpu_load_percent"),
                    cpu_load_percent=hw_raw.get("cpu_load_percent"),
                    cpu_model=hw_raw.get("cpu_model"),
                    ram_free_gb=hw_raw.get("ram_free_gb"),
                    vram_free_gb=hw_raw.get("vram_free_gb"),
                    gpu_temp_c=hw_raw.get("gpu_temp_c"),
                    cpu_temp_c=hw_raw.get("cpu_temp_c"),
                    gpu_present=hw_raw.get("gpu_present"),
                    gpu_runtime_ready=hw_raw.get("gpu_runtime_ready"),
                    hardware_source=hw_source,
                    hardware_at=hw_at,
                )
                modules = []
                for m in (n.get("modules") or []):
                    if isinstance(m, dict) and m.get("name"):
                        modules.append(ModuleInfo(name=m["name"], version=str(m.get("version", "?"))))
                last_hb_raw = n.get("last_heartbeat")
                last_hb = None
                if isinstance(last_hb_raw, str):
                    try:
                        last_hb = datetime.fromisoformat(last_hb_raw.replace("Z", "+00:00"))
                    except ValueError:
                        last_hb = None
                nodes.append(ClusterNode(
                    node_id=str(n.get("node_id") or n.get("id") or "?"),
                    hostname=str(n.get("hostname") or "?"),
                    connected=bool(n.get("connected", n.get("online", False))),
                    last_heartbeat=last_hb,
                    hardware=hw,
                    engines=list(n.get("engines") or []),
                    modules=modules,
                    last_known_ip=n.get("last_known_ip") or n.get("ip"),
                ))
            except Exception as e:
                logger.warning("Node-Mapping fehlgeschlagen: %s", e)
        return nodes

    @staticmethod
    def _count_engines(nodes: list[ClusterNode]) -> int:
        return sum(len(n.engines) for n in nodes if n.connected)

    @staticmethod
    def _error_status(hub: HubConfig, err: str) -> HubStatus:
        return HubStatus(
            id=hub.id, name=hub.name, url=hub.url,
            reachable=False, latency_ms=None,
            nodes_total=0, nodes_connected=0, engines_count=0,
            is_default=False, last_check=datetime.now(timezone.utc),
            error=err[:200],
        )

    def _maybe_emit_status_change(self, hub_id: str, new_status: HubStatus) -> None:
        prev = self._status_cache.get(hub_id)
        if self._event_bus is None:
            return
        if prev is None or prev.reachable != new_status.reachable or prev.nodes_connected != new_status.nodes_connected:
            self._event_bus.publish(
                "hub_status_changed",
                hub_id=hub_id,
                status="ok" if new_status.reachable else "down",
                reachable=new_status.reachable,
                latency_ms=new_status.latency_ms,
                nodes_connected=new_status.nodes_connected,
                nodes_total=new_status.nodes_total,
            )

    def get_status(self) -> list[HubStatus]:
        result: list[HubStatus] = []
        for h in self._hubs:
            cached = self._status_cache.get(h.id)
            if cached is not None:
                result.append(cached)
            else:
                result.append(HubStatus(
                    id=h.id, name=h.name, url=h.url,
                    reachable=False, latency_ms=None,
                    nodes_total=0, nodes_connected=0, engines_count=0,
                    is_default=(h.id == self._default_hub_id),
                    last_check=datetime.now(timezone.utc),
                    error="not polled yet",
                ))
        return result

    def get_status_by_id(self, hub_id: str) -> Optional[HubStatus]:
        return self._status_cache.get(hub_id)

    def get_nodes(self, hub_id: str | None = None) -> list[ClusterNode]:
        target_id = hub_id or self._default_hub_id
        return list(self._nodes_cache.get(target_id, []))

    def get_engine_matrix(self, hub_id: str | None = None) -> EngineMatrix:
        nodes = self.get_nodes(hub_id)
        engines_set: set[str] = set()
        for n in nodes:
            engines_set.update(n.engines)
        engines = sorted(engines_set)
        node_names = [n.hostname for n in nodes]
        matrix: list[list[str]] = []
        for eng in engines:
            row: list[str] = []
            for n in nodes:
                if eng in n.engines:
                    row.append("ok")
                else:
                    row.append("missing")
            matrix.append(row)
        return EngineMatrix(engines=engines, nodes=node_names, available=matrix)
