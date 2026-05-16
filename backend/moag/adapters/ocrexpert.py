"""
OCRexpert-Adapter — HTTP-Client gegen den OCRexpert-Service.

Ruft: GET /api/health und GET /api/jobs?limit=5 an.
Keine In-Process-Imports aus dem OCRexpert-Repo — alles per HTTP.

OCREXPERT_BASE_URL default: http://192.168.200.71:17810

Frueherer In-Process-Ansatz (OCRexpert-GUI):
  from ocrexpert.pipeline import process, OutputProfil
  process(file_path, profile=OutputProfil.RAW)

Dieser Ansatz ist in MOAG NICHT mehr moeglich und NICHT gewuenscht.
Alle OCRexpert-Pipeline-Calls laufen jetzt ueber HTTP.
"""
from __future__ import annotations

import logging
import time
from datetime import datetime, timezone

import httpx

from moag.pipeline_hooks import plog
from moag.schemas import SystemStatus

logger = logging.getLogger("moag.adapters.ocrexpert")


async def get_status(
    base_url: str = "http://192.168.200.71:17810",
    token: str | None = None,
) -> SystemStatus:
    """Fragt OCRexpert /api/health und /api/jobs und berechnet SystemStatus.

    TODO Phase 1.5: Pipeline-Jobs via POST /api/jobs/upload einreichen
    (HTTP-Ersatz fuer den ehemaligen In-Process-Call process(file_path)).
    """
    fetched_at = datetime.now(timezone.utc)
    t0 = time.monotonic()
    base = base_url.rstrip("/")
    headers: dict[str, str] = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            # Health-Check
            try:
                resp_health = await client.get(f"{base}/api/health", headers=headers)
                health_ok = resp_health.is_success
                health_data = resp_health.json() if resp_health.is_success else {}
            except Exception:
                health_ok = False
                health_data = {}

            if not health_ok:
                dauer_ms = int((time.monotonic() - t0) * 1000)
                plog.step("ocrexpert.adapter", "health", input={"url": base}, output={"ok": False}, dauer_ms=dauer_ms, ok=False)
                return SystemStatus(
                    system_id="ocrexpert",
                    ok=False,
                    score=0,
                    summary="OCRexpert-Service nicht erreichbar.",
                    metrics={"latency_ms": dauer_ms},
                    fetched_at=fetched_at,
                    error=f"GET {base}/api/health fehlgeschlagen",
                )

            # Letzte Jobs abfragen
            jobs_total = 0
            jobs_failed = 0
            pipeline_ready = health_data.get("pipeline_ready", False)
            try:
                resp_jobs = await client.get(f"{base}/api/jobs", params={"limit": 5}, headers=headers)
                if resp_jobs.is_success:
                    jobs_data = resp_jobs.json()
                    jobs_total = jobs_data.get("total", 0)
                    # Fehlschlaege aus den letzten 5 Jobs
                    for j in jobs_data.get("jobs", []):
                        if j.get("status") == "failed":
                            jobs_failed += 1
            except Exception as e:
                logger.debug("OCRexpert /api/jobs fehlgeschlagen: %s", e)

        dauer_ms = int((time.monotonic() - t0) * 1000)
        plog.step("ocrexpert.adapter", "health+jobs", input={"url": base}, output={"jobs_total": jobs_total, "pipeline_ready": pipeline_ready}, dauer_ms=dauer_ms, ok=True)

        version = health_data.get("version", "?")
        if jobs_failed > 0:
            score = max(40, 80 - jobs_failed * 15)
        else:
            score = 100 if pipeline_ready else 70

        summary = f"OCRexpert v{version}: {jobs_total} Jobs gesamt, Pipeline {'bereit' if pipeline_ready else 'deaktiviert'}."
        return SystemStatus(
            system_id="ocrexpert",
            ok=True,
            score=score,
            summary=summary,
            metrics={
                "version": version,
                "jobs_total": jobs_total,
                "jobs_failed_recent": jobs_failed,
                "pipeline_ready": pipeline_ready,
                "latency_ms": dauer_ms,
            },
            fetched_at=fetched_at,
        )

    except Exception as exc:
        dauer_ms = int((time.monotonic() - t0) * 1000)
        logger.exception("OCRexpert-Adapter Fehler: %s", exc)
        return SystemStatus(
            system_id="ocrexpert",
            ok=False,
            score=0,
            summary="OCRexpert-Adapter: unerwarteter Fehler.",
            metrics={"latency_ms": dauer_ms},
            fetched_at=fetched_at,
            error=str(exc)[:300],
        )
