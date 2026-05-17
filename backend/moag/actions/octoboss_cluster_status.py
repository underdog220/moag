"""
Aktion: octoboss.cluster.status — Cluster-Status von OctoBoss abrufen.

GET /admin/cluster/status auf der OctoBoss-Hub-URL.
Mappt mode + epoch + primary_id zu summary + payload.

ENV: MOAG_OCTOBOSS_BASE_URL (Default: http://192.168.200.71:18765)
     MOAG_API_TOKEN (optionaler Bearer-Token)
"""
from __future__ import annotations

import logging
import os
import time
from datetime import datetime, timezone

import httpx

from moag.actions.registry import register
from moag.pipeline_hooks import plog
from moag.schemas import Action, ActionTriggerResponse

logger = logging.getLogger("moag.actions.octoboss_cluster_status")

_DEFAULT_BASE = "http://192.168.200.71:18765"

_META = Action(
    action_id="octoboss.cluster.status",
    system_id="octoboss",
    name="Cluster-Status abrufen",
    description=(
        "Ruft OctoBoss /admin/cluster/status auf und liefert den aktuellen "
        "Cluster-Modus, Epoch und Primary-Node-ID."
    ),
    category="diagnose",
    sub_area="cluster",
    requires_confirm=False,
    is_destructive=False,
    estimated_duration_s=3,
    implemented=True,
)


@register(meta=_META)
async def handle_octoboss_cluster_status(body: dict) -> ActionTriggerResponse:
    """Fragt OctoBoss /admin/cluster/status und liefert ActionTriggerResponse."""
    triggered_at = datetime.now(timezone.utc)
    t0 = time.monotonic()

    base_url = os.environ.get("MOAG_OCTOBOSS_BASE_URL", _DEFAULT_BASE).rstrip("/")
    token = os.environ.get("MOAG_API_TOKEN", "")

    headers: dict[str, str] = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
        headers["X-DevLoop-Token"] = token

    plog.step(
        "actions.octoboss.cluster.status",
        "start",
        input={"url": base_url, "body": body},
    )

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(
                f"{base_url}/admin/cluster/status",
                headers=headers,
            )
            duration_ms = int((time.monotonic() - t0) * 1000)

            if not resp.is_success:
                plog.step(
                    "actions.octoboss.cluster.status",
                    "failed",
                    input={"url": base_url},
                    output={"status_code": resp.status_code},
                    dauer_ms=duration_ms,
                    ok=False,
                )
                return ActionTriggerResponse(
                    action_id="octoboss.cluster.status",
                    triggered_at=triggered_at,
                    status="failed",
                    result_summary=f"OctoBoss Cluster-Status antwortete HTTP {resp.status_code}.",
                    payload={"status_code": resp.status_code},
                    duration_ms=duration_ms,
                    error=f"HTTP {resp.status_code}: {resp.text[:200]}",
                )

            data = resp.json()
            mode = data.get("mode", "unknown")
            epoch = data.get("epoch")
            primary_id = data.get("primary_id") or data.get("primaryId") or data.get("primary")
            nodes_count = data.get("nodes_count") or data.get("nodesCount")
            if nodes_count is None:
                # Fallback: Laenge der nodes-Liste
                nodes = data.get("nodes") or []
                nodes_count = len(nodes) if isinstance(nodes, list) else None

            parts = [f"OctoBoss Cluster: Modus {mode}"]
            if epoch is not None:
                parts.append(f"Epoch {epoch}")
            if primary_id:
                parts.append(f"Primary {primary_id}")
            if nodes_count is not None:
                parts.append(f"{nodes_count} Node(s)")
            summary = " · ".join(parts)

            plog.step(
                "actions.octoboss.cluster.status",
                "completed",
                input={"url": base_url},
                output={"mode": mode, "epoch": epoch, "primary_id": primary_id},
                dauer_ms=duration_ms,
                ok=True,
            )

            return ActionTriggerResponse(
                action_id="octoboss.cluster.status",
                triggered_at=triggered_at,
                status="completed",
                result_summary=summary,
                payload={
                    "mode": mode,
                    "epoch": epoch,
                    "primary_id": primary_id,
                    "nodes_count": nodes_count,
                    "raw": data,
                },
                duration_ms=duration_ms,
            )

    except httpx.TimeoutException as exc:
        duration_ms = int((time.monotonic() - t0) * 1000)
        logger.warning("octoboss.cluster.status: Timeout: %s", exc)
        plog.step(
            "actions.octoboss.cluster.status",
            "failed",
            input={"url": base_url},
            output={"error": "timeout"},
            dauer_ms=duration_ms,
            ok=False,
        )
        return ActionTriggerResponse(
            action_id="octoboss.cluster.status",
            triggered_at=triggered_at,
            status="failed",
            result_summary="OctoBoss nicht erreichbar (Timeout).",
            payload={},
            duration_ms=duration_ms,
            error=f"Timeout nach 8s: {exc}",
        )

    except (httpx.ConnectError, httpx.HTTPError) as exc:
        duration_ms = int((time.monotonic() - t0) * 1000)
        logger.warning("octoboss.cluster.status: Verbindungsfehler: %s", exc)
        plog.step(
            "actions.octoboss.cluster.status",
            "failed",
            input={"url": base_url},
            output={"error": str(exc)},
            dauer_ms=duration_ms,
            ok=False,
        )
        return ActionTriggerResponse(
            action_id="octoboss.cluster.status",
            triggered_at=triggered_at,
            status="failed",
            result_summary="OctoBoss nicht erreichbar.",
            payload={},
            duration_ms=duration_ms,
            error=str(exc)[:300],
        )

    except Exception as exc:
        duration_ms = int((time.monotonic() - t0) * 1000)
        logger.exception("octoboss.cluster.status: unerwarteter Fehler: %s", exc)
        plog.step(
            "actions.octoboss.cluster.status",
            "failed",
            input={"url": base_url},
            output={"error": str(exc)},
            dauer_ms=duration_ms,
            ok=False,
        )
        return ActionTriggerResponse(
            action_id="octoboss.cluster.status",
            triggered_at=triggered_at,
            status="failed",
            result_summary="OctoBoss Cluster-Status: unerwarteter Fehler.",
            payload={},
            duration_ms=duration_ms,
            error=str(exc)[:300],
        )
