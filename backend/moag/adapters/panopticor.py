"""
Panopticor-Adapter — liefert SystemStatus aus dem Panopticor-Bridge-Endpoint.

Panopticor exponiert GET /status auf localhost:8787 (Bridge-Server):
  {system, ok, score, summary, metrics, integrity, lastRun, fetchedAt}

score im Response ist 0..1 (float); wird auf 0..100 (int) skaliert.
lastRun kann null sein; wird flach in metrics angereichert.

Hinweis Doppelrolle: MOAG-Cutover-Skripte werden IN Panopticor getestet
(Sandbox-Pflicht aus globaler CLAUDE.md), waehrend MOAG hier den
Panopticor-Status anzeigt.
"""
from __future__ import annotations

import logging
import time
from datetime import datetime, timezone

import httpx

from moag.pipeline_hooks import plog
from moag.schemas import SystemStatus

logger = logging.getLogger("moag.adapters.panopticor")


async def get_status(
    base_url: str = "http://127.0.0.1:8787",
    token: str | None = None,
) -> SystemStatus:
    """Fragt Panopticor GET /status ab und mappt auf SystemStatus."""
    fetched_at = datetime.now(timezone.utc)
    t0 = time.monotonic()
    base = (base_url or "http://127.0.0.1:8787").rstrip("/")

    headers: dict[str, str] = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{base}/status", headers=headers)
        dauer_ms = int((time.monotonic() - t0) * 1000)

        if not resp.is_success:
            plog.step("panopticor.adapter", "status", input={"url": base},
                      output={"http": resp.status_code}, dauer_ms=dauer_ms, ok=False)
            return SystemStatus(
                system_id="panopticor", ok=False, score=0,
                summary=f"Panopticor: HTTP {resp.status_code}.",
                metrics={"latency_ms": dauer_ms},
                fetched_at=fetched_at,
                error=f"Panopticor {base}/status -> {resp.status_code}",
            )

        data = resp.json()

        # score ist 0..1 float in der Bridge — auf 0..100 int skalieren
        raw_score = data.get("score", 0)
        score = int(round(float(raw_score) * 100)) if isinstance(raw_score, (int, float)) else 0
        score = max(0, min(100, score))

        ok = bool(data.get("ok", score >= 50))
        summary = str(data.get("summary") or "Panopticor")

        # Metriken aus dem metrics-Block (nur Skalare)
        metrics: dict = {"latency_ms": dauer_ms}
        upstream = data.get("metrics")
        if isinstance(upstream, dict):
            for k, v in upstream.items():
                if isinstance(v, (int, float, str, bool)) or v is None:
                    metrics[k] = v

        # lastRun-Felder flach anreichern (falls vorhanden)
        last_run = data.get("lastRun")
        if isinstance(last_run, dict):
            for k in ("runId", "taskId", "status", "verdict", "releaseReadiness"):
                v = last_run.get(k)
                if v is not None:
                    metrics[f"lastRun_{k}"] = v
            lr_score = last_run.get("score")
            if lr_score is not None:
                metrics["lastRun_score"] = lr_score
            metrics["lastRun_updatedAt"] = last_run.get("updatedAt")

        plog.step("panopticor.adapter", "status", input={"url": base},
                  output={"score": score, "ok": ok}, dauer_ms=dauer_ms, ok=True)

        return SystemStatus(
            system_id="panopticor",
            ok=ok,
            score=score,
            summary=summary,
            metrics=metrics,
            fetched_at=fetched_at,
        )

    except Exception as exc:
        dauer_ms = int((time.monotonic() - t0) * 1000)
        logger.debug("Panopticor-Bridge nicht erreichbar: %s", exc)
        return SystemStatus(
            system_id="panopticor", ok=False, score=0,
            summary="Panopticor-Bridge nicht erreichbar.",
            metrics={"latency_ms": dauer_ms},
            fetched_at=fetched_at,
            error=str(exc)[:300],
        )
