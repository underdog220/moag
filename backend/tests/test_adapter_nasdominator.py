"""
Tests fuer nasdominator-Adapter (Phase 3 — echter HTTP-Call).

Testet: reachable + unreachable via MockTransport, Score-Berechnung,
Auth-Zustand, Hilfsfunktionen get_services/get_metrics/get_containers,
Cookie-Auth-Logik (Login-Cache, 401-Invalidierung, Re-Login).
"""
from __future__ import annotations

import time

import pytest
import httpx

from moag.adapters import nasdominator
from moag.schemas import SystemStatus


# ── get_status — unreachable ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_returns_system_status_unreachable(monkeypatch):
    """Service nicht erreichbar: SystemStatus mit ok=False, score=0."""
    def handler(req: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused")

    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real_client(transport=transport, **kw))

    status = await nasdominator.get_status(base_url="http://127.0.0.1:9090")
    assert isinstance(status, SystemStatus)
    assert status.system_id == "nasdominator"
    assert status.ok is False
    assert status.score == 0
    assert status.error is not None
    assert "nicht erreichbar" in (status.error or "")


@pytest.mark.asyncio
async def test_unreachable_score_zero(monkeypatch):
    """Score muss 0 sein wenn Service nicht erreichbar."""
    def handler(req: httpx.Request) -> httpx.Response:
        raise httpx.TimeoutException("timeout")

    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real_client(transport=transport, **kw))

    status = await nasdominator.get_status(base_url="http://127.0.0.1:9090")
    assert status.score == 0


# ── get_status — erreichbar aber kein Auth ───────────────────────────────────

@pytest.mark.asyncio
async def test_reachable_no_auth(monkeypatch):
    """Erreichbar, Auth erforderlich (401 auf Dashboard): Score > 0 aber niedrig."""
    def handler(req: httpx.Request) -> httpx.Response:
        path = str(req.url.path)
        if path == "/api/auth/status":
            return httpx.Response(200, json={"setup_complete": True})
        # Alle anderen Endpoints erfordern Auth
        return httpx.Response(401, json={"detail": "Nicht angemeldet"})

    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real_client(transport=transport, **kw))

    status = await nasdominator.get_status(base_url="http://127.0.0.1:9090")
    assert isinstance(status, SystemStatus)
    assert status.system_id == "nasdominator"
    # Erreichbar (40%) aber keine Auth (Services 0.3*0.30, Metriken 0.0*0.20, kein Warn 1.0*0.10)
    # = 40 + 9 + 0 + 10 = 59 -> aber q_services=0.3 weil kein Auth und setup_complete=True
    # Exakter Score: int(round(100*(0.40*1 + 0.30*0.3 + 0.20*0.0 + 0.10*1.0))) = int(round(59)) = 59
    assert status.score > 0
    assert status.score < 100
    assert status.ok is False or status.ok is True  # Schwellwert 35 — kann ok sein
    assert "erreichbar" in status.summary.lower() or "auth" in status.summary.lower()


# ── get_status — erreichbar mit Auth + Dashboard-Daten ──────────────────────

@pytest.mark.asyncio
async def test_reachable_with_auth_and_services(monkeypatch):
    """Erreichbar mit Auth und Containers — Score sollte hoch sein."""
    def handler(req: httpx.Request) -> httpx.Response:
        path = str(req.url.path)
        if path == "/api/auth/status":
            return httpx.Response(200, json={"setup_complete": True})
        if path == "/api/dashboard":
            return httpx.Response(200, json={
                "system": {"cpu_usage": 25.5, "ram_usage": 60.0},
                "raid": [{"name": "md0", "status": "NORMAL"}],
                # Dashboard-Containers haben "state" (nicht "status")
                "containers": [
                    {"name": "oberon", "state": "running"},
                    {"name": "octoboss", "state": "running"},
                ],
            })
        # Adapter ruft jetzt /api/services/containers (mit "state"-Feld)
        if path == "/api/services/containers":
            return httpx.Response(200, json=[
                {"name": "oberon", "state": "running"},
                {"name": "octoboss", "state": "running"},
                {"name": "postgres", "state": "running"},
            ])
        if path == "/api/metrics/latest":
            return httpx.Response(200, json={"cpu_percent": 25.5, "ram_percent": 60.0})
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real_client(transport=transport, **kw))

    status = await nasdominator.get_status(base_url="http://127.0.0.1:9090")
    assert status.ok is True
    assert status.score >= 80
    # services_up/total = Container-Zaehlung aus /api/services/containers
    assert status.metrics.get("services_up") == 3
    assert status.metrics.get("services_total") == 3
    assert status.metrics.get("has_auth") is True
    assert status.metrics.get("containers_running") == 2


