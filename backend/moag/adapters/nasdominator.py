"""
NasDominator-Adapter — echte HTTP-Anbindung (Phase 3).

Ziel-Service: FastAPI Port 9090 auf QNAP NAS (http://192.168.200.169:9090).

Auth-Situation:
  NasDominator verwendet Session-Cookie-Auth via POST /api/auth/login.
  Login-Body: {"username": "...", "password": "..."}
  Login-Antwort: {"status": "ok", "token": "..."} + Set-Cookie: nasdom_token=<jwt>
  Folgende Endpoints erfordern diesen Cookie:
    GET /api/dashboard, GET /api/metrics/latest,
    GET /api/services/monitored, GET /api/services/containers,
    POST /api/services/sync

  Der Adapter cacht den Cookie 10 Minuten (modulweit, key=base_url).
  Bei 401 trotz gecachtem Cookie: Cache leeren und einmal Re-Login probieren.

  Score-Formel: 40% erreichbar + 30% kritische Services up + 20% Metriken
    vorhanden + 10% kein Alert-/Warn-Zustand.

Endpoints die genutzt werden:
  GET /api/auth/status           -- public, prueft ob Setup abgeschlossen
  POST /api/auth/login           -- login; liefert Cookie nasdom_token
  GET /api/dashboard             -- erfordert Auth; liefert RAID + Container + Load
  GET /api/metrics/latest        -- erfordert Auth; CPU/RAM/Storage
  GET /api/services/monitored    -- erfordert Auth; Critical-Services
  GET /api/services/containers   -- erfordert Auth; Container-Liste
  POST /api/services/sync        -- erfordert Auth; Services-Sync ausloesen
"""
from __future__ import annotations

import logging
import time
from datetime import datetime, timezone

import httpx

from moag.pipeline_hooks import plog
from moag.schemas import SystemStatus

logger = logging.getLogger("moag.adapters.nasdominator")

# Schwellwert: ab diesem Score gilt NasDominator als "ok"
_OK_THRESHOLD = 35

# Modulweiter Cookie-Cache: {base_url: {"cookie": "...", "expires_at": float}}
_cookie_cache: dict[str, dict] = {}


async def _login_and_get_cookie(
    client: httpx.AsyncClient,
    base_url: str,
    username: str,
    password: str,
) -> str | None:
    """
    Login via POST /api/auth/login, cached Cookie, gibt Cookie-Header-Value zurueck.

    Rueckgabe: Cookie-String im Format "nasdom_token=<jwt>" oder None bei Fehler.
    """
    # Cache-Hit pruefen
    cached = _cookie_cache.get(base_url)
    if cached and cached["expires_at"] > time.time():
        return cached["cookie"]

    # Login-Request
    try:
        resp = await client.post(
            f"{base_url}/api/auth/login",
            json={"username": username, "password": password},
            timeout=10.0,
        )
        if resp.status_code == 200:
            # Cookie aus Set-Cookie-Header extrahieren (httpx pflegt .cookies)
            cookie_header = "; ".join(
                f"{k}={v}" for k, v in resp.cookies.items()
            )
            if not cookie_header:
                # Fallback: Token aus JSON-Body als Bearer-Cookie simulieren
                body = resp.json() if resp.content else {}
                token = body.get("token", "")
                if token:
                    cookie_header = f"nasdom_token={token}"

            if cookie_header:
                _cookie_cache[base_url] = {
                    "cookie": cookie_header,
                    "expires_at": time.time() + 600,  # 10 Minuten TTL
                }
                logger.debug("NasDom-Login erfolgreich, Cookie gecacht (TTL 10 min).")
                return cookie_header

            logger.debug("NasDom-Login: HTTP 200 aber kein Cookie in Response.")
        else:
            logger.debug(
                "NasDom-Login fehlgeschlagen: HTTP %s", resp.status_code
            )
    except Exception as exc:
        logger.debug("NasDom-Login Exception: %s", exc)

    return None


def _invalidate_cookie(base_url: str) -> None:
    """Entfernt den gecachten Cookie fuer base_url (z.B. nach 401)."""
    _cookie_cache.pop(base_url, None)


