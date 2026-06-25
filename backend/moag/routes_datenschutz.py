"""
Datenschutzkonzept-Proxy — Oberon-Endpunkte fuer das versionierte DSGVO-Konzept.

Routen unter /api/v1/oberon/datenschutz-konzept/*:
  GET  .../datenschutz-konzept           → /api/v2/admin/datenschutzkonzept (aktuelle Version)
  GET  .../datenschutz-konzept/versions  → /api/v2/admin/datenschutzkonzept/versions (Liste)
  GET  .../datenschutz-konzept/versions/{id} → /api/v2/admin/datenschutzkonzept/versions/{id}
  POST .../datenschutz-konzept/generate  → /api/v2/admin/datenschutzkonzept/generate (Trigger)

Auth: Bearer oberon_token (identisch zu /api/v1/oberon/providers etc.).
Stub-Response wenn kein Token konfiguriert (bestehende MOAG-Konvention).

PipelineLog via MOAG_PIPELINE_LOG_ENABLED.
"""
from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from typing import Any, Optional

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from moag.pipeline_hooks import plog
from moag.settings_store import SettingsStore

logger = logging.getLogger("moag.routes_datenschutz")

# Oberon-Prefix fuer alle Datenschutzkonzept-Endpunkte
_OBERON_DATENSCHUTZ = "/api/v2/admin/datenschutzkonzept"

# Timeout fuer Oberon-Calls (Generierung kann laenger dauern)
_TIMEOUT_STANDARD = 8.0
_TIMEOUT_GENERATE = 120.0

# ── Router ───────────────────────────────────────────────────────────────────

router = APIRouter(prefix="/api/v1/oberon", tags=["datenschutz"])

_settings_store: Optional[SettingsStore] = None


def _get_settings_store() -> SettingsStore:
    if _settings_store is None:
        raise RuntimeError("DatenschutzRouter: SettingsStore nicht injiziert — build_datenschutz_router() nicht aufgerufen?")
    return _settings_store


def _get_oberon_base() -> Optional[str]:
    """Gibt Oberon-Base-URL aus Settings zurueck. None wenn nicht gesetzt."""
    s = _get_settings_store().get()
    return (s.oberon_base_url or "http://192.168.200.169:17900").rstrip("/")


def _get_token() -> Optional[str]:
    """Gibt den Oberon-Token aus Settings zurueck. None wenn nicht konfiguriert."""
    s = _get_settings_store().get()
    return s.oberon_token or None