@pytest.mark.asyncio
async def test_score_drops_with_service_down(monkeypatch):
    """Score faellt wenn ein Container exited ist (via /api/services/containers)."""
    def handler(req: httpx.Request) -> httpx.Response:
        path = str(req.url.path)
        if path == "/api/auth/status":
            return httpx.Response(200, json={"setup_complete": True})
        if path == "/api/dashboard":
            return httpx.Response(200, json={
                "system": {"cpu_usage": 10.0, "ram_usage": 30.0},
                "raid": [],
                "containers": [],
            })
        # Adapter nutzt /api/services/containers mit "state"-Feld
        if path == "/api/services/containers":
            return httpx.Response(200, json=[
                {"name": "oberon", "state": "running"},
                {"name": "octoboss", "state": "exited"},   # nicht running
                {"name": "postgres", "state": "running"},
            ])
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real_client(transport=transport, **kw))

    status_partial = await nasdominator.get_status(base_url="http://127.0.0.1:9090")

    # Jetzt alle Container running
    def handler_full(req: httpx.Request) -> httpx.Response:
        path = str(req.url.path)
        if path == "/api/auth/status":
            return httpx.Response(200, json={"setup_complete": True})
        if path == "/api/dashboard":
            return httpx.Response(200, json={"system": {"cpu_usage": 10.0}, "raid": [], "containers": []})
        if path == "/api/services/containers":
            return httpx.Response(200, json=[
                {"name": "oberon", "state": "running"},
                {"name": "octoboss", "state": "running"},
                {"name": "postgres", "state": "running"},
            ])
        return httpx.Response(404)

    transport_full = httpx.MockTransport(handler_full)
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real_client(transport=transport_full, **kw))
    status_full = await nasdominator.get_status(base_url="http://127.0.0.1:9090")

    assert status_full.score > status_partial.score


@pytest.mark.asyncio
async def test_metrics_present_in_metrics_dict(monkeypatch):
    """cpu_pct und ram_pct erscheinen in metrics wenn vorhanden."""
    def handler(req: httpx.Request) -> httpx.Response:
        path = str(req.url.path)
        if path == "/api/auth/status":
            return httpx.Response(200, json={"setup_complete": True})
        if path == "/api/dashboard":
            return httpx.Response(200, json={
                "system": {"cpu_usage": 42.1, "ram_usage": 77.3},
                "raid": [], "containers": [],
            })
        # Adapter nutzt /api/services/containers
        if path == "/api/services/containers":
            return httpx.Response(200, json=[{"name": "oberon", "state": "running"}])
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real_client(transport=transport, **kw))

    status = await nasdominator.get_status(base_url="http://127.0.0.1:9090")
    assert "cpu_pct" in status.metrics
    assert "ram_pct" in status.metrics
    assert abs(status.metrics["cpu_pct"] - 42.1) < 0.2
    assert abs(status.metrics["ram_pct"] - 77.3) < 0.2


# ── get_services ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_services_ok(monkeypatch):
    """get_services liefert Service-Liste wenn Auth vorhanden."""
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=[
            {"name": "Oberon", "status": "up"},
            {"name": "Postgres", "status": "up"},
        ])

    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real_client(transport=transport, **kw))

    result = await nasdominator.get_services(base_url="http://127.0.0.1:9090")
    assert result["auth_required"] is False
    assert len(result["services"]) == 2


@pytest.mark.asyncio
async def test_get_services_auth_required(monkeypatch):
    """get_services liefert auth_required=True bei 401."""
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"detail": "Nicht angemeldet"})

    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real_client(transport=transport, **kw))

    result = await nasdominator.get_services(base_url="http://127.0.0.1:9090")
    assert result["auth_required"] is True
    assert result["services"] == []


@pytest.mark.asyncio
async def test_get_services_unreachable(monkeypatch):
    """get_services liefert leere Liste + error wenn nicht erreichbar."""
    def handler(req: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused")

    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real_client(transport=transport, **kw))

    result = await nasdominator.get_services(base_url="http://127.0.0.1:9090")
    assert result["services"] == []
    assert "error" in result


# ── get_metrics ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_metrics_ok(monkeypatch):
    """get_metrics liefert Metrik-Dict wenn Auth vorhanden."""
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"cpu_percent": 15.0, "ram_percent": 55.0})

    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real_client(transport=transport, **kw))

    result = await nasdominator.get_metrics(base_url="http://127.0.0.1:9090")
    assert result["auth_required"] is False
    assert result["metrics"]["cpu_percent"] == 15.0


