"""
Aktion: custos.rules.run — Compliance-Regeln ausfuehren.

Ruft Custos POST /api/engine/run-once auf.
Optionaler Body: {"rule_id": "..."} — wird von Custos ignoriert (run-once laeuft immer
alle aktiven Regeln), ist aber als Filter-Hinweis im payload dokumentiert.

Ergebnis: status="completed", summary mit Findings-Zaehlung.
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

logger = logging.getLogger("moag.actions.custos_rules_run")

_META = Action(
    action_id="custos.rules.run",
    system_id="custos",
    name="Compliance-Regeln ausfuehren",
    description=(
        "Fuehrt alle aktiven Custos-Compliance-Regeln gegen den aktuellen "
        "System-Zustand aus und liefert neue Findings."
    ),
    category="diagnose",
    sub_area="rules",
    requires_confirm=False,
    is_destructive=False,
    estimated_duration_s=10,
    implemented=True,
)


def _custos_base() -> str:
    raw = os.environ.get("MOAG_CUSTOS_BASE_URL", "").strip()
    return raw.rstrip("/") if raw else "http://192.168.200.71:17890"


@register(meta=_META)
async def handle_custos_rules_run(body: dict) -> ActionTriggerResponse:
    """Triggert POST /api/engine/run-once auf Custos."""
    triggered_at = datetime.now(timezone.utc)
    t0 = time.monotonic()
    rule_id: str | None = body.get("rule_id") if body else None

    plog.step(
        "actions.custos.rules_run",
        "start",
        input={"rule_id": rule_id},
    )

    base = _custos_base()
    url = f"{base}/api/engine/run-once"

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url)

        duration_ms = int((time.monotonic() - t0) * 1000)

        if not resp.is_success:
            plog.step(
                "actions.custos.rules_run",
                "failed",
                input={"url": url},
                output={"status_code": resp.status_code},
                dauer_ms=duration_ms,
                ok=False,
            )
            return ActionTriggerResponse(
                action_id="custos.rules.run",
                triggered_at=triggered_at,
                status="failed",
                result_summary=f"Custos Engine-Lauf fehlgeschlagen: HTTP {resp.status_code}.",
                payload={"status_code": resp.status_code},
                duration_ms=duration_ms,
                error=f"HTTP {resp.status_code}",
            )

        report = resp.json()

        # Custos run-once liefert ein report-Dict.
        # Bekannte Felder aus runner.py: neue, geaenderte, unveraenderte Findings.
        neue = report.get("neue", 0)
        geaendert = report.get("geaendert", 0)
        unveraendert = report.get("unveraendert", 0)
        gesamt = neue + geaendert + unveraendert
        regeln_count = report.get("regeln_gelaufen", report.get("count_aktiv", "?"))

        summary = (
            f"Engine-Lauf: {gesamt} Findings "
            f"({neue} neu · {geaendert} geaendert · {unveraendert} unveraendert)"
        )
        if rule_id:
            summary = f"[Regel {rule_id}] " + summary

        plog.step(
            "actions.custos.rules_run",
            "completed",
            input={"url": url, "rule_id": rule_id},
            output={"neue": neue, "geaendert": geaendert, "unveraendert": unveraendert},
            dauer_ms=duration_ms,
            ok=True,
        )

        return ActionTriggerResponse(
            action_id="custos.rules.run",
            triggered_at=triggered_at,
            status="completed",
            result_summary=summary,
            payload={
                "neue": neue,
                "geaendert": geaendert,
                "unveraendert": unveraendert,
                "gesamt": gesamt,
                "regeln_gelaufen": regeln_count,
                "rule_id_filter": rule_id,
                "raw": report,
            },
            duration_ms=duration_ms,
        )

    except httpx.TimeoutException:
        duration_ms = int((time.monotonic() - t0) * 1000)
        logger.warning("custos.rules.run: Timeout nach 30s")
        plog.step(
            "actions.custos.rules_run",
            "failed",
            input={"url": url},
            output={"error": "Timeout 30s"},
            dauer_ms=duration_ms,
            ok=False,
        )
        return ActionTriggerResponse(
            action_id="custos.rules.run",
            triggered_at=triggered_at,
            status="failed",
            result_summary="Custos Engine-Lauf: Timeout (30s).",
            payload={},
            duration_ms=duration_ms,
            error="Timeout nach 30s",
        )

    except Exception as exc:
        duration_ms = int((time.monotonic() - t0) * 1000)
        logger.exception("custos.rules.run: unerwarteter Fehler: %s", exc)
        plog.step(
            "actions.custos.rules_run",
            "failed",
            input={"url": url},
            output={"error": str(exc)},
            dauer_ms=duration_ms,
            ok=False,
        )
        return ActionTriggerResponse(
            action_id="custos.rules.run",
            triggered_at=triggered_at,
            status="failed",
            result_summary="Custos Engine-Lauf: unerwarteter Fehler.",
            payload={},
            duration_ms=duration_ms,
            error=str(exc)[:300],
        )
