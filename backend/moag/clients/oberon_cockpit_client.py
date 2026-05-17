"""CockpitClient — HTTP-Wrapper fuer die Oberon Cockpit-API.

Endpoints: /api/v2/admin/cockpit/{providers,calls,cost,audit,smoke}
Seit oberon-dbdd2d0 (2026-05-16) live.

Auth-Reihenfolge:
  1. Authorization: Bearer <token> (bevorzugt)
  2. X-DevLoop-Token: <token>  (Fallback wenn kein Bearer-Token)

Exception-Hierarchie:
  CockpitUnavailable  — HTTP 5xx, Timeout, ConnectError
  CockpitError        — HTTP 4xx (inkl. 403 bei falschem Token)

Kein Retry — Konsumenten (Routes/Tasks) entscheiden Wiederholung.

ETag-Cache: in-memory Dict pro CockpitClient-Instanz.
  - Setzt If-None-Match auf GET-Requests
  - Bei HTTP 304: liefert letzten gecachten Body zurueck
  - Bei HTTP 200: aktualisiert den Cache

Live-Verifiziert 2026-05-17: OBERON_TOKEN funktioniert auf /cockpit/*-
Endpoints — der frühere Hinweis auf einen separaten Admin-Token war veraltet
(Oberon hat den Token-Check für /cockpit erweitert). Bearer + X-DevLoop-Token
werden beide akzeptiert.
Mocks bauen auf Fixtures aus test_oberon_cockpit_schemas.py.
"""
from __future__ import annotations

import logging
import time
from datetime import datetime
from typing import Any, Optional
from urllib.parse import urlencode

import httpx

from moag.clients.oberon_cockpit_schemas import (
    AuditResponse,
    CallsResponse,
    CostGroupBy,
    CostResponse,
    ProvidersResponse,
    SmokeResponse,
)
from moag.pipeline_hooks import plog

logger = logging.getLogger("moag.clients.oberon_cockpit")

# Oberon Cockpit-API-Prefix
_COCKPIT = "/api/v2/admin/cockpit"


# ── Exceptions ──────────────────────────────────────────────────────────────


class CockpitUnavailable(Exception):
    """Oberon Cockpit-Endpoint nicht erreichbar (5xx, Timeout, ConnectError)."""


class CockpitError(Exception):
    """Oberon Cockpit hat geantwortet, aber mit Fehler (4xx).

    Attribute:
        status_code  — HTTP-Status (z.B. 403, 404)
        body         — Response-Body als Text (zum Debuggen)
    """

    def __init__(self, message: str, status_code: int | None = None, body: Any = None):
        super().__init__(message)
        self.status_code = status_code
        self.body = body


# ── ETag-Cache (in-memory, pro Instanz) ─────────────────────────────────────


class _ETagCache:
    """Minimaler ETag-Cache fuer Cockpit-GET-Requests.

    Dict-basiert, in-memory. Pro-Process reicht das, da der GUI-Server
    ein Worker-Prozess ist (kein Multi-Worker-Setup).
    """

    def __init__(self) -> None:
        # {path: (etag_str, body_dict)}
        self._cache: dict[str, tuple[str, Any]] = {}

    def get_etag(self, path: str) -> Optional[str]:
        """Gibt den zuletzt bekannten ETag fuer `path` zurueck oder None."""
        entry = self._cache.get(path)
        return entry[0] if entry else None

    def get_body(self, path: str) -> Optional[Any]:
        """Gibt den gecachten Body fuer `path` zurueck (bei 304-Antwort)."""
        entry = self._cache.get(path)
        return entry[1] if entry else None

    def store(self, path: str, etag: str, body: Any) -> None:
        """Speichert ETag + Body fuer `path`."""
        self._cache[path] = (etag, body)

    def invalidate(self, path: str) -> None:
        self._cache.pop(path, None)


# ── CockpitClient ────────────────────────────────────────────────────────────


