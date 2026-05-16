"""
Oberon-Adapter — liefert SystemStatus aus dem Oberon-Cockpit.

Ruft die Cockpit-Smoke-API an: GET /api/v2/admin/cockpit/smoke
und berechnet daraus einen Score.

Auth: Bearer-Token aus Settings (oberon_token).
Fallback: wenn kein Token konfiguriert, ok=False mit erklaerndem summary.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from moag.clients.oberon_cockpit_client import (
    CockpitClient,
    CockpitError,
    CockpitUnavailable,
)
from moag.pipeline_hooks import plog
from moag.schemas import SystemStatus

logger = logging.getLogger("moag.adapters.oberon")


async def get_status(
    base_url: str = "http://192.168.200.169:17900",
    token: str | None = None,
) -> SystemStatus:
    """Fragt den Oberon-Smoke-Endpoint und berechnet daraus einen SystemStatus.

    Score-Berechnung:
      100 wenn alle Checks PASS
      75  wenn mindestens ein WARN, kein FAIL
      50  wenn mindestens ein FAIL
      0   wenn nicht erreichbar / kein Token
    """
    import asyncio
    import time

    fetched_at = datetime.now(timezone.utc)

    if not token:
        return SystemStatus(
            system_id="oberon",
            ok=False,
            score=0,
            summary="Kein Oberon-Admin-Token konfiguriert — Stub-Modus.",
            metrics={},
            fetched_at=fetched_at,
            error="oberon_token nicht gesetzt",
        )

    t0 = time.monotonic()
    try:
        # CockpitClient ist sync (httpx.Client) — im asyncio-Kontext via
        # run_in_executor um den Event-Loop nicht zu blockieren.
        loop = asyncio.get_running_loop()
        smoke = await loop.run_in_executor(
            None,
            _fetch_smoke_sync,
            base_url,
            token,
        )
        dauer_ms = int((time.monotonic() - t0) * 1000)
        plog.step("oberon.adapter", "smoke", input={"url": base_url}, output={"verdict": smoke.summary.verdict}, dauer_ms=dauer_ms, ok=True)

        total = smoke.summary.total or 1
        fail_count = smoke.summary.fail
        warn_count = smoke.summary.warn

        if fail_count > 0:
            score = max(0, 50 - fail_count * 10)
        elif warn_count > 0:
            score = 75
        else:
            score = 100

        verdict = smoke.summary.verdict
        summary_text = f"Oberon {verdict}: {smoke.summary.pass_} PASS, {warn_count} WARN, {fail_count} FAIL von {total} Checks"

        return SystemStatus(
            system_id="oberon",
            ok=(fail_count == 0),
            score=score,
            summary=summary_text,
            metrics={
                "verdict": verdict,
                "pass": smoke.summary.pass_,
                "warn": warn_count,
                "fail": fail_count,
                "total": total,
                "latency_ms": dauer_ms,
            },
            fetched_at=fetched_at,
        )

    except CockpitUnavailable as exc:
        dauer_ms = int((time.monotonic() - t0) * 1000)
        plog.step("oberon.adapter", "smoke", input={"url": base_url}, output={"error": str(exc)}, dauer_ms=dauer_ms, ok=False)
        logger.warning("Oberon nicht erreichbar: %s", exc)
        return SystemStatus(
            system_id="oberon",
            ok=False,
            score=0,
            summary="Oberon nicht erreichbar.",
            metrics={"latency_ms": dauer_ms},
            fetched_at=fetched_at,
            error=str(exc)[:300],
        )
    except CockpitError as exc:
        dauer_ms = int((time.monotonic() - t0) * 1000)
        logger.warning("Oberon Cockpit-Fehler %s: %s", exc.status_code, exc)
        return SystemStatus(
            system_id="oberon",
            ok=False,
            score=0,
            summary=f"Oberon Cockpit-Fehler HTTP {exc.status_code}.",
            metrics={"status_code": exc.status_code, "latency_ms": dauer_ms},
            fetched_at=fetched_at,
            error=str(exc)[:300],
        )
    except Exception as exc:
        dauer_ms = int((time.monotonic() - t0) * 1000)
        logger.exception("Oberon-Adapter unerwarteter Fehler: %s", exc)
        return SystemStatus(
            system_id="oberon",
            ok=False,
            score=0,
            summary="Oberon-Adapter: unerwarteter Fehler.",
            metrics={"latency_ms": dauer_ms},
            fetched_at=fetched_at,
            error=str(exc)[:300],
        )


def _fetch_smoke_sync(base_url: str, token: str):
    """Synchroner Helper fuer run_in_executor."""
    client = CockpitClient(base_url=base_url, token=token, timeout_s=5.0)
    with client:
        return client.get_smoke()