def _no_token_stub(endpoint: str) -> dict:
    """Stub-Antwort wenn kein Token konfiguriert (bestehende MOAG-Konvention)."""
    return {
        "stub": True,
        "message": f"Kein Oberon-Token konfiguriert — {endpoint} nicht verfuegbar",
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _proxy_get(path: str, timeout: float = _TIMEOUT_STANDARD) -> Any:
    """Fuehrt einen GET-Request gegen Oberon durch. Gibt geparsten JSON-Body zurueck.

    Wirft HTTPException bei 4xx/5xx oder Verbindungsproblemen.
    """
    token = _get_token()
    if token is None:
        plog.step(
            "datenschutz.proxy",
            "get",
            input={"path": path},
            output={"stub": True},
            dauer_ms=0,
            ok=False,
        )
        return None  # Aufrufer gibt Stub zurueck

    base = _get_oberon_base()
    url = base + path
    t0 = time.monotonic()

    try:
        resp = httpx.get(url, headers=_auth_headers(token), timeout=timeout)
    except (httpx.TimeoutException, httpx.ConnectError, httpx.HTTPError, OSError) as exc:
        dauer_ms = int((time.monotonic() - t0) * 1000)
        plog.step(
            "datenschutz.proxy",
            "get",
            input={"path": path},
            output={"error": str(exc)},
            dauer_ms=dauer_ms,
            ok=False,
        )
        logger.warning("Oberon-Datenschutz-GET %s fehlgeschlagen: %s", path, exc)
        raise HTTPException(
            status_code=502,
            detail={"status": "upstream_unavailable", "detail": str(exc)},
        )

    dauer_ms = int((time.monotonic() - t0) * 1000)

    if resp.status_code >= 500:
        plog.step(
            "datenschutz.proxy",
            "get",
            input={"path": path},
            output={"status": resp.status_code, "body": resp.text[:200]},
            dauer_ms=dauer_ms,
            ok=False,
        )
        raise HTTPException(
            status_code=502,
            detail={"status": "upstream_error", "detail": f"Oberon HTTP {resp.status_code}: {resp.text[:200]}"},
        )

    if resp.status_code >= 400:
        plog.step(
            "datenschutz.proxy",
            "get",
            input={"path": path},
            output={"status": resp.status_code, "body": resp.text[:200]},
            dauer_ms=dauer_ms,
            ok=False,
        )
        raise HTTPException(
            status_code=resp.status_code,
            detail={"status": "cockpit_error", "detail": f"Oberon HTTP {resp.status_code}: {resp.text[:200]}"},
        )

    body = resp.json()
    plog.step(
        "datenschutz.proxy",
        "get",
        input={"path": path},
        output={"status": resp.status_code, "bytes": len(resp.content)},
        dauer_ms=dauer_ms,
        ok=True,
    )
    logger.debug("Oberon-Datenschutz-GET %s → HTTP %s (%d Bytes, %d ms)", path, resp.status_code, len(resp.content), dauer_ms)
    return body


def _proxy_post(path: str, timeout: float = _TIMEOUT_GENERATE) -> Any:
    """Fuehrt einen POST-Request gegen Oberon durch (kein Body, nur Trigger)."""
    token = _get_token()
    if token is None:
        return None

    base = _get_oberon_base()
    url = base + path
    t0 = time.monotonic()

    try:
        resp = httpx.post(url, headers=_auth_headers(token), timeout=timeout)
    except (httpx.TimeoutException, httpx.ConnectError, httpx.HTTPError, OSError) as exc:
        dauer_ms = int((time.monotonic() - t0) * 1000)
        plog.step(
            "datenschutz.proxy",
            "post",
            input={"path": path},
            output={"error": str(exc)},
            dauer_ms=dauer_ms,
            ok=False,
        )
        raise HTTPException(
            status_code=502,
            detail={"status": "upstream_unavailable", "detail": str(exc)},
        )

    dauer_ms = int((time.monotonic() - t0) * 1000)

    if resp.status_code >= 400:
        plog.step(
            "datenschutz.proxy",
            "post",
            input={"path": path},
            output={"status": resp.status_code, "body": resp.text[:200]},
            dauer_ms=dauer_ms,
            ok=False,
        )
        raise HTTPException(
            status_code=resp.status_code if resp.status_code < 500 else 502,
            detail={"status": "upstream_error", "detail": f"Oberon HTTP {resp.status_code}: {resp.text[:200]}"},
        )

    body = resp.json() if resp.content else {}
    plog.step(
        "datenschutz.proxy",
        "post",
        input={"path": path},
        output={"status": resp.status_code, "bytes": len(resp.content)},
        dauer_ms=dauer_ms,
        ok=True,
    )
    return body


# ── Routen ───────────────────────────────────────────────────────────────────


@router.get("/datenschutz-konzept")
def get_datenschutz_konzept() -> Any:
    """GET /api/v2/admin/datenschutzkonzept — aktuelle Datenschutzkonzept-Version.

    Liefert das vollstaendige Datenschutzkonzept-Objekt mit Prosa, Claims,
    Quellen, Problem-Flags und Integritaets-Status.
    Stub-Antwort wenn kein Token konfiguriert.

    Datenquelle: Oberon /api/v2/admin/datenschutzkonzept
    """
    body = _proxy_get(_OBERON_DATENSCHUTZ)
    if body is None:
        return _no_token_stub("datenschutz-konzept")
    return body


@router.get("/datenschutz-konzept/versions")
def get_datenschutz_versions() -> Any:
    """GET /api/v2/admin/datenschutzkonzept/versions — Versions-Liste.

    Liefert alle vorhandenen Versionen mit id, version, generated_at, is_current.
    Stub-Antwort wenn kein Token konfiguriert.

    Datenquelle: Oberon /api/v2/admin/datenschutzkonzept/versions
    """
    body = _proxy_get(f"{_OBERON_DATENSCHUTZ}/versions")
    if body is None:
        return _no_token_stub("datenschutz-konzept/versions")
    return body


@router.get("/datenschutz-konzept/versions/{version_id}")
def get_datenschutz_version(version_id: str) -> Any:
    """GET /api/v2/admin/datenschutzkonzept/versions/{id} — Einzelversion.

    Liefert das vollstaendige Konzept-Objekt einer historischen Version.
    Stub-Antwort wenn kein Token konfiguriert.

    Datenquelle: Oberon /api/v2/admin/datenschutzkonzept/versions/{id}
    """
    body = _proxy_get(f"{_OBERON_DATENSCHUTZ}/versions/{version_id}")
    if body is None:
        return _no_token_stub(f"datenschutz-konzept/versions/{version_id}")
    return body


@router.post("/datenschutz-konzept/generate")
def generate_datenschutz_konzept() -> Any:
    """POST /api/v2/admin/datenschutzkonzept/generate — manueller Generierungs-Trigger.

    Loest die LLM-basierte Neu-Generierung des Datenschutzkonzepts aus.
    Kann je nach Modell und Datenlage 30-120 Sekunden dauern.
    Confirm-Dialog im Frontend ist Pflicht (LLM-Kosten).
    Stub-Antwort wenn kein Token konfiguriert.

    Datenquelle: Oberon /api/v2/admin/datenschutzkonzept/generate
    """
    token = _get_token()
    if token is None:
        return _no_token_stub("datenschutz-konzept/generate")
    body = _proxy_post(f"{_OBERON_DATENSCHUTZ}/generate")
    if body is None:
        return _no_token_stub("datenschutz-konzept/generate")
    return body


# ── Router-Factory (fuer create_app) ─────────────────────────────────────────


def build_datenschutz_router(settings_store: SettingsStore) -> APIRouter:
    """Injiziert SettingsStore und gibt den Router zurueck.

    Muss von create_app() aufgerufen werden, bevor include_router() greift.
    """
    global _settings_store
    _settings_store = settings_store
    return router
