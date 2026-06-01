"""
QnapBackup-Adapter — liefert SystemStatus aus dem qnapbackup-Web-Service.

qnapbackup (Flask, VDR:9000) stellt einen dedizierten MOAG-Cockpit-Endpoint
bereit (ADR-008):
  GET /api/v1/status  ->  {ok, score, summary, metrics, fetched_at}  (Public, kein Auth)

Da das Schema exakt SystemStatus entspricht, ist der Adapter ein duenner
Durchreicher mit defensiver Fehlerbehandlung (nicht erreichbar -> ok=False).
"""
from __future__ import annotations

import logging
import time
from datetime import datetime, timezone

import httpx

from moag.pipeline_hooks import plog
from moag.schemas import SystemStatus

logger = logging.getLogger("moag.adapters.qnapbackup")


async def get_status(
    base_url: str = "http://192.168.200.71:9000",
    token: str | None = None,
) -> SystemStatus:
    """Fragt qnapbackup GET /api/v1/status ab und mappt 1:1 auf SystemStatus."""
    fetched_at = datetime.now(timezone.utc)
    t0 = time.monotonic()
    base = (base_url or "http://192.168.200.71:9000").rstrip("/")

    headers: dict[str, str] = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{base}/api/v1/status", headers=headers)
        dauer_ms = int((time.monotonic() - t0) * 1000)

        if not resp.is_success:
            plog.step("qnapbackup.adapter", "status", input={"url": base},
                      output={"http": resp.status_code}, dauer_ms=dauer_ms, ok=False)
            return SystemStatus(
                system_id="qnapbackup", ok=False, score=0,
                summary=f"qnapbackup: HTTP {resp.status_code}.",
                metrics={"latency_ms": dauer_ms},
                fetched_at=fetched_at,
                error=f"qnapbackup {base}/api/v1/status -> {resp.status_code}",
            )

        data = resp.json()
        score = int(data.get("score", 0))
        ok = bool(data.get("ok", score >= 50))
        summary = str(data.get("summary") or "qnapbackup")
        # Upstream-Metriken uebernehmen (nur skalar) + Latenz ergaenzen
        metrics: dict = {"latency_ms": dauer_ms}
        upstream = data.get("metrics")
        if isinstance(upstream, dict):
            for k, v in upstream.items():
                if isinstance(v, (int, float, str, bool)) or v is None:
                    metrics[k] = v

        plog.step("qnapbackup.adapter", "status", input={"url": base},
                  output={"score": score, "ok": ok}, dauer_ms=dauer_ms, ok=True)

        return SystemStatus(
            system_id="qnapbackup",
            ok=ok,
            score=score,
            summary=summary,
            metrics=metrics,
            fetched_at=fetched_at,
        )

    except Exception as exc:
        dauer_ms = int((time.monotonic() - t0) * 1000)
        logger.debug("qnapbackup-Adapter nicht erreichbar: %s", exc)
        return SystemStatus(
            system_id="qnapbackup", ok=False, score=0,
            summary="qnapbackup nicht erreichbar.",
            metrics={"latency_ms": dauer_ms},
            fetched_at=fetched_at,
            error=str(exc)[:300],
        )
