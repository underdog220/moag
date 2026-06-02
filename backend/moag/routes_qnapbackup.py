"""
QnapBackup-Proxy-Routes fuer MOAG.

Prefix: /api/v1/qnapbackup

Routen:
  GET /status           -> GET {base}/api/v1/status
  GET /backups/recent   -> GET {base}/api/v1/backups/recent?limit= (1..100, Default 20)

base_url aus Settings (qnapbackup_base_url), Default http://192.168.200.71:9000.
Kein Auth (qnapbackup-API ist public, kein Token).
Defensive Fehlerbehandlung: 502 bei ConnectError, 504 bei Timeout.
Pipeline-Logging via plog.step().
"""
from __future__ import annotations

import logging
import time
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Query

from .pipeline_hooks import plog
from .settings_store import SettingsStore

logger = logging.getLogger("moag.routes_qnapbackup")

_DEFAULT_BASE = "http://192.168.200.71:9000"
_TIMEOUT_S = 7.0


def _resolve_base(settings_store: SettingsStore) -> str:
    """Liefert die qnapbackup-base_url aus den Settings."""
    s = settings_store.get()
    base = (getattr(s, "qnapbackup_base_url", None) or _DEFAULT_BASE).rstrip("/")
    return base or _DEFAULT_BASE


async def _proxy_get(base: str, path: str, params: dict[str, str] | None = None) -> Any:
    """GET-Proxy an qnapbackup-Dienst. Wirft HTTPException bei Fehler."""
    target = f"{base}{path}"
    t0 = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT_S, follow_redirects=True) as cli:
            resp = await cli.get(target, params=params or {})
        dauer_ms = int((time.monotonic() - t0) * 1000)
        if resp.is_success:
            ct = resp.headers.get("content-type", "")
            plog.step(
                "qnapbackup.proxy",
                path,
                input={"url": target},
                output={"http": resp.status_code},
                dauer_ms=dauer_ms,
                ok=True,
            )
            if "application/json" in ct:
                return resp.json()
            return {"raw": resp.text}
        plog.step(
            "qnapbackup.proxy",
            path,
            input={"url": target},
            output={"http": resp.status_code},
            dauer_ms=dauer_ms,
            ok=False,
        )
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"qnapbackup {path} antwortete HTTP {resp.status_code}: {resp.text[:200]}",
        )
    except HTTPException:
        raise
    except httpx.TimeoutException:
        dauer_ms = int((time.monotonic() - t0) * 1000)
        plog.step(
            "qnapbackup.proxy",
            path,
            input={"url": target},
            output={"error": "timeout"},
            dauer_ms=dauer_ms,
            ok=False,
        )
        raise HTTPException(status_code=504, detail=f"qnapbackup Timeout ({path})")
    except (httpx.ConnectError, httpx.HTTPError) as exc:
        dauer_ms = int((time.monotonic() - t0) * 1000)
        plog.step(
            "qnapbackup.proxy",
            path,
            input={"url": target},
            output={"error": str(exc)[:80]},
            dauer_ms=dauer_ms,
            ok=False,
        )
        raise HTTPException(
            status_code=502,
            detail=f"qnapbackup nicht erreichbar ({path}): {exc}",
        )


def build_qnapbackup_router(settings_store: SettingsStore) -> APIRouter:
    """Erstellt den FastAPI-Router fuer alle qnapbackup-Proxy-Routen."""
    router = APIRouter(prefix="/api/v1/qnapbackup", tags=["qnapbackup"])

    @router.get("/status")
    async def get_status() -> Any:
        """
        qnapbackup-Status-Snapshot.

        Proxy auf GET {base}/api/v1/status.
        Liefert: ok, score (0..100), summary, metrics, fetched_at.
        Metriken enthalten u.a. last_backup_at, free_space_bytes, errors_24h,
        replica_oberon_postgres_ok, replica_oberon_postgres_lag_seconds.
        Quelle: http://192.168.200.71:9000/api/v1/status
        """
        base = _resolve_base(settings_store)
        return await _proxy_get(base, "/api/v1/status")

    @router.get("/backups/recent")
    async def get_backups_recent(
        limit: int = Query(default=20, ge=1, le=100, description="Anzahl der letzten Backups (1..100)"),
    ) -> Any:
        """
        Liste der letzten Backups.

        Proxy auf GET {base}/api/v1/backups/recent?limit=.
        Liefert: {items: [{id, started_at, finished_at, duration_seconds,
                           shares, bytes_transferred, status, warnings}]}
        Quelle: http://192.168.200.71:9000/api/v1/backups/recent
        """
        base = _resolve_base(settings_store)
        return await _proxy_get(base, "/api/v1/backups/recent", {"limit": str(limit)})

    return router
