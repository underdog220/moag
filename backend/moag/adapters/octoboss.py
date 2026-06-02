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

            # Cluster-Status mit ehrlicher Score-Formel.
            # Connected allein reicht nicht — wir bewerten zusaetzlich, ob Ollama laeuft,
            # ob Hardware-Telemetrie ueberhaupt ankommt und ob die Mode IDLE/ACTIVE ist.
            nodes_total = 0
            nodes_connected = 0
            nodes_ollama_running = 0
            nodes_hardware_present = 0
            nodes_mode_ok = 0
            try:
                resp_nodes = await client.get(f"{base}/seti/nodes", headers=headers)
                if resp_nodes.is_success:
                    data = resp_nodes.json()
                    nodes_list = data if isinstance(data, list) else data.get("nodes", [])
                    nodes_total = len(nodes_list)
                    for n in nodes_list:
                        if n.get("connected") or n.get("online"):
                            nodes_connected += 1
                        ollama = n.get("ollama") or {}
                        if ollama.get("running"):
                            nodes_ollama_running += 1
                        # hardware_direct bevorzugen (HwDirectPullPoller liefert echte Werte);
                        # Fallback auf hardware (Heartbeat, gpu_load/cpu_load dort null).
                        hw_direct = n.get("hardware_direct") or {}
                        hw_hb = n.get("hardware") or {}
                        hw = hw_direct if hw_direct else hw_hb
                        # Hardware-Telemetrie "kommt an" wenn mindestens 1 Feld populiert ist
                        if hw.get("gpu_name") or hw.get("gpu_load_percent") is not None \
                                or hw.get("cpu_load_percent") is not None \
                                or hw.get("ram_free_gb") is not None:
                            nodes_hardware_present += 1
                        mode = (n.get("mode") or "").upper()
                        if mode in ("IDLE", "ACTIVE"):
                            nodes_mode_ok += 1
            except Exception as e:
                logger.debug("OctoBoss /seti/nodes fehlgeschlagen: %s", e)

            dauer_ms = int((time.monotonic() - t0) * 1000)
            plog.step(
                "octoboss.adapter", "nodes",
                input={"url": base},
                output={
                    "nodes_total": nodes_total, "connected": nodes_connected,
                    "ollama": nodes_ollama_running, "hardware": nodes_hardware_present,
                    "mode_ok": nodes_mode_ok,
                },
                dauer_ms=dauer_ms, ok=True,
            )

            # Gewichteter Score: 40% connected + 30% ollama + 20% hardware + 10% mode-ok
            if nodes_total == 0:
                score = 30
                summary = "OctoBoss erreichbar, aber keine Nodes registriert."
            else:
                q_connected = nodes_connected / nodes_total
                q_ollama    = nodes_ollama_running / nodes_total
                q_hardware  = nodes_hardware_present / nodes_total
                q_mode      = nodes_mode_ok / nodes_total
                score = int(round(100 * (0.40 * q_connected + 0.30 * q_ollama
                                          + 0.20 * q_hardware + 0.10 * q_mode)))
                summary = (
                    f"OctoBoss: {nodes_connected}/{nodes_total} connected · "
                    f"{nodes_ollama_running}/{nodes_total} Ollama · "
                    f"{nodes_hardware_present}/{nodes_total} HW-Telemetrie · "
                    f"{nodes_mode_ok}/{nodes_total} Mode IDLE/ACTIVE"
                )

            return SystemStatus(
                system_id="octoboss",
                ok=score >= 40,
                score=score,
                summary=summary,
                metrics={
                    "nodes_total": nodes_total,
                    "nodes_connected": nodes_connected,
                    "nodes_ollama_running": nodes_ollama_running,
                    "nodes_hardware_present": nodes_hardware_present,
                    "nodes_mode_ok": nodes_mode_ok,
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