class CockpitClient:
    """Typsicherer HTTP-Client fuer die Oberon Cockpit-API.

    Beispiel:
        client = CockpitClient(base_url="http://192.168.200.169:17900", token="...")
        smoke = client.get_smoke()
        print(smoke.summary.verdict)  # "PASS" / "WARN" / "FAIL"

    Fuer Tests: `client`-Parameter injizieren (httpx.Client mit MockTransport):
        transport = httpx.MockTransport(handler)
        mock_cli = httpx.Client(base_url="http://mock", transport=transport)
        cockpit = CockpitClient(base_url="http://mock", token="test", client=mock_cli)
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

    def __enter__(self) -> "CockpitClient":
        return self

    def __exit__(self, *exc: Any) -> None:
        self.close()

    # ── Auth-Headers ────────────────────────────────────────────────────────

    def _auth_headers(self) -> dict[str, str]:
        """Baut Auth-Header. Bearer bevorzugt, X-DevLoop-Token als Fallback."""
        if not self.token:
            return {}
        # Bearer ist der bevorzugte Standard-Weg gemaess Oberon-Doku
        return {"Authorization": f"Bearer {self.token}"}

    # ── GET-Hilfsmethode mit ETag ────────────────────────────────────────────

    @staticmethod
    def _cache_key(path: str, params: Optional[dict[str, Any]]) -> str:
        """Bildet einen eindeutigen Cache-Schluessel aus Pfad + sortierten Query-Parametern.

        Beispiel: "/api/v2/admin/cockpit/cost" + {"group_by": "day", "from": "..."} ->
                  "/api/v2/admin/cockpit/cost?from=...&group_by=day"
        """
        if not params:
            return path
        qs = urlencode(sorted(params.items()))
        return f"{path}?{qs}"

    def _get(self, path: str, params: Optional[dict[str, Any]] = None) -> Any:
        """Fuehrt einen GET-Request durch, nutzt ETag-Cache bei 304.

        Cache-Key besteht aus Pfad + sortierten Query-Parametern, damit
        z.B. /cost?group_by=client und /cost?group_by=day separate Eintraege haben.

        Gibt den geparsten JSON-Body zurueck.

        Wirft:
          CockpitUnavailable bei 5xx, Timeout, ConnectError
          CockpitError       bei 4xx
        """
        url = self.base_url + path
        headers = self._auth_headers()

        # Cache-Key: Pfad + sortierte Query-Parameter
        cache_key = self._cache_key(path, params)

        # ETag setzen falls vorhanden
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
                "cockpit.client",
                "get",
                input={"path": path, "cache_key": cache_key},
                output={"error": "timeout", "cache_hit": False},
                dauer_ms=dauer_ms,
                ok=False,
            )
            raise CockpitUnavailable(f"Cockpit-Timeout ({self.timeout_s}s): {path}") from exc
        except (httpx.ConnectError, httpx.HTTPError, OSError) as exc:
            dauer_ms = int((time.monotonic() - t0) * 1000)
            plog.step(
                "cockpit.client",
                "get",
                input={"path": path, "cache_key": cache_key},
                output={"error": str(exc), "cache_hit": False},
                dauer_ms=dauer_ms,
                ok=False,
            )
            raise CockpitUnavailable(f"Cockpit-Verbindungsfehler: {exc}") from exc

        dauer_ms = int((time.monotonic() - t0) * 1000)

        # 304 Not Modified — gecachten Body liefern
        if resp.status_code == 304:
            cached_body = self._etag.get_body(cache_key)
            plog.step(
                "cockpit.client",
                "get",
                input={"path": path, "cache_key": cache_key},
                output={"status": 304, "cache_hit": True, "bytes": 0},
                dauer_ms=dauer_ms,
                ok=True,
            )
            if cached_body is not None:
                logger.debug("Cockpit 304 Not Modified: %s — Cache-Hit", cache_key)
                return cached_body
            # Cache leer obwohl ETag gesetzt war — Konsistenzfehler, ignorieren
            logger.warning("Cockpit 304 ohne Cache-Body: %s", cache_key)

        # 5xx -> CockpitUnavailable
        if resp.status_code >= 500:
            plog.step(
                "cockpit.client",
                "get",
                input={"path": path, "cache_key": cache_key},
                output={"status": resp.status_code, "body": resp.text[:200], "cache_hit": False},
                dauer_ms=dauer_ms,
                ok=False,
            )
            raise CockpitUnavailable(
                f"Cockpit HTTP {resp.status_code}: {path} — {resp.text[:200]}"
            )

        # 4xx -> CockpitError
        if resp.status_code >= 400:
            plog.step(
                "cockpit.client",
                "get",
                input={"path": path, "cache_key": cache_key},
                output={"status": resp.status_code, "body": resp.text[:200], "cache_hit": False},
                dauer_ms=dauer_ms,
                ok=False,
            )
            raise CockpitError(
                f"Cockpit HTTP {resp.status_code}: {path}",
                status_code=resp.status_code,
                body=resp.text,
            )

        # 2xx — JSON parsen + ETag-Cache aktualisieren
        body = resp.json()
        resp_size = len(resp.content)

        new_etag = resp.headers.get("etag") or resp.headers.get("ETag")
        if new_etag:
            self._etag.store(cache_key, new_etag, body)

        plog.step(
            "cockpit.client",
            "get",
            input={"path": path, "cache_key": cache_key},
            output={"status": resp.status_code, "bytes": resp_size, "cache_hit": False, "etag": new_etag},
            dauer_ms=dauer_ms,
            ok=True,
        )
        logger.debug(
            "Cockpit GET %s → HTTP %s (%d Bytes, %d ms, ETag=%s)",
            cache_key, resp.status_code, resp_size, dauer_ms, new_etag,
        )
        return body

    # ── Cockpit-Endpoints ────────────────────────────────────────────────────

    def get_providers(self) -> ProvidersResponse:
        """GET /api/v2/admin/cockpit/providers.

        Liefert die Liste aller konfigurierten LLM-Provider mit Health-Status.
        Oberon liefert ein JSON-Array (kein Wrapper) — wir wrappen in ProvidersResponse.
        """
        path = f"{_COCKPIT}/providers"
        raw = self._get(path)
        # Oberon liefert direkt eine Liste, nicht {"providers": [...]}
        if isinstance(raw, list):
            return ProvidersResponse.model_validate({"providers": raw})
        # Fallback: vielleicht schon ein Dict-Wrapper
        return ProvidersResponse.model_validate(raw if isinstance(raw, dict) else {"providers": []})

    def get_calls(
        self,
        *,
        since: Optional[datetime | str] = None,
        limit: int = 100,
        client_id: Optional[str] = None,
        provider_id: Optional[str] = None,
    ) -> CallsResponse:
        """GET /api/v2/admin/cockpit/calls.

        Parameter:
            since       — Cursor fuer Pagination (datetime ODER ISO-8601-String)
            limit       — Max. Anzahl Eintraege (1-500, Default 100)
            client_id   — Filter auf Client-ID
            provider_id — Filter auf Provider-ID
        """
        path = f"{_COCKPIT}/calls"
        params: dict[str, Any] = {"limit": limit}
        if since is not None:
            params["since"] = since.isoformat() if isinstance(since, datetime) else since
        if client_id:
            params["clientId"] = client_id
        if provider_id:
            params["providerId"] = provider_id
        raw = self._get(path, params=params)
        return CallsResponse.model_validate(raw)

    def get_cost(
        self,
        *,
        from_: datetime | str,
        to: datetime | str,
        group_by: CostGroupBy = "day",
    ) -> CostResponse:
        """GET /api/v2/admin/cockpit/cost.

        Parameter:
            from_    — Anfang des Zeitraums (datetime ODER ISO-8601-String)
            to       — Ende des Zeitraums (datetime ODER ISO-8601-String)
            group_by — Gruppierung: 'client' | 'model' | 'day' | 'provider'
        """
        path = f"{_COCKPIT}/cost"
        params: dict[str, Any] = {
            "from": from_.isoformat() if isinstance(from_, datetime) else from_,
            "to": to.isoformat() if isinstance(to, datetime) else to,
            "group_by": group_by,
        }
        raw = self._get(path, params=params)
        return CostResponse.model_validate(raw)

    def get_audit(
        self,
        *,
        limit: int = 100,
        since: Optional[datetime | str] = None,
        pii_type: Optional[str] = None,
        client_id: Optional[str] = None,
    ) -> AuditResponse:
        """GET /api/v2/admin/cockpit/audit.

        Parameter:
            limit     — Max. Anzahl Events (1-500, Default 100)
            since     — Cursor (datetime ODER ISO-8601-String) fuer Pagination
            pii_type  — Filter auf PII-Typ (z.B. 'IBAN')
            client_id — Filter auf Client-ID
        """
        path = f"{_COCKPIT}/audit"
        params: dict[str, Any] = {"limit": limit}
        if since is not None:
            params["since"] = since.isoformat() if isinstance(since, datetime) else since
        if pii_type:
            params["pii_type"] = pii_type
        if client_id:
            params["client_id"] = client_id
        raw = self._get(path, params=params)
        return AuditResponse.model_validate(raw)

    def get_smoke(self) -> SmokeResponse:
        """GET /api/v2/admin/cockpit/smoke.

        Live-Health-Snapshot aller 6 Sub-Checks (parallel gemessen, kein Pre-Cache).
        """
        path = f"{_COCKPIT}/smoke"
        raw = self._get(path)
        return SmokeResponse.model_validate(raw)
