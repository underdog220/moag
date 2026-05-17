"""
Aktion: octoboss.ollama.pull — Ollama-Modell auf OctoBoss-Cluster laden.

POST /seti/models/pull am OctoBoss-Hub.
Default-Modell: llama3.2:3b — kann via Body uebersteuert werden.

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

logger = logging.getLogger("moag.actions.octoboss_ollama_pull")

_DEFAULT_BASE = "http://192.168.200.71:18765"
_DEFAULT_MODEL = "llama3.2:3b"

_META = Action(
    action_id="octoboss.ollama.pull",
    system_id="octoboss",
    name="Ollama-Modell laden",
    description=(
        "Zieht ein Ollama-Modell auf den OctoBoss-Cluster (Standard: llama3.2:3b). "
        "Kann je nach Modellgroesse mehrere Minuten dauern. "
        "Modell-Tag kann via Body uebersteuert werden."
    ),
    category="operation",
    sub_area="llm",
    requires_confirm=False,
    is_destructive=False,
    estimated_duration_s=120,
    implemented=True,
)


@register(meta=_META)
async def handle_octoboss_ollama_pull(body: dict) -> ActionTriggerResponse:
    """
    Schickt POST /seti/models/pull an den OctoBoss-Hub.

    Optionaler Body:
      {
        "model_tag": "llama3.2:3b",     // optional — Default: llama3.2:3b
        "target_node_id": "<node-id>"   // optional — Hub waehlt sonst selbst
      }

    Ergebnis: status="started" mit Pull-Status aus der Hub-Antwort.
    """
    triggered_at = datetime.now(timezone.utc)
    t0 = time.monotonic()

    base_url = os.environ.get("MOAG_OCTOBOSS_BASE_URL", _DEFAULT_BASE).rstrip("/")
    token = os.environ.get("MOAG_API_TOKEN", "")

    headers: dict[str, str] = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
        headers["X-DevLoop-Token"] = token

    model_tag: str = body.get("model_tag") or _DEFAULT_MODEL
    target_node_id: str | None = body.get("target_node_id") or None

    payload: dict = {"model_tag": model_tag}
    if target_node_id:
        payload["target_node_id"] = target_node_id

    plog.step(
        "actions.octoboss.ollama.pull",
        "start",
        input={"url": base_url, "model_tag": model_tag, "node": target_node_id},
    )

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(
                f"{base_url}/seti/models/pull",
                headers=headers,
                json=payload,
            )
            duration_ms = int((time.monotonic() - t0) * 1000)

            if not resp.is_success:
                plog.step(
                    "actions.octoboss.ollama.pull",
                    "failed",
                    input={"url": base_url, "model_tag": model_tag},
                    output={"status_code": resp.status_code, "body": resp.text[:200]},
                    dauer_ms=duration_ms,
                    ok=False,
                )
                return ActionTriggerResponse(
                    action_id="octoboss.ollama.pull",
                    triggered_at=triggered_at,
                    status="failed",
                    result_summary=f"OctoBoss /seti/models/pull antwortete HTTP {resp.status_code}.",
                    payload={"status_code": resp.status_code},
                    duration_ms=duration_ms,
                    error=f"HTTP {resp.status_code}: {resp.text[:300]}",
                )

            data: dict = {}
            if resp.headers.get("content-type", "").startswith("application/json"):
                try:
                    data = resp.json()
                except Exception:
                    data = {}

            pull_status: str = data.get("status") or data.get("pull_status") or "initiated"
            pull_nodes = data.get("nodes") or data.get("targets") or (
                [target_node_id] if target_node_id else []
            )

            parts = [f"Pull gestartet: {model_tag}"]
            if pull_nodes:
                nodes_str = ", ".join(str(n) for n in pull_nodes[:3])
                parts.append(f"Nodes: {nodes_str}")
            parts.append(f"Pull-Status: {pull_status}")

            plog.step(
                "actions.octoboss.ollama.pull",
                "started",
                input={"url": base_url, "model_tag": model_tag},
                output={"pull_status": pull_status, "nodes": pull_nodes},
                dauer_ms=duration_ms,
                ok=True,
            )

            return ActionTriggerResponse(
                action_id="octoboss.ollama.pull",
                triggered_at=triggered_at,
                status="started",
                result_summary=" · ".join(parts),
                payload={
                    "model_tag": model_tag,
                    "pull_status": pull_status,
                    "nodes": pull_nodes,
                    "raw": data,
                },
                duration_ms=duration_ms,
            )

    except httpx.TimeoutException as exc:
        duration_ms = int((time.monotonic() - t0) * 1000)
        logger.warning("octoboss.ollama.pull: Timeout: %s", exc)
        plog.step(
            "actions.octoboss.ollama.pull",
            "failed",
            input={"url": base_url, "model_tag": model_tag},
            output={"error": "timeout"},
            dauer_ms=duration_ms,
            ok=False,
        )
        return ActionTriggerResponse(
            action_id="octoboss.ollama.pull",
            triggered_at=triggered_at,
            status="failed",
            result_summary="OctoBoss nicht erreichbar (Timeout).",
            payload={},
            duration_ms=duration_ms,
            error=f"Timeout nach 20s: {exc}",
        )

    except (httpx.ConnectError, httpx.HTTPError) as exc:
        duration_ms = int((time.monotonic() - t0) * 1000)
        logger.warning("octoboss.ollama.pull: Verbindungsfehler: %s", exc)
        plog.step(
            "actions.octoboss.ollama.pull",
            "failed",
            input={"url": base_url, "model_tag": model_tag},
            output={"error": str(exc)},
            dauer_ms=duration_ms,
            ok=False,
        )
        return ActionTriggerResponse(
            action_id="octoboss.ollama.pull",
            triggered_at=triggered_at,
            status="failed",
            result_summary="OctoBoss nicht erreichbar.",
            payload={},
            duration_ms=duration_ms,
            error=str(exc)[:300],
        )

    except Exception as exc:
        duration_ms = int((time.monotonic() - t0) * 1000)
        logger.exception("octoboss.ollama.pull: unerwarteter Fehler: %s", exc)
        plog.step(
            "actions.octoboss.ollama.pull",
            "failed",
            input={"url": base_url, "model_tag": model_tag},
            output={"error": str(exc)},
            dauer_ms=duration_ms,
            ok=False,
        )
        return ActionTriggerResponse(
            action_id="octoboss.ollama.pull",
            triggered_at=triggered_at,
            status="failed",
            result_summary="Ollama-Pull: unerwarteter Fehler.",
            payload={},
            duration_ms=duration_ms,
            error=str(exc)[:300],
        )
