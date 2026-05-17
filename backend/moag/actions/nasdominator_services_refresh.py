"""
Echte Aktion: nasdominator.services.refresh

Triggert NasDominator-Services-Sync via POST /api/services/sync.
Falls dieser Endpoint nicht verfuegbar ist (404), faellt die Aktion
auf einen Adapter-Refresh zurueck (MOAG-seitiger Re-Check).
"""
from __future__ import annotations

import time
from datetime import datetime, timezone

from moag.actions.registry import register
from moag.schemas import Action, ActionTriggerResponse

# Adapter-Import (echter HTTP-Call)
from moag.adapters import nasdominator as _nasdominator

# Settings-Zugriff — wir nutzen die Settings-Defaults wenn kein Store injiziert wird
_DEFAULT_BASE_URL = "http://192.168.200.169:9090"

_META = Action(
    action_id="nasdominator.services.refresh",
    system_id="nasdominator",
    name="Service-Status aktualisieren",
    description=(
        "Zwingt NasDominator, den Status aller kritischen Services "
        "(Oberon, OctoBoss, Postgres) sofort neu abzufragen. "
        "Nutzt POST /api/services/sync oder MOAG-seitigen Adapter-Refresh als Fallback."
    ),
    category="diagnose",
    sub_area="services",
    requires_confirm=False,
    is_destructive=False,
    estimated_duration_s=5,
    implemented=True,
)


@register(meta=_META)
async def handle_nasdominator_services_refresh(body: dict) -> ActionTriggerResponse:
    """
    Fuehrt den NasDominator-Services-Refresh durch.

    body (optional): {"base_url": "...", "token": "..."}
    """
    t0 = time.monotonic()
    triggered_at = datetime.now(timezone.utc)

    base_url = body.get("base_url") or _DEFAULT_BASE_URL
    token: str | None = body.get("token") or None

    try:
        result = await _nasdominator.trigger_services_sync(base_url=base_url, token=token)
    except Exception as exc:
        duration_ms = int((time.monotonic() - t0) * 1000)
        return ActionTriggerResponse(
            action_id="nasdominator.services.refresh",
            triggered_at=triggered_at,
            status="failed",
            result_summary=f"Verbindungsfehler: {exc}",
            payload={},
            duration_ms=duration_ms,
            error=str(exc)[:300],
        )

    duration_ms = int((time.monotonic() - t0) * 1000)

    if result.get("auth_required"):
        return ActionTriggerResponse(
            action_id="nasdominator.services.refresh",
            triggered_at=triggered_at,
            status="failed",
            result_summary="Auth erforderlich — keine Credentials in MOAG-Settings konfiguriert.",
            payload=result,
            duration_ms=duration_ms,
            error="auth_required",
        )

    if result.get("error") and not result.get("triggered") and not result.get("fallback"):
        return ActionTriggerResponse(
            action_id="nasdominator.services.refresh",
            triggered_at=triggered_at,
            status="failed",
            result_summary=f"Sync fehlgeschlagen: {result['error']}",
            payload=result,
            duration_ms=duration_ms,
            error=result["error"],
        )

    # Fallback-Fall: Adapter-Refresh (kein serverseitiger Sync-Endpoint)
    if result.get("fallback"):
        score = result.get("score", 0)
        summary = result.get("summary", "Status aktualisiert")
        return ActionTriggerResponse(
            action_id="nasdominator.services.refresh",
            triggered_at=triggered_at,
            status="completed",
            result_summary=f"MOAG-Adapter-Refresh (kein Sync-Endpoint): {summary} (Score {score})",
            payload=result,
            duration_ms=duration_ms,
        )

    # Ergebnis des serverseitigen Syncs
    return ActionTriggerResponse(
        action_id="nasdominator.services.refresh",
        triggered_at=triggered_at,
        status="completed",
        result_summary="NasDominator Service-Sync abgeschlossen.",
        payload=result,
        duration_ms=duration_ms,
    )