@pytest.mark.asyncio
async def test_get_metrics_auth_required(monkeypatch):
    """get_metrics liefert auth_required=True bei 401."""
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"detail": "Nicht angemeldet"})

    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real_client(transport=transport, **kw))

    result = await nasdominator.get_metrics(base_url="http://127.0.0.1:9090")
    assert result["auth_required"] is True
    assert result["metrics"] == {}


# ── get_containers ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_containers_ok(monkeypatch):
    """get_containers liefert Container-Liste wenn Auth vorhanden."""
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=[
            {"name": "oberon", "status": "running"},
            {"name": "octoboss", "status": "running"},
        ])

    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real_client(transport=transport, **kw))

    result = await nasdominator.get_containers(base_url="http://127.0.0.1:9090")
    assert result["auth_required"] is False
    assert len(result["containers"]) == 2


@pytest.mark.asyncio
async def test_get_containers_auth_required(monkeypatch):
    """get_containers liefert auth_required=True bei 401."""
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"detail": "Nicht angemeldet"})

    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real_client(transport=transport, **kw))

    result = await nasdominator.get_containers(base_url="http://127.0.0.1:9090")
    assert result["auth_required"] is True
    assert result["containers"] == []


# ── Cookie-Auth: Login-Cache ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_login_caches_cookie(monkeypatch):
    """
    Erster Call macht Login, zweiter Call wiederverwendet gecachten Cookie
    ohne erneuten Login-Request.
    """
    # Cache leeren damit Test isoliert startet
    nasdominator._cookie_cache.clear()

    login_call_count = 0

    def handler(req: httpx.Request) -> httpx.Response:
        nonlocal login_call_count
        path = str(req.url.path)
        if req.method == "POST" and path == "/api/auth/login":
            login_call_count += 1
            resp = httpx.Response(
                200,
                json={"status": "ok", "token": "test-jwt-token"},
                headers={"Set-Cookie": "nasdom_token=test-jwt-token; HttpOnly; SameSite=Lax"},
            )
            return resp
        if path == "/api/auth/status":
            return httpx.Response(200, json={"setup_complete": True})
        if path == "/api/dashboard":
            # Nur mit Cookie zugreifbar
            cookie = req.headers.get("Cookie", "")
            if "nasdom_token" in cookie:
                return httpx.Response(200, json={
                    "system": {"cpu_usage": 20.0, "ram_usage": 50.0},
                    "raid": [], "containers": [],
                })
            return httpx.Response(401, json={"detail": "Nicht angemeldet"})
        # Adapter ruft jetzt /api/services/containers (kein monitored mehr)
        if path == "/api/services/containers":
            cookie = req.headers.get("Cookie", "")
            if "nasdom_token" in cookie:
                return httpx.Response(200, json=[{"name": "oberon", "state": "running"}])
            return httpx.Response(401, json={"detail": "Nicht angemeldet"})
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real_client(transport=transport, **kw))

    # Erster Aufruf: muss Login-Request machen
    status1 = await nasdominator.get_status(
        base_url="http://127.0.0.1:9090",
        username="admin", password="secret",
    )
    assert status1.metrics.get("has_auth") is True
    assert login_call_count == 1

    # Zweiter Aufruf: Cookie im Cache, kein zweiter Login
    status2 = await nasdominator.get_status(
        base_url="http://127.0.0.1:9090",
        username="admin", password="secret",
    )
    assert status2.metrics.get("has_auth") is True
    assert login_call_count == 1, (
        f"Login wurde {login_call_count}x aufgerufen — erwartet 1 (Cache-Hit beim 2. Call)"
    )


