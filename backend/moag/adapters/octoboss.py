"""
OctoBoss-Adapter — liefert SystemStatus aus dem OctoBoss-Hub.

Ruft HEAD /health + GET /seti/overview an. Nutzt HubClient-Cache
falls vorhanden, sonst direkter HTTP-Call.
"""
from __future__ import annotations

import logging
import time
from datetime import datetime, timezone

import httpx

from moag.pipeline_hooks import plog
from moag.schemas import SystemStatus

logger = logging.getLogger("moag.adapters.octoboss")


async def get_status(
    hub_url: str | None = None,
    base_url: str | None = None,
    token: str | None = None,
) -> SystemStatus:
    """Fragt OctoBoss /health und /seti/nodes und berechnet daraus SystemStatus."""
    # base_url als Alias fuer hub_url (Konsistenz mit anderen Adaptern)
    effective_url = base_url or hub_url or "http://192.168.200.71:18765"
    fetched_at = datetime.now(timezone.utc)
    t0 = time.monotonic()
    headers: dict[str, str] = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
        headers["X-DevLoop-Token"] = token

    base = effective_url.rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            # Health-Check
            try:
                resp_health = await client.head(f"{base}/health", headers=headers)
                if resp_health.status_code >= 400:
                    resp_health = await client.get(f"{base}/health", headers=headers)
                reachable = resp_health.status_code < 400
            except Exception:
                reachable = False

            if not reachable:
                dauer_ms = int((time.monotonic() - t0) * 1000)
                plog.step("octoboss.adapter", "health", input={"url": base}, output={"reachable": False}, dauer_ms=dauer_ms, ok=False)
                return SystemStatus(
                    system_id="octoboss",
                    ok=False,
                    score=0,
                    summary="OctoBoss nicht erreichbar.",
                    metrics={"latency_ms": dauer_ms},
                    fetched_at=fetched_at,
                    error=f"OctoBoss {base} nicht erreichbar",
                )

            # Cluster-Status
            nodes_total = 0
            nodes_connected = 0
            try:
                resp_nodes = await client.get(f"{base}/seti/nodes", headers=headers)
                if resp_nodes.is_success:
                    data = resp_nodes.json()
                    nodes_list = data if isinstance(data, list) else data.get("nodes", [])
                    nodes_total = len(nodes_list)
                    nodes_connected = sum(1 for n in nodes_list if n.get("connected") or n.get("online"))
            except Exception as e:
                logger.debug("OctoBoss /seti/nodes fehlgeschlagen: %s", e)

            dauer_ms = int((time.monotonic() - t0) * 1000)
            plog.step("octoboss.adapter", "nodes", input={"url": base}, output={"nodes_total": nodes_total, "connected": nodes_connected}, dauer_ms=dauer_ms, ok=True)

            if nodes_total == 0:
                score = 60
            elif nodes_connected == nodes_total:
                score = 100
            else:
                score = int(60 + 40 * (nodes_connected / max(1, nodes_total)))

            summary = f"OctoBoss erreichbar: {nodes_connected}/{nodes_total} Nodes verbunden."
            return SystemStatus(
                system_id="octoboss",
                ok=True,
                score=score,
                summary=summary,
                metrics={
                    "nodes_total": nodes_total,
                    "nodes_connected": nodes_connected,
                    "latency_ms": dauer_ms,
                },
                fetched_at=fetched_at,
            )

    except Exception as exc:
        dauer_ms = int((time.monotonic() - t0) * 1000)
        logger.exception("OctoBoss-Adapter Fehler: %s", exc)
        return SystemStatus(
            system_id="octoboss",
            ok=False,
            score=0,
            summary="OctoBoss-Adapter: unerwarteter Fehler.",
            metrics={"latency_ms": dauer_ms},
            fetched_at=fetched_at,
            error=str(exc)[:300],
        )