async def _get_auth_headers(
    client: httpx.AsyncClient,
    base_url: str,
    username: str | None,
    password: str | None,
) -> dict[str, str]:
    """
    Liefert Auth-Headers fuer nachfolgende Requests.

    Wenn username + password vorhanden: Cookie-Login, gibt {"Cookie": "..."} zurueck.
    Sonst: leere Headers (kein Auth).
    """
    if username and password:
        cookie = await _login_and_get_cookie(client, base_url, username, password)
        if cookie:
            return {"Cookie": cookie}
    return {}


async def get_status(
    base_url: str = "http://192.168.200.169:9090",
    token: str | None = None,
    username: str | None = None,
    password: str | None = None,
) -> SystemStatus:
    """
    Ruft NasDominator-Endpoints auf und berechnet daraus SystemStatus.

    Score-Formel (analog OctoBoss-Pattern):
      40% -- Service erreichbar
      30% -- kritische Services up (via /api/services/monitored oder /api/dashboard)
      20% -- Metriken verfuegbar (CPU/RAM-Daten vorhanden)
      10% -- kein Warn-/Error-Zustand in Dashboard

    username + password: fuer Cookie-Auth via /api/auth/login.
    token: Legacy-Parameter (Bearer-Auth), wird als Fallback-Cookie genutzt wenn
           username/password nicht gesetzt.
    """
    fetched_at = datetime.now(timezone.utc)
    t0 = time.monotonic()
    base = base_url.rstrip("/")

    try:
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=False) as client:
            # ── Schritt 1: Erreichbarkeits-Check (public endpoint) ──────────────
            reachable = False
            auth_setup_complete = False
            try:
                resp_auth = await client.get(f"{base}/api/auth/status")
                if resp_auth.status_code < 500:
                    reachable = True
                    data_auth = resp_auth.json() if resp_auth.is_success else {}
                    auth_setup_complete = bool(data_auth.get("setup_complete", False))
            except Exception as exc:
                logger.debug("NasDominator /api/auth/status: %s", exc)

            dauer_ms = int((time.monotonic() - t0) * 1000)

            if not reachable:
                plog.step(
                    "nasdominator.adapter", "reachability",
                    input={"url": base}, output={"reachable": False},
                    dauer_ms=dauer_ms, ok=False,
                )
                return SystemStatus(
                    system_id="nasdominator",
                    ok=False,
                    score=0,
                    summary="NasDominator nicht erreichbar.",
                    metrics={"latency_ms": dauer_ms},
                    fetched_at=fetched_at,
                    error=f"NasDominator {base} nicht erreichbar",
                )

            # ── Auth-Headers beschaffen ──────────────────────────────────────────
            auth_headers = await _get_auth_headers(client, base, username, password)

            # Fallback: Legacy Bearer-Token
            if not auth_headers and token:
                auth_headers = {"Authorization": f"Bearer {token}"}

            # ── Schritt 2: Dashboard (erfordert Auth) ────────────────────────────
            dashboard_ok = False
            dashboard_data: dict = {}
            has_auth = False
            services_total = 0
            services_up = 0
            containers_running = 0
            containers_total = 0
            has_metrics = False
            cpu_pct: float | None = None
            ram_pct: float | None = None
            storage_pct: float | None = None
            warn_count = 0

            try:
                resp_dash = await client.get(
                    f"{base}/api/dashboard", headers=auth_headers
                )
                if resp_dash.is_success:
                    has_auth = True
                    dashboard_ok = True
                    dashboard_data = resp_dash.json() or {}

                    # RAID / Speicher
                    raid = dashboard_data.get("raid") or {}
                    if isinstance(raid, list) and raid:
                        for r in raid:
                            if str(r.get("status", "")).upper() not in ("NORMAL", "OK", "HEALTHY"):
                                warn_count += 1

                    # Container aus Dashboard
                    containers_dash = dashboard_data.get("containers") or []
                    if isinstance(containers_dash, list):
                        containers_total = len(containers_dash)
                        containers_running = sum(
                            1 for c in containers_dash
                            if str(c.get("status", "")).lower() in ("running", "up")
                        )

                    # System-Load aus Dashboard
                    system_info = dashboard_data.get("system") or {}
                    cpu_val = system_info.get("cpu_usage") or system_info.get("cpu_percent")
                    if cpu_val is not None:
                        try:
                            cpu_pct = float(cpu_val)
                            has_metrics = True
                        except (ValueError, TypeError):
                            pass

                    ram_val = system_info.get("ram_usage") or system_info.get("ram_percent")
                    if ram_val is not None:
                        try:
                            ram_pct = float(ram_val)
                            has_metrics = True
                        except (ValueError, TypeError):
                            pass

                    storage_val = system_info.get("storage_usage") or system_info.get("disk_percent")
                    if storage_val is not None:
                        try:
                            storage_pct = float(storage_val)
                        except (ValueError, TypeError):
                            pass

                elif resp_dash.status_code == 401:
                    # 401 trotz frischem Cookie: Cache leeren + einmal Re-Login
                    if auth_headers.get("Cookie"):
                        logger.debug(
                            "NasDominator Dashboard: 401 trotz gecachtem Cookie — "
                            "Cache geleert, Re-Login wird versucht."
                        )
                        _invalidate_cookie(base)
                        auth_headers = await _get_auth_headers(
                            client, base, username, password
                        )
                        if auth_headers:
                            resp_dash2 = await client.get(
                                f"{base}/api/dashboard", headers=auth_headers
                            )
                            if resp_dash2.is_success:
                                has_auth = True
                                dashboard_ok = True
                                dashboard_data = resp_dash2.json() or {}
                            else:
                                logger.debug(
                                    "NasDominator Dashboard: Re-Login fehlgeschlagen "
                                    "(HTTP %s)", resp_dash2.status_code
                                )
                    else:
                        # Erreichbar aber keine Auth-Credentials -- valider Zustand
                        logger.debug("NasDominator Dashboard: Auth erforderlich (HTTP 401)")
            except Exception as exc:
                logger.debug("NasDominator /api/dashboard: %s", exc)

            # ── Schritt 3: Services/Monitored (wenn Auth vorhanden) ────────────
            if has_auth:
                try:
                    resp_svc = await client.get(
                        f"{base}/api/services/monitored", headers=auth_headers
                    )
                    if resp_svc.is_success:
                        svc_data = resp_svc.json() or []
                        if isinstance(svc_data, list):
                            services_total = len(svc_data)
                            services_up = sum(
                                1 for s in svc_data
                                if str(s.get("status", "")).lower() in ("up", "running", "ok", "healthy")
                            )
                        elif isinstance(svc_data, dict):
                            # Manche APIs wrappen in {"services": [...]}
                            inner = svc_data.get("services") or []
                            services_total = len(inner)
                            services_up = sum(
                                1 for s in inner
                                if str(s.get("status", "")).lower() in ("up", "running", "ok", "healthy")
                            )
                except Exception as exc:
                    logger.debug("NasDominator /api/services/monitored: %s", exc)

                # ── Schritt 4: Metriken (wenn Dashboard keine lieferte) ─────────
                if not has_metrics:
                    try:
                        resp_m = await client.get(
                            f"{base}/api/metrics/latest", headers=auth_headers
                        )
                        if resp_m.is_success:
                            m_data = resp_m.json() or {}
                            cpu_val = m_data.get("cpu_percent") or m_data.get("cpu_usage")
                            if cpu_val is not None:
                                cpu_pct = float(cpu_val)
                                has_metrics = True
                            ram_val = m_data.get("ram_percent") or m_data.get("ram_usage")
                            if ram_val is not None:
                                ram_pct = float(ram_val)
                                has_metrics = True
                            st_val = m_data.get("storage_percent") or m_data.get("disk_usage")
                            if st_val is not None:
                                storage_pct = float(st_val)
                    except Exception as exc:
                        logger.debug("NasDominator /api/metrics/latest: %s", exc)

            # ── Score-Berechnung ─────────────────────────────────────────────────
            dauer_ms = int((time.monotonic() - t0) * 1000)

            # 40% -- erreichbar
            q_reachable = 1.0  # sonst waeren wir oben raus

            # 30% -- Services up (falls Auth vorhanden und Daten da)
            if services_total > 0:
                q_services = services_up / services_total
            elif has_auth:
                # Auth vorhanden aber keine Services-Daten -> neutral 0.5
                q_services = 0.5
                # Containers als Fallback
                if containers_total > 0:
                    q_services = containers_running / containers_total
            elif not has_auth and auth_setup_complete:
                # Kein Auth, Setup abgeschlossen: koennen nicht pruefen -> konservativ 0.3
                q_services = 0.3
            else:
                q_services = 0.0

            # 20% -- Metriken vorhanden
            q_metrics = 1.0 if has_metrics else (0.5 if has_auth else 0.0)

            # 10% -- kein Warn-/Error-Zustand
            q_no_warn = 1.0 if warn_count == 0 else max(0.0, 1.0 - warn_count * 0.3)

            score = int(round(100 * (
                0.40 * q_reachable +
                0.30 * q_services +
                0.20 * q_metrics +
                0.10 * q_no_warn
            )))
            score = max(0, min(100, score))

            # Summary
            has_credentials = bool(username and password)
            if not has_auth and auth_setup_complete and has_credentials:
                summary = (
                    "NasDominator erreichbar, aber Login fehlgeschlagen — "
                    "Credentials pruefen."
                )
            elif not has_auth and auth_setup_complete:
                summary = (
                    "NasDominator erreichbar (v0.10+), Auth erforderlich — "
                    "keine Credential-Konfiguration in MOAG-Settings."
                )
            elif not has_auth:
                summary = "NasDominator erreichbar, aber Setup nicht abgeschlossen."
            elif services_total > 0:
                summary = (
                    f"NasDominator: {services_up}/{services_total} Services up"
                    + (f" · {containers_running}/{containers_total} Container" if containers_total > 0 else "")
                    + (f" · CPU {cpu_pct:.0f}%" if cpu_pct is not None else "")
                    + (f" · RAM {ram_pct:.0f}%" if ram_pct is not None else "")
                    + (f" · {warn_count} Warnungen" if warn_count > 0 else "")
                )
            else:
                summary = (
                    f"NasDominator erreichbar"
                    + (f" · {containers_running}/{containers_total} Container" if containers_total > 0 else "")
                    + (f" · CPU {cpu_pct:.0f}%" if cpu_pct is not None else "")
                    + (f" · RAM {ram_pct:.0f}%" if ram_pct is not None else "")
                )

            metrics: dict = {
                "latency_ms": dauer_ms,
                "has_auth": has_auth,
                "services_total": services_total,
                "services_up": services_up,
                "containers_total": containers_total,
                "containers_running": containers_running,
                "has_metrics": has_metrics,
                "warn_count": warn_count,
            }
            if cpu_pct is not None:
                metrics["cpu_pct"] = round(cpu_pct, 1)
            if ram_pct is not None:
                metrics["ram_pct"] = round(ram_pct, 1)
            if storage_pct is not None:
                metrics["storage_pct"] = round(storage_pct, 1)

            plog.step(
                "nasdominator.adapter", "status",
                input={"url": base},
                output={
                    "reachable": reachable, "has_auth": has_auth,
                    "services_up": services_up, "services_total": services_total,
                    "has_metrics": has_metrics, "score": score,
                },
                dauer_ms=dauer_ms, ok=score >= _OK_THRESHOLD,
            )

            error_msg: str | None = None
            if not has_auth and auth_setup_complete and has_credentials:
                error_msg = "Login fehlgeschlagen — Credentials ungueltig."
            elif not has_auth and auth_setup_complete:
                error_msg = "Keine Auth-Credentials konfiguriert — Dashboard-Daten nicht verfuegbar."

            return SystemStatus(
                system_id="nasdominator",
                ok=score >= _OK_THRESHOLD,
                score=score,
                summary=summary,
                metrics=metrics,
                fetched_at=fetched_at,
                error=error_msg,
            )

    except Exception as exc:
        dauer_ms = int((time.monotonic() - t0) * 1000)
        logger.exception("NasDominator-Adapter Fehler: %s", exc)
        return SystemStatus(
            system_id="nasdominator",
            ok=False,
            score=0,
            summary="NasDominator-Adapter: unerwarteter Fehler.",
            metrics={"latency_ms": dauer_ms},
            fetched_at=fetched_at,
            error=str(exc)[:300],
        )


