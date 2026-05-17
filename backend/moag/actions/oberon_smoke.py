"""
Aktion: oberon.smoke — DSGVO-Smoke-Test ausfuehren.

Nutzt den existierenden CockpitClient (moag/clients/oberon_cockpit_client.py),
kein eigener HTTP-Code. ENV-Variablen: MOAG_OBERON_BASE_URL, MOAG_OBERON_TOKEN.

Liefert completed + summary-Satz + payload mit den Smoke-Feldern.
"""
from __future__ import annotations

import asyncio
import logging
import os
import time
from datetime import datetime, timezone

from moag.actions.registry import register
from moag.clients.oberon_cockpit_client import (
    CockpitClient,
    CockpitError,
    CockpitUnavailable,
)
from moag.pipeline_hooks import plog
from moag.schemas import Action, ActionTriggerResponse

logger = logging.getLogger("moag.actions.oberon_smoke")

_META = Action(
    action_id="oberon.smoke",
    system_id="oberon",
    name="DSGVO-Smoke ausfuehren",
    description=(
        "Triggert den Oberon-Cockpit-Smoke (6 Sub-Checks: DSGVO, PII, NER, "
        "OctoBoss, Postgres, Local-LLM). Liefert Verdict PASS / WARN / FAIL."
    ),
    category="diagnose",
    sub_area="smoke",
    requires_confirm=False,
    is_destructive=False,
    estimated_duration_s=5,
    implemented=True,
)


def _get_client() -> CockpitClient:
    """Erzeugt einen CockpitClient aus ENV-Variablen (kein neuer Settings-Lookup)."""
    base_url = os.environ.get("MOAG_OBERON_BASE_URL", "http://192.168.200.169:17900")
    token = os.environ.get("MOAG_OBERON_TOKEN", "")
    return CockpitClient(base_url=base_url, token=token, timeout_s=10.0)


@register(meta=_META)
async def handle_oberon_smoke(body: dict) -> ActionTriggerResponse:
    """Ruft Oberon-Cockpit-Smoke-Endpoint auf und mappt das Ergebnis."""
    triggered_at = datetime.now(timezone.utc)
    t0 = time.monotonic()

    plog.step(
        "actions.oberon.smoke",
        "start",
        input={"body": body},
    )

    def _fetch_sync():
        client = _get_client()
        with client:
            return client.get_smoke()

    try:
        loop = asyncio.get_running_loop()
        smoke = await loop.run_in_executor(None, _fetch_sync)
        duration_ms = int((time.monotonic() - t0) * 1000)

        verdict = smoke.summary.verdict
        total = smoke.summary.total or 1
        pass_ = smoke.summary.pass_
        warn = smoke.summary.warn
        fail = smoke.summary.fail

        summary = (
            f"Oberon Smoke {verdict}: "
            f"{pass_} PASS, {warn} WARN, {fail} FAIL von {total} Checks"
        )

        # Alle Check-Details fuer payload sammeln (Schema: SmokeCheck.suites)
        checks_payload = []
        for check in smoke.suites:
            checks_payload.append({
                "name": check.name,
                "status": check.status,
                "error": check.error,
                "latency_ms": check.latency_ms,
            })

        plog.step(
            "actions.oberon.smoke",
            "completed",
            input={"body": body},
            output={"verdict": verdict, "pass": pass_, "warn": warn, "fail": fail},
            dauer_ms=duration_ms,
            ok=True,
        )

        return ActionTriggerResponse(
            action_id="oberon.smoke",
            triggered_at=triggered_at,
            status="completed",
            result_summary=summary,
            payload={
                "verdict": verdict,
                "pass": pass_,
                "warn": warn,
                "fail": fail,
                "total": total,
                "checks": checks_payload,
            },
            duration_ms=duration_ms,
        )

    except CockpitUnavailable as exc:
        duration_ms = int((time.monotonic() - t0) * 1000)
        logger.warning("oberon.smoke: Oberon nicht erreichbar: %s", exc)
        plog.step(
            "actions.oberon.smoke",
            "failed",
            input={"body": body},
            output={"error": str(exc)},
            dauer_ms=duration_ms,
            ok=False,
        )
        return ActionTriggerResponse(
            action_id="oberon.smoke",
            triggered_at=triggered_at,
            status="failed",
            result_summary="Oberon nicht erreichbar.",
            payload={},
            duration_ms=duration_ms,
            error=str(exc)[:300],
        )

    except CockpitError as exc:
        duration_ms = int((time.monotonic() - t0) * 1000)
        logger.warning("oberon.smoke: Cockpit-Fehler HTTP %s: %s", exc.status_code, exc)
        plog.step(
            "actions.oberon.smoke",
            "failed",
            input={"body": body},
            output={"error": str(exc), "status_code": exc.status_code},
            dauer_ms=duration_ms,
            ok=False,
        )
        return ActionTriggerResponse(
            action_id="oberon.smoke",
            triggered_at=triggered_at,
            status="failed",
            result_summary=f"Oberon Cockpit-Fehler HTTP {exc.status_code}.",
            payload={"status_code": exc.status_code},
            duration_ms=duration_ms,
            error=str(exc)[:300],
        )

    except Exception as exc:
        duration_ms = int((time.monotonic() - t0) * 1000)
        logger.exception("oberon.smoke: unerwarteter Fehler: %s", exc)
        plog.step(
            "actions.oberon.smoke",
            "failed",
            input={"body": body},
            output={"error": str(exc)},
            dauer_ms=duration_ms,
            ok=False,
        )
        return ActionTriggerResponse(
            action_id="oberon.smoke",
            triggered_at=triggered_at,
            status="failed",
            result_summary="Oberon Smoke: unerwarteter Fehler.",
            payload={},
            duration_ms=duration_ms,
            error=str(exc)[:300],
        )
