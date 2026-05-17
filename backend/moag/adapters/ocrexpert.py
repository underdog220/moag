"""
OCRexpert-Adapter — HTTP-Client gegen den OCRexpert-Service.

Endpoint: GET /api/v1/health (FastAPI-Service auf VDR:17810).
Antwort enthaelt status + engines_local + engines_octoboss + octoboss_reachable
+ libreoffice_available + shadow_writable.

Score-Formel (ehrlich, gewichtet — keine "100 nur weil erreichbar"-Falle):
  status=ok          → +40
  engines_local > 0  → +25 (lokale OCR-Engines verfuegbar)
  octoboss_reachable → +20 (Cluster-OCR via OctoBoss)
  libreoffice        → +10 (Office-Doc-Support)
  shadow_writable    → +5  (Shadow-Modus betriebsbereit)
Maximum: 100.

Auth: keine im LAN (Funktion vor Sicherheit — bewusste Designentscheidung).
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
    """Fragt OCRexpert /api/v1/health und berechnet SystemStatus.

    Optionaler `token` wird als Bearer-Header gesetzt — aktuell ignoriert der
    LAN-Service ihn, kann aber spaeter aktiviert werden.
    """
    fetched_at = datetime.now(timezone.utc)
    t0 = time.monotonic()
    base = base_url.rstrip("/")
    headers: dict[str, str] = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            try:
                resp = await client.get(f"{base}/api/v1/health", headers=headers)
                health_ok = resp.is_success
                health_data = resp.json() if resp.is_success else {}
            except Exception as e:
                logger.debug("OCRexpert /api/v1/health fehlgeschlagen: %s", e)
                health_ok = False
                health_data = {}

            dauer_ms = int((time.monotonic() - t0) * 1000)

            if not health_ok:
                plog.step("ocrexpert.adapter", "health", input={"url": base}, output={"ok": False}, dauer_ms=dauer_ms, ok=False)
                return SystemStatus(
                    system_id="ocrexpert",
                    ok=False,
                    score=0,
                    summary="OCRexpert-Service nicht erreichbar.",
                    metrics={"latency_ms": dauer_ms},
                    fetched_at=fetched_at,
                    error=f"GET {base}/api/v1/health fehlgeschlagen",
                )

            status = health_data.get("status", "")
            version = health_data.get("version", "?")
            engines_local = health_data.get("engines_local") or []
            engines_octoboss = health_data.get("engines_octoboss") or []
            octoboss_reachable = bool(health_data.get("octoboss_reachable"))
            libreoffice_available = bool(health_data.get("libreoffice_available"))
            shadow_writable = bool(health_data.get("shadow_writable"))

            # Gewichteter Score
            score = 0
            if status == "ok":
                score += 40
            elif status == "degraded":
                score += 20
            if len(engines_local) > 0:
                score += 25
            if octoboss_reachable:
                score += 20
            if libreoffice_available:
                score += 10
            if shadow_writable:
                score += 5
            score = min(100, score)

            plog.step(
                "ocrexpert.adapter", "health",
                input={"url": base},
                output={
                    "status": status, "engines_local": len(engines_local),
                    "octoboss_reachable": octoboss_reachable,
                    "score": score,
                },
                dauer_ms=dauer_ms, ok=True,
            )

            summary = (
                f"OCRexpert v{version} [{status}]: "
                f"{len(engines_local)} lokale Engines · "
                f"OctoBoss {'erreichbar' if octoboss_reachable else 'offline'} · "
                f"Office {'ja' if libreoffice_available else 'nein'} · "
                f"Shadow {'schreibbar' if shadow_writable else 'gesperrt'}"
            )
            return SystemStatus(
                system_id="ocrexpert",
                ok=score >= 40,
                score=score,
                summary=summary,
                metrics={
                    "version": version,
                    "status": status,
                    "engines_local_count": len(engines_local),
                    "engines_octoboss_count": len(engines_octoboss),
                    "octoboss_reachable": octoboss_reachable,
                    "libreoffice_available": libreoffice_available,
                    "shadow_writable": shadow_writable,
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