async def get_services(
    base_url: str = "http://192.168.200.169:9090",
    token: str | None = None,
    username: str | None = None,
    password: str | None = None,
) -> dict:
    """
    Liefert die Liste der ueberwachten Services (Critical-Services-Layer).

    Ruft /api/services/monitored auf.
    Bei 401 nach Re-Login: leere Liste mit Auth-Hinweis.
    """
    base = base_url.rstrip("/")

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            auth_headers = await _get_auth_headers(client, base, username, password)
            if not auth_headers and token:
                auth_headers = {"Authorization": f"Bearer {token}"}

            resp = await client.get(
                f"{base}/api/services/monitored", headers=auth_headers
            )

            # Bei 401: einmal Cache leeren + Re-Login
            if resp.status_code == 401 and auth_headers.get("Cookie"):
                _invalidate_cookie(base)
                auth_headers = await _get_auth_headers(client, base, username, password)
                if auth_headers:
                    resp = await client.get(
                        f"{base}/api/services/monitored", headers=auth_headers
                    )

            if resp.status_code == 401:
                return {
                    "services": [],
                    "auth_required": True,
                    "error": "Auth erforderlich",
                    "fetched_at": datetime.now(timezone.utc).isoformat(),
                }
            resp.raise_for_status()
            data = resp.json()
            services = data if isinstance(data, list) else data.get("services", [])
            return {
                "services": services,
                "auth_required": False,
                "fetched_at": datetime.now(timezone.utc).isoformat(),
            }
    except httpx.HTTPStatusError as exc:
        return {
            "services": [],
            "auth_required": False,
            "error": f"HTTP {exc.response.status_code}",
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as exc:
        return {
            "services": [],
            "auth_required": False,
            "error": str(exc)[:200],
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        }


async def get_metrics(
    base_url: str = "http://192.168.200.169:9090",
    token: str | None = None,
    username: str | None = None,
    password: str | None = None,
) -> dict:
    """
    Liefert den aktuellen Metrik-Snapshot (CPU/RAM/Storage).

    Ruft /api/metrics/latest auf.
    """
    base = base_url.rstrip("/")

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            auth_headers = await _get_auth_headers(client, base, username, password)
            if not auth_headers and token:
                auth_headers = {"Authorization": f"Bearer {token}"}

            resp = await client.get(
                f"{base}/api/metrics/latest", headers=auth_headers
            )

            # Bei 401: einmal Cache leeren + Re-Login
            if resp.status_code == 401 and auth_headers.get("Cookie"):
                _invalidate_cookie(base)
                auth_headers = await _get_auth_headers(client, base, username, password)
                if auth_headers:
                    resp = await client.get(
                        f"{base}/api/metrics/latest", headers=auth_headers
                    )

            if resp.status_code == 401:
                return {
                    "metrics": {},
                    "auth_required": True,
                    "error": "Auth erforderlich",
                    "fetched_at": datetime.now(timezone.utc).isoformat(),
                }
            resp.raise_for_status()
            return {
                "metrics": resp.json() or {},
                "auth_required": False,
                "fetched_at": datetime.now(timezone.utc).isoformat(),
            }
    except httpx.HTTPStatusError as exc:
        return {
            "metrics": {},
            "auth_required": False,
            "error": f"HTTP {exc.response.status_code}",
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as exc:
        return {
            "metrics": {},
            "auth_required": False,
            "error": str(exc)[:200],
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        }


async def get_containers(
    base_url: str = "http://192.168.200.169:9090",
    token: str | None = None,
    username: str | None = None,
    password: str | None = None,
) -> dict:
    """
    Liefert die Container-Liste aus NasDominator.

    Ruft /api/services/containers auf.
    """
    base = base_url.rstrip("/")

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            auth_headers = await _get_auth_headers(client, base, username, password)
            if not auth_headers and token:
                auth_headers = {"Authorization": f"Bearer {token}"}

            resp = await client.get(
                f"{base}/api/services/containers", headers=auth_headers
            )

            # Bei 401: einmal Cache leeren + Re-Login
            if resp.status_code == 401 and auth_headers.get("Cookie"):
                _invalidate_cookie(base)
                auth_headers = await _get_auth_headers(client, base, username, password)
                if auth_headers:
                    resp = await client.get(
                        f"{base}/api/services/containers", headers=auth_headers
                    )

            if resp.status_code == 401:
                return {
                    "containers": [],
                    "auth_required": True,
                    "error": "Auth erforderlich",
                    "fetched_at": datetime.now(timezone.utc).isoformat(),
                }
            resp.raise_for_status()
            data = resp.json()
            containers = data if isinstance(data, list) else data.get("containers", [])
            return {
                "containers": containers,
                "auth_required": False,
                "fetched_at": datetime.now(timezone.utc).isoformat(),
            }
    except httpx.HTTPStatusError as exc:
        return {
            "containers": [],
            "auth_required": False,
            "error": f"HTTP {exc.response.status_code}",
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as exc:
        return {
            "containers": [],
            "auth_required": False,
            "error": str(exc)[:200],
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        }


async def trigger_services_sync(
    base_url: str = "http://192.168.200.169:9090",
    token: str | None = None,
    username: str | None = None,
    password: str | None = None,
) -> dict:
    """
    Triggert NasDominator-Services-Sync (POST /api/services/sync).

    Falls der Endpoint nicht vorhanden ist, wird stattdessen der Adapter
    neu aufgerufen und der aktuelle Status zurueckgegeben (MOAG-seitiger
    'Refresh' ohne serverseitigen Trigger).
    """
    base = base_url.rstrip("/")

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            auth_headers = await _get_auth_headers(client, base, username, password)
            if not auth_headers and token:
                auth_headers = {"Authorization": f"Bearer {token}"}
            if not auth_headers.get("Content-Type"):
                auth_headers = dict(auth_headers)
                auth_headers["Content-Type"] = "application/json"

            # Erster Versuch: serverseitiger Sync-Trigger
            resp = await client.post(
                f"{base}/api/services/sync", headers=auth_headers, json={}
            )

            # Bei 401: einmal Cache leeren + Re-Login
            if resp.status_code == 401 and "Cookie" in auth_headers:
                _invalidate_cookie(base)
                auth_headers = await _get_auth_headers(client, base, username, password)
                if not auth_headers.get("Content-Type"):
                    auth_headers = dict(auth_headers)
                    auth_headers["Content-Type"] = "application/json"
                if auth_headers.get("Cookie"):
                    resp = await client.post(
                        f"{base}/api/services/sync", headers=auth_headers, json={}
                    )

            if resp.status_code == 401:
                return {
                    "triggered": False,
                    "auth_required": True,
                    "error": "Auth erforderlich fuer Services-Sync",
                    "fetched_at": datetime.now(timezone.utc).isoformat(),
                }
            if resp.is_success:
                return {
                    "triggered": True,
                    "auth_required": False,
                    "result": resp.json() if resp.content else {},
                    "fetched_at": datetime.now(timezone.utc).isoformat(),
                }
            if resp.status_code == 404:
                # Endpoint existiert nicht -- Fallback: Adapter-Refresh
                status = await get_status(
                    base_url=base_url, token=token,
                    username=username, password=password,
                )
                return {
                    "triggered": False,
                    "fallback": "Adapter-Refresh (kein serverseitiger Sync-Endpoint)",
                    "score": status.score,
                    "summary": status.summary,
                    "fetched_at": datetime.now(timezone.utc).isoformat(),
                }
            return {
                "triggered": False,
                "error": f"HTTP {resp.status_code}",
                "fetched_at": datetime.now(timezone.utc).isoformat(),
            }
    except Exception as exc:
        return {
            "triggered": False,
            "error": str(exc)[:200],
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        }
