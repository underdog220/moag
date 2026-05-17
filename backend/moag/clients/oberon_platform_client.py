"""OberonPlatformClient — HTTP-Wrapper fuer Oberon-Plattform-Endpoints.

Endpoints:
  GET /api/v2/instances            — aktive Oberon-Instanzen
  GET /api/v2/pii/tuning           — PII-Tuning-Konfiguration
  GET /api/v2/database/status      — DB-Broker-Status
  GET /api/v2/contract/capabilities — API-Kontrakt / verfuegbare Faehigkeiten
  GET /api/v2/platform/status      — Plattform-Gesundheitsstatus

Getrennt von CockpitClient (Admin-Token), weil diese Endpoints keine
Cockpit-Admin-Auth benoetigen — Standard-Bearer-Token reicht.

ETag-Caching: analog zu CockpitClient (wiederverwendet _ETagCache aus
oberon_cockpit_client).

Exception-Hierarchie identisch:
  PlatformUnavailable  — HTTP 5xx, Timeout, ConnectError
  PlatformError        — HTTP 4xx
"""
from __future__ import annotations

import logging
import time
from typing import Any, Optional

import httpx

from moag.clients.oberon_cockpit_client import _ETagCache
from moag.pipeline_hooks import plog

logger = logging.getLogger("moag.clients.oberon_platform")


# ── Exceptions ───────────────────────────────────────────────────────────────


class PlatformUnavailable(Exception):
    """Oberon Platform-Endpoint nicht erreichbar (5xx, Timeout, ConnectError)."""


class PlatformError(Exception):
    """Oberon Platform hat geantwortet, aber mit Fehler (4xx).

    Attribute:
        status_code — HTTP-Status (z.B. 403, 404)
        body        — Response-Body als Text
    """

    def __init__(self, message: str, status_code: int | None = None, body: Any = None):
        super().__init__(message)
        self.status_code = status_code
        self.body = body


# ── OberonPlatformClient ─────────────────────────────────────────────────────


class OberonPlatformClient:
    """Typsicherer HTTP-Client fuer Oberon-Plattform-Endpoints.

    Analog zu CockpitClient, aber fuer /api/v2/* (non-cockpit) Endpoints.

    Beispiel:
        client = OberonPlatformClient(base_url="http://192.168.200.169:17900", token="...")
        instances = client.get_instances()

    Fuer Tests: `client`-Parameter injizieren:
        transport = httpx.MockTransport(handler)
        mock_cli = httpx.Client(base_url="http://mock", transport=transport)
        platform = OberonPlatformClient(base_url="http://mock", token="test", client=mock_cli)
    """

    def __init__(
        self,
        base_url: str,
        token: Optional[str] = None,
        timeout_s: float = 5.0,
        client: Optional[httpx.Client] = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.token = token or ""
        self.timeout_s = timeout_s
        self._etag = _ETagCache()

        if client is not None:
            self._client = client
            self._owns_client = False
        else:
            self._client = httpx.Client(
                base_url=self.base_url,
                headers=self._auth_headers(),
                timeout=self.timeout_s,
            )
            self._owns_client = True

    def close(self) -> None:
        if self._owns_client:
            try:
                self._client.close()
            except Exception:
                pass

    def __enter__(self) -> "OberonPlatformClient":
        return self

    def __exit__(self, *exc: Any) -> None:
        self.close()

    def _auth_headers(self) -> dict[str, str]:
        if not self.token:
            return {}
        return {"Authorization": f"Bearer {self.token}"}

    def _get(self, path: str, params: Optional[dict[str, Any]] = None) -> Any:
        """GET-Request mit ETag-Caching. Gibt den geparsten JSON-Body zurueck.

        Wirft:
          PlatformUnavailable bei 5xx, Timeout, ConnectError
          PlatformError       bei 4xx
        """
        url = self.base_url + path
        headers = self._auth_headers()

        cache_key = path if not params else path + "?" + "&".join(
            f"{k}={v}" for k, v in sorted((params or {}).items())
        )

        cached_etag = self._etag.get_etag(cache_key)
        if cached_etag:
            headers["If-None-Match"] = cached_etag

        t0 = time.monotonic()
        resp: httpx.Response | None = None
        try:
            resp = self._client.get(url, params=params, headers=headers)
        except httpx.TimeoutException as exc:
            dauer_ms = int((time.monotonic() - t0) * 1000)
            plog.step(
                "platform.client", "get",
                input={"path": path}, output={"error": "timeout"},
                dauer_ms=dauer_ms, ok=False,
            )
            raise PlatformUnavailable(f"Platform-Timeout ({self.timeout_s}s): {path}") from exc
        except (httpx.ConnectError, httpx.HTTPError, OSError) as exc:
            dauer_ms = int((time.monotonic() - t0) * 1000)
            plog.step(
                "platform.client", "get",
                input={"path": path}, output={"error": str(exc)},
                dauer_ms=dauer_ms, ok=False,
            )
            raise PlatformUnavailable(f"Platform-Verbindungsfehler: {exc}") from exc

        dauer_ms = int((time.monotonic() - t0) * 1000)

        if resp.status_code == 304:
            cached_body = self._etag.get_body(cache_key)
            plog.step(
                "platform.client", "get",
                input={"path": path}, output={"status": 304, "cache_hit": True},
                dauer_ms=dauer_ms, ok=True,
            )
            if cached_body is not None:
                return cached_body
            logger.warning("Platform 304 ohne Cache-Body: %s", cache_key)

        if resp.status_code >= 500:
            plog.step(
                "platform.client", "get",
                input={"path": path}, output={"status": resp.status_code},
                dauer_ms=dauer_ms, ok=False,
            )
            raise PlatformUnavailable(
                f"Platform HTTP {resp.status_code}: {path} — {resp.text[:200]}"
            )

        if resp.status_code >= 400:
            plog.step(
                "platform.client", "get",
                input={"path": path}, output={"status": resp.status_code},
                dauer_ms=dauer_ms, ok=False,
            )
            raise PlatformError(
                f"Platform HTTP {resp.status_code}: {path}",
                status_code=resp.status_code,
                body=resp.text,
            )

        body = resp.json()
        new_etag = resp.headers.get("etag") or resp.headers.get("ETag")
        if new_etag:
            self._etag.store(cache_key, new_etag, body)

        plog.step(
            "platform.client", "get",
            input={"path": path},
            output={"status": resp.status_code, "bytes": len(resp.content)},
            dauer_ms=dauer_ms, ok=True,
        )
        return body

    # ── Plattform-Endpoints ──────────────────────────────────────────────────

    def get_instances(self) -> Any:
        """GET /api/v2/instances — Aktive Oberon-Instanzen (Liste)."""
        return self._get("/api/v2/instances")

    def get_pii_tuning(self) -> Any:
        """GET /api/v2/pii/tuning — PII-Tuning-Konfiguration."""
        return self._get("/api/v2/pii/tuning")

    def get_db_broker_status(self) -> Any:
        """GET /api/v2/database/status — DB-Broker-Status aller Provisioning-Datenbanken."""
        return self._get("/api/v2/database/status")

    def get_contract_capabilities(self) -> Any:
        """GET /api/v2/contract/capabilities — API-Kontrakt-Faehigkeiten."""
        return self._get("/api/v2/contract/capabilities")

    def get_platform_status(self) -> Any:
        """GET /api/v2/platform/status — Plattform-Gesundheitsstatus."""
        return self._get("/api/v2/platform/status")

    def get_dsgvo_status(self) -> Any:
        """GET /api/v2/dsgvo/status — DSGVO-Engine-Status."""
        return self._get("/api/v2/dsgvo/status")
