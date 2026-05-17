"""
Aktion: ocrexpert.health.check — OCRexpert Health-Check aktualisieren.

Direkter GET auf {OCREXPERT_BASE_URL}/api/v1/health via httpx.
Mappt Capability-Felder (engines_local, octoboss_reachable, ...) zu summary + payload.

ENV: MOAG_OCREXPERT_BASE_URL (Default: http://192.168.200.71:17810)
"""
from __future__ import annotations

import logging
import time
from datetime import datetime, timezone

import httpx

from moag.actions.registry import register
from moag.pipeline_hooks import plog
from moag.schemas import Action, ActionTriggerResponse

logger = logging.getLogger("moag.actions.ocrexpert_health")

_DEFAULT_BASE = "http://192.168.200.71:17810"

_META = Action(
    action_id="ocrexpert.health.check",
    system_id="ocrexpert",
    name="OCRexpert Health-Check",
    description=(
        "Ruft OCRexpert /api/v1/health auf und liefert den aktuellen Status: "
        "OCR-Engines, OctoBoss-Erreichbarkeit, LibreOffice und Shadow-Modus."
    ),
    category="diagnose",
    sub_area="health",
    requires_confirm=False,
    is_destructive=False,
    estimated_duration_s=3,
    implemented=True,
)


@register(meta=_META)
async def handle_ocrexpert_health(body: dict) -> ActionTriggerResponse:
    """Fragt OCRexpert /api/v1/health und liefert ActionTriggerResponse."""
    import os
    triggered_at = datetime.now(timezone.utc)
    t0 = time.monotonic()

    base_url = os.environ.get("MOAG_OCREXPERT_BASE_URL", _DEFAULT_BASE).rstrip("/")

    plog.step(
        "actions.ocrexpert.health.check",
        "start",
        input={"url": base_url, "body": body},
    )

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(f"{base_url}/api/v1/health")
            duration_ms = int((time.monotonic() - t0) * 1000)

            if not resp.is_success:
                plog.step(
                    "actions.ocrexpert.health.check",
                    "failed",
                    input={"url": base_url},
                    output={"status_code": resp.status_code},
                    dauer_ms=duration_ms,
                    ok=False,
                )
                return ActionTriggerResponse(
                    action_id="ocrexpert.health.check",
                    triggered_at=triggered_at,
                    status="failed",
                    result_summary=f"OCRexpert Health-Endpoint antwortete HTTP {resp.status_code}.",
                    payload={"status_code": resp.status_code},
                    duration_ms=duration_ms,
                    error=f"HTTP {resp.status_code}: {resp.text[:200]}",
                )

            data = resp.json()
            status = data.get("status", "unknown")
            version = data.get("version", "?")
            engines_local = data.get("engines_local") or []
            engines_octoboss = data.get("engines_octoboss") or []
            octoboss_reachable = bool(data.get("octoboss_reachable"))
            libreoffice_available = bool(data.get("libreoffice_available"))
            shadow_writable = bool(data.get("shadow_writable"))

            summary = (
                f"OCRexpert v{version} [{status}]: "
                f"{len(engines_local)} lokale Engines · "
                f"OctoBoss {'erreichbar' if octoboss_reachable else 'offline'} · "
                f"LibreOffice {'ja' if libreoffice_available else 'nein'} · "
                f"Shadow {'schreibbar' if shadow_writable else 'gesperrt'}"
            )

            plog.step(
                "actions.ocrexpert.health.check",
                "completed",
                input={"url": base_url},
                output={
                    "status": status,
                    "engines_local": len(engines_local),
                    "octoboss_reachable": octoboss_reachable,
                },
                dauer_ms=duration_ms,
                ok=True,
            )

            return ActionTriggerResponse(
                action_id="ocrexpert.health.check",
                triggered_at=triggered_at,
                status="completed",
                result_summary=summary,
                payload={
                    "status": status,
                    "version": version,
                    "engines_local": engines_local,
                    "engines_octoboss": engines_octoboss,
                    "octoboss_reachable": octoboss_reachable,
                    "libreoffice_available": libreoffice_available,
                    "shadow_writable": shadow_writable,
                },
                duration_ms=duration_ms,
            )

    except httpx.TimeoutException as exc:
        duration_ms = int((time.monotonic() - t0) * 1000)
        logger.warning("ocrexpert.health.check: Timeout: %s", exc)
        plog.step(
            "actions.ocrexpert.health.check",
            "failed",
            input={"url": base_url},
            output={"error": "timeout"},
            dauer_ms=duration_ms,
            ok=False,
        )
        return ActionTriggerResponse(
            action_id="ocrexpert.health.check",
            triggered_at=triggered_at,
            status="failed",
            result_summary="OCRexpert nicht erreichbar (Timeout).",
            payload={},
            duration_ms=duration_ms,
            error=f"Timeout nach 8s: {exc}",
        )

    except (httpx.ConnectError, httpx.HTTPError) as exc:
        duration_ms = int((time.monotonic() - t0) * 1000)
        logger.warning("ocrexpert.health.check: Verbindungsfehler: %s", exc)
        plog.step(
            "actions.ocrexpert.health.check",
            "failed",
            input={"url": base_url},
            output={"error": str(exc)},
            dauer_ms=duration_ms,
            ok=False,
        )
        return ActionTriggerResponse(
            action_id="ocrexpert.health.check",
            triggered_at=triggered_at,
            status="failed",
            result_summary="OCRexpert nicht erreichbar.",
            payload={},
            duration_ms=duration_ms,
            error=str(exc)[:300],
        )

    except Exception as exc:
        duration_ms = int((time.monotonic() - t0) * 1000)
        logger.exception("ocrexpert.health.check: unerwarteter Fehler: %s", exc)
        plog.step(
            "actions.ocrexpert.health.check",
            "failed",
            input={"url": base_url},
            output={"error": str(exc)},
            dauer_ms=duration_ms,
            ok=False,
        )
        return ActionTriggerResponse(
            action_id="ocrexpert.health.check",
            triggered_at=triggered_at,
            status="failed",
            result_summary="OCRexpert Health-Check: unerwarteter Fehler.",
            payload={},
            duration_ms=duration_ms,
            error=str(exc)[:300],
        )
