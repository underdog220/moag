"""
Aktion: oberon.llm.test — Kurzer LLM-Test-Call ueber Oberon DSGVO-Proxy.

Sendet einen minimalen Test-Prompt mit MINI-Profil an:
  POST /api/v2/dsgvo/proxy

Akzeptanz: Antwort enthaelt "pong" (oder aehnlich), status="completed".
Payload: response, duration_ms, model, provider (aus Oberon-Response).
"""
from __future__ import annotations

import asyncio
import logging
import os
import time
from datetime import datetime, timezone

import httpx

from moag.actions.registry import register
from moag.pipeline_hooks import plog
from moag.schemas import Action, ActionTriggerResponse

logger = logging.getLogger("moag.actions.oberon_llm_test")

_META = Action(
    action_id="oberon.llm.test",
    system_id="oberon",
    name="LLM-Test-Call",
    description=(
        "Sendet einen kurzen Test-Prompt ('Antworte mit pong') an Oberon "
        "DSGVO-Proxy (MINI-Profil) und misst Latenz und Antwort."
    ),
    category="diagnose",
    sub_area="llm",
    requires_confirm=False,
    is_destructive=False,
    estimated_duration_s=5,
    implemented=True,
)


def _get_oberon_base_url() -> str:
    return os.environ.get("MOAG_OBERON_BASE_URL", "http://192.168.200.169:17900")


def _get_oberon_token() -> str:
    return os.environ.get("MOAG_OBERON_TOKEN", "")


def _do_llm_test_sync() -> dict:
    """Synchroner HTTP-Call an Oberon DSGVO-Proxy (fuer run_in_executor)."""
    base_url = _get_oberon_base_url()
    token = _get_oberon_token()

    headers: dict[str, str] = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    payload = {
        "clientId": "moag",
        "profile": "MINI",
        "prompt": "Antworte mit 'pong'",
        "maxTokens": 10,
    }

    with httpx.Client(timeout=35.0) as client:
        resp = client.post(f"{base_url}/api/v2/dsgvo/proxy", json=payload, headers=headers)
        resp.raise_for_status()
        return resp.json()


@register(meta=_META)
async def handle_oberon_llm_test(body: dict) -> ActionTriggerResponse:
    """Fuehrt einen LLM-Test-Call ueber den Oberon DSGVO-Proxy durch."""
    triggered_at = datetime.now(timezone.utc)
    t0 = time.monotonic()

    plog.step(
        "actions.oberon.llm_test",
        "start",
        input={"body": body},
    )

    try:
        loop = asyncio.get_running_loop()
        data = await loop.run_in_executor(None, _do_llm_test_sync)
        duration_ms = int((time.monotonic() - t0) * 1000)

        response_text = data.get("response", "")
        model = data.get("model") or data.get("routingDecision") or "unbekannt"
        provider = data.get("provider") or "oberon"
        oberon_duration = data.get("durationMs", duration_ms)

        plog.step(
            "actions.oberon.llm_test",
            "completed",
            input={"body": body},
            output={"response_len": len(response_text), "duration_ms": oberon_duration},
            dauer_ms=duration_ms,
            ok=True,
        )

        return ActionTriggerResponse(
            action_id="oberon.llm.test",
            triggered_at=triggered_at,
            status="completed",
            result_summary=f"LLM antwortete in {oberon_duration}ms",
            payload={
                "response": response_text,
                "duration_ms": oberon_duration,
                "model": model,
                "provider": provider,
                "pii_found": data.get("piiFound", False),
            },
            duration_ms=duration_ms,
        )

    except httpx.HTTPStatusError as exc:
        duration_ms = int((time.monotonic() - t0) * 1000)
        logger.warning("oberon.llm.test: HTTP-Fehler %s: %s", exc.response.status_code, exc)
        plog.step(
            "actions.oberon.llm_test",
            "failed",
            input={"body": body},
            output={"status_code": exc.response.status_code, "error": str(exc)},
            dauer_ms=duration_ms,
            ok=False,
        )
        return ActionTriggerResponse(
            action_id="oberon.llm.test",
            triggered_at=triggered_at,
            status="failed",
            result_summary=f"Oberon DSGVO-Proxy HTTP {exc.response.status_code}.",
            payload={"status_code": exc.response.status_code},
            duration_ms=duration_ms,
            error=str(exc)[:300],
        )

    except (httpx.ConnectError, httpx.TimeoutException) as exc:
        duration_ms = int((time.monotonic() - t0) * 1000)
        logger.warning("oberon.llm.test: Verbindungsfehler: %s", exc)
        plog.step(
            "actions.oberon.llm_test",
            "failed",
            input={"body": body},
            output={"error": str(exc)},
            dauer_ms=duration_ms,
            ok=False,
        )
        return ActionTriggerResponse(
            action_id="oberon.llm.test",
            triggered_at=triggered_at,
            status="failed",
            result_summary="Oberon nicht erreichbar.",
            payload={},
            duration_ms=duration_ms,
            error=str(exc)[:300],
        )

    except Exception as exc:
        duration_ms = int((time.monotonic() - t0) * 1000)
        logger.exception("oberon.llm.test: unerwarteter Fehler: %s", exc)
        plog.step(
            "actions.oberon.llm_test",
            "failed",
            input={"body": body},
            output={"error": str(exc)},
            dauer_ms=duration_ms,
            ok=False,
        )
        return ActionTriggerResponse(
            action_id="oberon.llm.test",
            triggered_at=triggered_at,
            status="failed",
            result_summary="LLM-Test: unerwarteter Fehler.",
            payload={},
            duration_ms=duration_ms,
            error=str(exc)[:300],
        )
