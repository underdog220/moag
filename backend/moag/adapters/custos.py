"""
Custos-Adapter — liefert SystemStatus aus dem Custos-Service.

Custos ist eine FastAPI-Compliance-Rule-Engine.
Endpoints (aus Custos-Quellcode ermittelt):
  GET /api/health          — Liveness-Check ({"status": "ok", "version": "..."})
  GET /api/engine/status   — Letzter Lauf je Regel
  GET /api/findings        — Liste offener Findings

Score-Formel:
  50 % Service erreichbar
  30 % Engine hat mindestens eine aktive Regel (letzter_lauf vorhanden)
  20 % Frische der Findings (Findings-Abruf geklappt)

Bei findings_count > 0: Hinweis im summary.
"""
from __future__ import annotations

import logging
import time
from datetime import datetime, timezone

import httpx

from moag.pipeline_hooks import plog
from moag.schemas import SystemStatus

logger = logging.getLogger("moag.adapters.custos")


async def get_status(
    base_url: str = "http://192.168.200.71:17890",
    token: str | None = None,
) -> SystemStatus:
    """Fragt Custos /api/health, /api/engine/status und /api/findings ab."""
    fetched_at = datetime.now(timezone.utc)
    t0 = time.monotonic()
    base = base_url.rstrip("/")

    headers: dict[str, str] = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    # Ergebnis-Bausteine
    reachable = False
    engine_ok = False
    findings_ok = False
    findings_count = 0
    active_rules = 0
    rules_with_last_run = 0

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            # 1. Health-Probe
            try:
                resp = await client.get(f"{base}/api/health", headers=headers)
                reachable = resp.status_code < 400
            except Exception as exc:
                logger.debug("Custos Health-Probe fehlgeschlagen: %s", exc)
                reachable = False

            dauer_health = int((time.monotonic() - t0) * 1000)
            plog.step(
                "custos.adapter", "health",
                input={"url": base},
                output={"reachable": reachable},
                dauer_ms=dauer_health,
                ok=reachable,
            )

            if not reachable:
                return SystemStatus(
                    system_id="custos",
                    ok=False,
                    score=0,
                    summary="Custos nicht erreichbar.",
                    metrics={"latency_ms": dauer_health},
                    fetched_at=fetched_at,
                    error=f"Custos {base}/api/health nicht erreichbar",
                )

            # 2. Engine-Status
            try:
                resp_engine = await client.get(f"{base}/api/engine/status", headers=headers)
                if resp_engine.is_success:
                    engine_data = resp_engine.json()
                    regeln = engine_data.get("regeln", [])
                    active_rules = engine_data.get("count_aktiv", 0)
                    rules_with_last_run = sum(
                        1 for r in regeln
                        if r.get("letzter_lauf") is not None
                    )
                    engine_ok = active_rules > 0
            except Exception as exc:
                logger.debug("Custos Engine-Status fehlgeschlagen: %s", exc)

            # 3. Findings-Probe (limit=5 — nur fuer Zaehlung)
            try:
                resp_findings = await client.get(
                    f"{base}/api/findings",
                    headers=headers,
                    params={"limit": 200, "status": "OFFEN"},
                )
                if resp_findings.is_success:
                    data = resp_findings.json()
                    findings_count = len(data) if isinstance(data, list) else 0
                    findings_ok = True
            except Exception as exc:
                logger.debug("Custos Findings-Probe fehlgeschlagen: %s", exc)

        dauer_ms = int((time.monotonic() - t0) * 1000)

        # Score-Berechnung: 50% reachable + 30% engine-ok + 20% findings-ok
        score = 50  # reachable ist garantiert (sonst oben zurueckgekehrt)
        if engine_ok:
            score += 30
        if findings_ok:
            score += 20

        # Summary bauen
        if findings_count > 0:
            summary = (
                f"Custos: {findings_count} offene Findings · "
                f"{active_rules} aktive Regeln · "
                f"{rules_with_last_run} Regeln mit letztem Lauf"
            )
        else:
            summary = (
                f"Custos: keine offenen Findings · "
                f"{active_rules} aktive Regeln"
            )

        plog.step(
            "custos.adapter", "gesamt",
            input={"url": base},
            output={
                "score": score,
                "findings_count": findings_count,
                "active_rules": active_rules,
                "engine_ok": engine_ok,
            },
            dauer_ms=dauer_ms,
            ok=True,
        )

        return SystemStatus(
            system_id="custos",
            ok=score >= 50,
            score=score,
            summary=summary,
            metrics={
                "findings_count": findings_count,
                "active_rules": active_rules,
                "rules_with_last_run": rules_with_last_run,
                "latency_ms": dauer_ms,
            },
            fetched_at=fetched_at,
        )

    except Exception as exc:
        dauer_ms = int((time.monotonic() - t0) * 1000)
        logger.exception("Custos-Adapter Fehler: %s", exc)
        return SystemStatus(
            system_id="custos",
            ok=False,
            score=0,
            summary="Custos-Adapter: unerwarteter Fehler.",
            metrics={"latency_ms": dauer_ms},
            fetched_at=fetched_at,
            error=str(exc)[:300],
        )
