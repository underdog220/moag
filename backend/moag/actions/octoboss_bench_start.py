"""
Aktion: octoboss.bench.start — Mini-LLM-Benchmark auf OctoBoss-Cluster starten.

POST /jobs/submit am OctoBoss-Hub mit workload_type="llm_inference".
Liefert job_id + target_node_id zurueck. Status kann via GET /jobs/{id} gepollt werden.

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

logger = logging.getLogger("moag.actions.octoboss_bench_start")

_DEFAULT_BASE = "http://192.168.200.71:18765"

_META = Action(
    action_id="octoboss.bench.start",
    system_id="octoboss",
    name="Benchmark starten",
    description=(
        "Startet einen kurzen LLM-Inference-Benchmark auf dem OctoBoss-Cluster. "
        "Ein kurzer Test-Prompt wird an eine Node geschickt. "
        "Status kann via /jobs/{id} gepollt werden."
    ),
    category="operation",
    sub_area="bench",
    requires_confirm=False,
    is_destructive=False,
    estimated_duration_s=30,
    implemented=True,
)


@register(meta=_META)
async def handle_octoboss_bench_start(body: dict) -> ActionTriggerResponse:
    """
    Schickt einen LLM-Inference-Job an OctoBoss via POST /jobs/submit.

    Optionaler Body:
      {
        "target_node_id": "<node-id>",   // optional — Hub waehlt sonst selbst
        "prompt": "<test-prompt>"        // optional — Default: kurzer Standardprompt
      }

    Ergebnis: job_id + target_node_id; Status via /jobs/{job_id} pollen.
    """
    triggered_at = datetime.now(timezone.utc)
    t0 = time.monotonic()

    base_url = os.environ.get("MOAG_OCTOBOSS_BASE_URL", _DEFAULT_BASE).rstrip("/")
    token = os.environ.get("MOAG_API_TOKEN", "")

    headers: dict[str, str] = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
        headers["X-DevLoop-Token"] = token

    # Payload — Hub entscheidet selbst welche Node, wenn keine angegeben.
    # OctoBoss /jobs/submit erwartet nested: {"workload": {"workload_type": ..., "params": {...}}, ...}
    target_node_id: str | None = body.get("target_node_id") or None
    prompt: str = body.get("prompt") or "Antworte in einem Satz: Was ist 2+2?"

    workload_params: dict = {
        "prompt": prompt,
        "model": "tinyllama",
    }
    payload: dict = {
        "workload": {
            "workload_type": "llm_inference",
            "params": workload_params,
        },
        "priority": 0,
        "timeout_s": 120,
    }
    if target_node_id:
        payload["workload"]["params"]["target_node_id"] = target_node_id

    plog.step(
        "actions.octoboss.bench.start",
        "start",
        input={"url": base_url, "payload": payload},
    )

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                f"{base_url}/jobs/submit",
                headers=headers,
                json=payload,
            )
            duration_ms = int((time.monotonic() - t0) * 1000)

            if not resp.is_success:
                plog.step(
                    "actions.octoboss.bench.start",
                    "failed",
                    input={"url": base_url},
                    output={"status_code": resp.status_code, "body": resp.text[:200]},
                    dauer_ms=duration_ms,
                    ok=False,
                )
                return ActionTriggerResponse(
                    action_id="octoboss.bench.start",
                    triggered_at=triggered_at,
                    status="failed",
                    result_summary=f"OctoBoss /jobs/submit antwortete HTTP {resp.status_code}.",
                    payload={"status_code": resp.status_code},
                    duration_ms=duration_ms,
                    error=f"HTTP {resp.status_code}: {resp.text[:300]}",
                )

            data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
            job_id: str | None = (
                data.get("job_id")
                or data.get("id")
                or data.get("jobId")
            )
            returned_node: str | None = (
                data.get("target_node_id")
                or data.get("node_id")
                or target_node_id
            )

            parts = ["Benchmark gestartet"]
            if job_id:
                parts.append(f"Job-ID {job_id}")
            if returned_node:
                parts.append(f"Node {returned_node}")
            parts.append(f"Status via /jobs/{job_id or '?'} pollen")
            summary = " · ".join(parts)

            plog.step(
                "actions.octoboss.bench.start",
                "started",
                input={"url": base_url},
                output={"job_id": job_id, "node": returned_node},
                dauer_ms=duration_ms,
                ok=True,
            )

            return ActionTriggerResponse(
                action_id="octoboss.bench.start",
                triggered_at=triggered_at,
                status="started",
                result_summary=summary,
                payload={
                    "job_id": job_id,
                    "target_node_id": returned_node,
                    "poll_url": f"{base_url}/jobs/{job_id}" if job_id else None,
                    "raw": data,
                },
                duration_ms=duration_ms,
            )

    except httpx.TimeoutException as exc:
        duration_ms = int((time.monotonic() - t0) * 1000)
        logger.warning("octoboss.bench.start: Timeout: %s", exc)
        plog.step(
            "actions.octoboss.bench.start",
            "failed",
            input={"url": base_url},
            output={"error": "timeout"},
            dauer_ms=duration_ms,
            ok=False,
        )
        return ActionTriggerResponse(
            action_id="octoboss.bench.start",
            triggered_at=triggered_at,
            status="failed",
            result_summary="OctoBoss nicht erreichbar (Timeout).",
            payload={},
            duration_ms=duration_ms,
            error=f"Timeout nach 15s (HTTP-Call): {exc}",
        )

    except (httpx.ConnectError, httpx.HTTPError) as exc:
        duration_ms = int((time.monotonic() - t0) * 1000)
        logger.warning("octoboss.bench.start: Verbindungsfehler: %s", exc)
        plog.step(
            "actions.octoboss.bench.start",
            "failed",
            input={"url": base_url},
            output={"error": str(exc)},
            dauer_ms=duration_ms,
            ok=False,
        )
        return ActionTriggerResponse(
            action_id="octoboss.bench.start",
            triggered_at=triggered_at,
            status="failed",
            result_summary="OctoBoss nicht erreichbar.",
            payload={},
            duration_ms=duration_ms,
            error=str(exc)[:300],
        )

    except Exception as exc:
        duration_ms = int((time.monotonic() - t0) * 1000)
        logger.exception("octoboss.bench.start: unerwarteter Fehler: %s", exc)
        plog.step(
            "actions.octoboss.bench.start",
            "failed",
            input={"url": base_url},
            output={"error": str(exc)},
            dauer_ms=duration_ms,
            ok=False,
        )
        return ActionTriggerResponse(
            action_id="octoboss.bench.start",
            triggered_at=triggered_at,
            status="failed",
            result_summary="Benchmark: unerwarteter Fehler.",
            payload={},
            duration_ms=duration_ms,
            error=str(exc)[:300],
        )
