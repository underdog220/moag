"""
Aktion: oberon.dsgvo.check — DSGVO-Engine-Status abrufen.

Ruft GET /api/v2/dsgvo/status auf Oberon ab und liefert den Status
der DSGVO-Engine (aktiviert, Fail-Safe-Modus, PII-Scanner-Status).
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

logger = logging.getLogger("moag.actions.oberon_dsgvo_check")

_META = Action(
    action_id="oberon.dsgvo.check",
    system_id="oberon",
    name="DSGVO-Vollcheck",
    description=(
        "Ruft den Oberon-DSGVO-Engine-Status ab: aktiviert, Fail-Safe-Modus, "
        "PII-Scanner-Bereitschaft und letzte Audit-Aktivitaet."
    ),
    category="diagnose",
    sub_area="dsgvo",
    requires_confirm=False,
    is_destructive=False,
    estimated_duration_s=3,
    implemented=True,
)


def _get_oberon_base_url() -> str:
    return os.environ.get("MOAG_OBERON_BASE_URL", "http://192.168.200.169:17900")


def _get_oberon_token() -> str:
    return os.environ.get("MOAG_OBERON_TOKEN", "")


def _do_dsgvo_status_sync() -> dict:
    """Synchroner HTTP-Call an Oberon DSGVO-Status-Endpoint."""
    base_url = _get_oberon_base_url()
    token = _get_oberon_token()

    headers: dict[str, str] = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    with httpx.Client(timeout=10.0) as client:
        resp = client.get(f"{base_url}/api/v2/dsgvo/status", headers=headers)
        resp.raise_for_status()
        return resp.json()


@register(meta=_META)
async def handle_oberon_dsgvo_check(body: dict) -> ActionTriggerResponse:
    """Ruft den DSGVO-Engine-Status von Oberon ab."""
    triggered_at = datetime.now(timezone.utc)
    t0 = time.monotonic()

    plog.step(
        "actions.oberon.dsgvo_check",
        "start",
        input={"body": body},
    )

    try:
        loop = asyncio.get_running_loop()
        data = await loop.run_in_executor(None, _do_dsgvo_status_sync)
        duration_ms = int((time.monotonic() - t0) * 1000)

        # DSGVO-Status-Felder (Oberon-spezifisch — flexible Extraktion)
        enabled = data.get("enabled", data.get("dsgvoEnabled", data.get("active", False)))
        fail_safe = data.get("failSafeMode", data.get("fail_safe_mode", data.get("mode", "unbekannt")))
        pii_scanner = data.get("piiScannerReady", data.get("pii_scanner_ready", True))
        audit_active = data.get("auditActive", data.get("audit_active", True))

        # Lesbarerer Fail-Safe-Wert
        mode_str = str(fail_safe) if fail_safe else "unbekannt"

        summary = f"DSGVO aktiv: {enabled} · Fail-Safe: {mode_str}"

        plog.step(
            "actions.oberon.dsgvo_check",
            "completed",
            input={"body": body},
            output={"enabled": enabled, "fail_safe": mode_str},
            dauer_ms=duration_ms,
            ok=True,
        )

        return ActionTriggerResponse(
            action_id="oberon.dsgvo.check",
            triggered_at=triggered_at,
            status="completed",
            result_summary=summary,
            payload={
                "enabled": enabled,
                "fail_safe_mode": mode_str,
                "pii_scanner_ready": pii_scanner,
                "audit_active": audit_active,
                "raw": data,
            },
            duration_ms=duration_ms,
        )

    except httpx.HTTPStatusError as exc:
        duration_ms = int((time.monotonic() - t0) * 1000)
        logger.warning("oberon.dsgvo.check: HTTP-Fehler %s: %s", exc.response.status_code, exc)
        plog.step(
            "actions.oberon.dsgvo_check",
            "failed",
            input={"body": body},
            output={"status_code": exc.response.status_code},
            dauer_ms=duration_ms,
            ok=False,
        )
        return ActionTriggerResponse(
            action_id="oberon.dsgvo.check",
            triggered_at=triggered_at,
            status="failed",
            result_summary=f"Oberon DSGVO-Status HTTP {exc.response.status_code}.",
            payload={"status_code": exc.response.status_code},
            duration_ms=duration_ms,
            error=str(exc)[:300],
        )

    except (httpx.ConnectError, httpx.TimeoutException) as exc:
        duration_ms = int((time.monotonic() - t0) * 1000)
        logger.warning("oberon.dsgvo.check: Verbindungsfehler: %s", exc)
        plog.step(
            "actions.oberon.dsgvo_check",
            "failed",
            input={"body": body},
            output={"error": str(exc)},
            dauer_ms=duration_ms,
            ok=False,
        )
        return ActionTriggerResponse(
            action_id="oberon.dsgvo.check",
            triggered_at=triggered_at,
            status="failed",
            result_summary="Oberon nicht erreichbar.",
            payload={},
            duration_ms=duration_ms,
            error=str(exc)[:300],
        )

    except Exception as exc:
        duration_ms = int((time.monotonic() - t0) * 1000)
        logger.exception("oberon.dsgvo.check: unerwarteter Fehler: %s", exc)
        return ActionTriggerResponse(
            action_id="oberon.dsgvo.check",
            triggered_at=triggered_at,
            status="failed",
            result_summary="DSGVO-Check: unerwarteter Fehler.",
            payload={},
            duration_ms=duration_ms,
            error=str(exc)[:300],
        )
