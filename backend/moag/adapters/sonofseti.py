"""
SonOfSETI-Adapter — liefert SystemStatus vom SonOfSETI-Node-REST.

Spricht direkt den neuen modularen SonOfSETI-Client (Port 7878, REST).
Endpoints: GET /health, GET /identity, GET /modules, GET /hub/status

Auth: X-SonOfSETI-Token Header.

Node-Adressen kommen in V1 aus den Settings oder Fallback auf localhost.
Wenn keine Node erreichbar, ok=False mit erklaerndem summary.
"""
from __future__ import annotations

import logging
import time
from datetime import datetime, timezone

import httpx

from moag.pipeline_hooks import plog
from moag.schemas import SystemStatus

logger = logging.getLogger("moag.adapters.sonofseti")

# Port des neuen modularen SonOfSETI-REST-Client
SONOFSETI_PORT = 7878


async def get_status(
    node_addresses: list[str] | None = None,
    token: str | None = None,
) -> SystemStatus:
    """Fragt SonOfSETI-Node(s) und berechnet daraus SystemStatus.

    node_addresses: Liste von Host:Port-Strings (z.B. ["192.168.200.71:7878"]).
    Wenn leer/None: kein Node konfiguriert -> ok=False.
    """
    fetched_at = datetime.now(timezone.utc)

    if not node_addresses:
        return SystemStatus(
            system_id="sonofseti",
            ok=False,
            score=0,
            summary="Keine SonOfSETI-Node-Adressen konfiguriert.",
            metrics={},
            fetched_at=fetched_at,
            error="Keine Node-Adressen (aus OctoBoss-Heartbeat-Cache) verfuegbar — Phase 1 Stub",
        )

    headers: dict[str, str] = {}
    if token:
        headers["X-SonOfSETI-Token"] = token

    t0 = time.monotonic()
    nodes_ok = 0
    nodes_total = len(node_addresses)
    module_counts: list[int] = []

    for addr in node_addresses:
        base = f"http://{addr}" if not addr.startswith("http") else addr
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(f"{base}/health", headers=headers)
                if resp.is_success:
                    nodes_ok += 1
                    # Module abfragen
                    try:
                        resp_mod = await client.get(f"{base}/modules", headers=headers)
                        if resp_mod.is_success:
                            mods = resp_mod.json()
                            if isinstance(mods, list):
                                module_counts.append(len(mods))
                            elif isinstance(mods, dict):
                                module_counts.append(len(mods.get("modules", [])))
                    except Exception:
                        pass
        except Exception as e:
            logger.debug("SonOfSETI-Node %s nicht erreichbar: %s", addr, e)

    dauer_ms = int((time.monotonic() - t0) * 1000)
    plog.step(
        "sonofseti.adapter", "health",
        input={"nodes": nodes_total},
        output={"nodes_ok": nodes_ok},
        dauer_ms=dauer_ms,
        ok=nodes_ok > 0,
    )

    if nodes_ok == 0:
        return SystemStatus(
            system_id="sonofseti",
            ok=False,
            score=0,
            summary=f"SonOfSETI: alle {nodes_total} Nodes nicht erreichbar.",
            metrics={"nodes_total": nodes_total, "nodes_ok": 0, "latency_ms": dauer_ms},
            fetched_at=fetched_at,
            error=f"0/{nodes_total} Nodes erreichbar",
        )

    score = int(100 * (nodes_ok / nodes_total))
    avg_modules = int(sum(module_counts) / max(1, len(module_counts))) if module_counts else 0

    return SystemStatus(
        system_id="sonofseti",
        ok=True,
        score=score,
        summary=f"SonOfSETI: {nodes_ok}/{nodes_total} Nodes erreichbar.",
        metrics={
            "nodes_total": nodes_total,
            "nodes_ok": nodes_ok,
            "avg_modules": avg_modules,
            "latency_ms": dauer_ms,
        },
        fetched_at=fetched_at,
    )