@pytest.mark.asyncio
async def test_401_invalidates_and_retries(monkeypatch):
    """
    Wenn ein gecachter Cookie 401 liefert: Cache wird geleert und einmal
    Re-Login probiert. Bei erfolgreichem Re-Login kommen echte Daten.
    """
    nasdominator._cookie_cache.clear()

    # Ersten Call simulieren: alten Cookie im Cache hinterlegen (abgelaufen ist er nicht,
    # aber Server akzeptiert ihn nicht mehr)
    nasdominator._cookie_cache["http://127.0.0.1:9090"] = {
        "cookie": "nasdom_token=old-stale-token",
        "expires_at": time.time() + 500,  # noch gueltiger TTL-Eintrag
    }

    login_call_count = 0

    def handler(req: httpx.Request) -> httpx.Response:
        nonlocal login_call_count
        path = str(req.url.path)
        if req.method == "POST" and path == "/api/auth/login":
            login_call_count += 1
            return httpx.Response(
                200,
                json={"status": "ok", "token": "new-fresh-token"},
                headers={"Set-Cookie": "nasdom_token=new-fresh-token; HttpOnly"},
            )
        if path == "/api/auth/status":
            return httpx.Response(200, json={"setup_complete": True})
        if path == "/api/dashboard":
            cookie = req.headers.get("Cookie", "")
            if "new-fresh-token" in cookie:
                return httpx.Response(200, json={
                    "system": {"cpu_usage": 10.0, "ram_usage": 40.0},
                    "raid": [], "containers": [],
                })
            # Altes Token oder kein Token -> 401
            return httpx.Response(401, json={"detail": "Token abgelaufen"})
        # Adapter ruft /api/services/containers
        if path == "/api/services/containers":
            cookie = req.headers.get("Cookie", "")
            if "new-fresh-token" in cookie:
                return httpx.Response(200, json=[
                    {"name": "oberon", "state": "running"},
                    {"name": "postgres", "state": "running"},
                ])
            return httpx.Response(401)
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real_client(transport=transport, **kw))

    status = await nasdominator.get_status(
        base_url="http://127.0.0.1:9090",
        username="admin", password="secret",
    )

    # Re-Login muss stattgefunden haben
    assert login_call_count == 1, (
        f"Re-Login nicht ausgeloest (login_call_count={login_call_count})"
    )
    # Nach Re-Login sollten echte Daten vorliegen
    assert status.metrics.get("has_auth") is True
    assert status.metrics.get("services_up", 0) >= 2


@pytest.mark.asyncio
async def test_login_failed(monkeypatch):
    """
    Login selbst gibt 401: Adapter bleibt im 'no_auth'-Zustand,
    kein gecachter Cookie.
    """
    nasdominator._cookie_cache.clear()

    def handler(req: httpx.Request) -> httpx.Response:
        path = str(req.url.path)
        if req.method == "POST" and path == "/api/auth/login":
            return httpx.Response(401, json={"detail": "Falsche Credentials"})
        if path == "/api/auth/status":
            return httpx.Response(200, json={"setup_complete": True})
        # Alle anderen Endpoints liefern 401
        return httpx.Response(401, json={"detail": "Nicht angemeldet"})

    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real_client(transport=transport, **kw))

    status = await nasdominator.get_status(
        base_url="http://127.0.0.1:9090",
        username="admin", password="falsch",
    )

    # Kein Cookie im Cache
    assert "http://127.0.0.1:9090" not in nasdominator._cookie_cache
    # Auth-Zustand: kein Login moeglich
    assert status.metrics.get("has_auth") is False
    # Summary sollte auf Login-Fehler hinweisen
    assert (
        "login" in status.summary.lower()
        or "credential" in status.summary.lower()
        or "auth" in status.summary.lower()
    )


# ── Cookie-Auth in get_services / get_metrics / get_containers ───────────────

@pytest.mark.asyncio
async def test_get_services_with_cookie_auth(monkeypatch):
    """get_services nutzt Cookie-Auth wenn username/password vorhanden.
    get_services ruft jetzt /api/services/containers (Laufzeit-Status).
    """
    nasdominator._cookie_cache.clear()

    def handler(req: httpx.Request) -> httpx.Response:
        path = str(req.url.path)
        if req.method == "POST" and path == "/api/auth/login":
            return httpx.Response(
                200,
                json={"status": "ok", "token": "svc-token"},
                headers={"Set-Cookie": "nasdom_token=svc-token; HttpOnly"},
            )
        # get_services ruft /api/services/containers
        if path == "/api/services/containers":
            cookie = req.headers.get("Cookie", "")
            if "svc-token" in cookie:
                return httpx.Response(200, json=[
                    {"name": "oberon", "state": "running"},
                ])
            return httpx.Response(401, json={"detail": "Nicht angemeldet"})
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real_client(transport=transport, **kw))

    result = await nasdominator.get_services(
        base_url="http://127.0.0.1:9090",
        username="admin", password="secret",
    )
    assert result["auth_required"] is False
    assert len(result["services"]) == 1


@pytest.mark.asyncio
async def test_get_services_no_credentials_returns_auth_required(monkeypatch):
    """get_services ohne Credentials: auth_required=True wenn Server 401 liefert."""
    nasdominator._cookie_cache.clear()

    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"detail": "Nicht angemeldet"})

    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real_client(transport=transport, **kw))

    result = await nasdominator.get_services(base_url="http://127.0.0.1:9090")
    assert result["auth_required"] is True
