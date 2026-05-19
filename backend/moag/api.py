"""
FastAPI-App-Factory fuer MOAG (Mother of All GUIs).

Endpoints:
  GET  /api/health             — Health-Check
  GET  /api/v1/overview        — Alle 8 Adapter parallel, liefert SystemStatus-Liste
  GET  /api/v1/aggregator/health — Gruppen-Scores + Gesamt-Score
  GET  /api/cluster/hubs       — Hub-Liste
  ...                          — weitere Cluster + Cockpit + Jobs + Charts + Settings

create_app(...) baut die App; alle externen Abhaengigkeiten sind
im Lifespan-Manager verdrahtet.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import sqlite3
import tempfile
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

from fastapi import (
    BackgroundTasks,
    Body,
    FastAPI,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles

from .events import EventBus
from .hub_client import HubClient
from .job_store import JobStore, default_db_path
from .models import (
    EdgeLogEntry,
    EdgeLogResponse,
    EngineMatrix,
    HealthResponse,
    HubConfig,
    HubListResponse,
    HubStatus,
    HubTestRequest,
    HubTestResult,
    JobListResponse,
    JobStatus,
    JobUploadResult,
    NodeListResponse,
    Settings,
    SettingsResponse,
    SettingsUpdate,
)
from .pipeline_hooks import install_pipeline_hooks, uninstall_pipeline_hooks
from .routes_cluster import build_cluster_router
from .routes_cockpit import build_cockpit_router
from .settings_store import SettingsStore, default_settings_path

logger = logging.getLogger("moag.api")

# Limits
MAX_UPLOAD_MB = int(os.environ.get("MOAG_MAX_UPLOAD_MB", "200"))
ALLOWED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".tif", ".tiff"}

# Edge-Log-Ringpuffer (in-memory)
EDGE_LOG_MAX = 200


def _build_info() -> dict[str, str]:
    """Liefert (version, build, build_ts) — best-effort.

    Version-Quelle: moag.__version__ (wird via importlib.metadata aus
    pyproject.toml gelesen wenn das Paket installiert ist).
    Fallback "0.0.0-dev" nur bei komplett nicht-installiertem Paket.
    """
    version = "0.0.0-dev"
    try:
        from moag import __version__ as v
        version = v
    except Exception:  # pragma: no cover
        pass
    build = os.environ.get("MOAG_BUILD", "")
    if not build:
        try:
            import subprocess
            r = subprocess.run(
                ["git", "rev-parse", "--short", "HEAD"],
                capture_output=True, text=True, timeout=2,
                cwd=Path(__file__).resolve().parent.parent.parent,
            )
            if r.returncode == 0:
                build = r.stdout.strip()
        except Exception:  # pragma: no cover
            pass
    if not build:
        build = "dev"
    build_ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return {"version": version, "build": build, "build_ts": build_ts}


def _validate_upload(filename: str, size_bytes: int) -> Optional[str]:
    if not filename:
        return "filename leer"
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        return f"Dateiendung {ext or '(keine)'} nicht unterstuetzt"
    if size_bytes > MAX_UPLOAD_MB * 1024 * 1024:
        return f"Datei {size_bytes/1024/1024:.1f} MB > Limit {MAX_UPLOAD_MB} MB"
    return None


def _safe_filename(name: str) -> str:
    base = Path(name).name
    safe = "".join(c for c in base if c.isalnum() or c in "._- ")
    return safe or "unbenannt"


# ── App Factory ────────────────────────────────────────────────────────────────


def create_app(
    settings_store: SettingsStore | None = None,
    job_store: JobStore | None = None,
    event_bus: EventBus | None = None,
    hub_client: HubClient | None = None,
    *,
    enable_pipeline: bool = True,
    upload_dir: Path | None = None,
    static_dir: Path | None = None,
) -> FastAPI:
    """
    Erstellt die FastAPI-App. Alle Komponenten koennen injiziert werden
    (Tests + Embedding) — Default sind die globalen Persistenz-Pfade.
    """
    settings_store = settings_store or SettingsStore(default_settings_path())
    job_store = job_store or JobStore(default_db_path())
    event_bus = event_bus or EventBus()
    hub_client = hub_client or HubClient(event_bus=event_bus)

    upload_dir = upload_dir or Path(tempfile.gettempdir()) / "moag-uploads"
    upload_dir.mkdir(parents=True, exist_ok=True)

    static_dir = static_dir or (Path(__file__).resolve().parent / "static")

    # In-Memory Edge-Log
    edge_log: list[EdgeLogEntry] = []

    def push_edge_log(level: str, source: str, message: str) -> None:
        entry = EdgeLogEntry(
            ts=datetime.now(timezone.utc),
            level=level, category=source, message=message,
        )
        edge_log.append(entry)
        if len(edge_log) > EDGE_LOG_MAX:
            del edge_log[: len(edge_log) - EDGE_LOG_MAX]
        event_bus.publish(
            "edge_log",
            ts=entry.ts.isoformat(),
            level=level, category=source, source=source, message=message,
        )

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        loop = asyncio.get_running_loop()
        event_bus.attach_loop(loop)

        s = settings_store.get()
        hub_client.configure(s.hubs, s.default_hub_id)
        try:
            await hub_client.start()
        except Exception as e:
            logger.warning("HubClient-Start fehlgeschlagen: %s", e)

        def on_settings_changed(new_settings: Settings) -> None:
            try:
                hub_client.configure(new_settings.hubs, new_settings.default_hub_id)
                event_bus.publish_threadsafe(
                    "settings_changed",
                    default_hub_id=new_settings.default_hub_id,
                    cluster_enabled=new_settings.cluster_enabled,
                )
            except Exception as e:  # pragma: no cover
                logger.warning("Settings-Listener fehlgeschlagen: %s", e)

        settings_store.add_listener(on_settings_changed)

        if enable_pipeline:
            install_pipeline_hooks(event_bus, job_store)

        push_edge_log("INFO", "gui", "MOAG gestartet")

        try:
            yield
        finally:
            settings_store.remove_listener(on_settings_changed)
            uninstall_pipeline_hooks()
            try:
                await hub_client.stop()
            except Exception:  # pragma: no cover
                pass
            try:
                job_store.close()
            except Exception:  # pragma: no cover
                pass

    app = FastAPI(
        title="MOAG Backend",
        version=_build_info()["version"],
        lifespan=lifespan,
    )

    # CORS: lokal + Vite-Dev-Server (5173)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:17900",
            "http://127.0.0.1:17900",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Health ──────────────────────────────────────────────────────────────

    @app.get("/api/health", response_model=HealthResponse)
    async def health() -> HealthResponse:
        info = _build_info()
        return HealthResponse(
            status="ok",
            version=info["version"],
            build=info["build"],
            build_ts=datetime.fromisoformat(info["build_ts"].replace("Z", "+00:00")),
            pipeline_ready=enable_pipeline,
        )

    # ── Overview: alle 8 Adapter parallel ──────────────────────────────────

    @app.get("/api/v1/overview")
    async def get_overview() -> dict:
        """Ruft alle 8 Adapter parallel auf und liefert SystemStatus-Liste.

        return_exceptions=True: ein kaputter Adapter bricht nicht alle anderen.
        """
        from moag import adapters as _adapters_pkg
        from moag.adapters import (
            oberon as _oberon,
            octoboss as _octoboss,
            ocrexpert as _ocrexpert,
            nasdominator as _nasdominator,
            qnapbackup as _qnapbackup,
            custos as _custos,
            panopticor as _panopticor,
        )
        from moag.schemas import SystemStatus

        s = settings_store.get()

        # Hub-URL fuer OctoBoss aus Settings ermitteln
        octoboss_url = s.oberon_base_url  # Fallback
        for h in s.hubs:
            if h.id == s.default_hub_id:
                octoboss_url = h.url
                break

        coros = [
            _oberon.get_status(base_url=s.oberon_base_url, token=s.oberon_token),
            _octoboss.get_status(hub_url=octoboss_url, token=s.api_token),
            _ocrexpert.get_status(base_url=s.ocrexpert_base_url),
            _nasdominator.get_status(base_url=s.nasdominator_base_url, username=s.nasdominator_user, password=s.nasdominator_password),
            _qnapbackup.get_status(),
            _custos.get_status(base_url=s.custos_base_url),
            _panopticor.get_status(base_url=s.panopticor_base_url),
        ]
        results = await asyncio.gather(*coros, return_exceptions=True)

        from moag.aggregator import SYSTEM_INFO

        statuses = []
        for i, res in enumerate(results):
            if isinstance(res, Exception):
                # Adapter-Crash -> Fehler-Status eintragen
                system_ids = ["oberon", "octoboss", "ocrexpert",
                               "nasdominator", "qnapbackup", "custos", "panopticor"]
                sid = system_ids[i] if i < len(system_ids) else f"unknown-{i}"
                from moag.schemas import SystemStatus
                d = SystemStatus(
                    system_id=sid,
                    ok=False,
                    score=0,
                    summary=f"Adapter-Fehler: {type(res).__name__}",
                    metrics={},
                    fetched_at=datetime.now(timezone.utc),
                    error=str(res)[:300],
                ).model_dump()
            else:
                d = res.model_dump()

            # Frontend-Vertrag: id (Alias auf system_id), name, group-Label.
            # Quelle: aggregator.SYSTEM_INFO (Single-Source-of-Truth).
            info = SYSTEM_INFO.get(d["system_id"], (d["system_id"], "Unbekannt"))
            d["id"] = d["system_id"]
            d["name"] = info[0]
            d["group"] = info[1]
            statuses.append(d)

        return {
            "systems": statuses,
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        }

    # ── Aggregator ─────────────────────────────────────────────────────────

    @app.get("/api/v1/aggregator/health")
    async def get_aggregator_health() -> dict:
        """Ruft alle Adapter auf und liefert Gruppen- + Gesamt-Score."""
        from moag.schemas import SystemStatus
        from moag.aggregator import compute_health
        from moag.adapters import (
            oberon as _oberon,
            octoboss as _octoboss,
            ocrexpert as _ocrexpert,
            nasdominator as _nasdominator,
            qnapbackup as _qnapbackup,
            custos as _custos,
            panopticor as _panopticor,
        )

        s = settings_store.get()
        octoboss_url = s.oberon_base_url
        for h in s.hubs:
            if h.id == s.default_hub_id:
                octoboss_url = h.url
                break

        coros = [
            _oberon.get_status(base_url=s.oberon_base_url, token=s.oberon_token),
            _octoboss.get_status(hub_url=octoboss_url, token=s.api_token),
            _ocrexpert.get_status(base_url=s.ocrexpert_base_url),
            _nasdominator.get_status(base_url=s.nasdominator_base_url, username=s.nasdominator_user, password=s.nasdominator_password),
            _qnapbackup.get_status(),
            _custos.get_status(base_url=s.custos_base_url),
            _panopticor.get_status(base_url=s.panopticor_base_url),
        ]
        results = await asyncio.gather(*coros, return_exceptions=True)

        system_ids = ["oberon", "octoboss", "ocrexpert",
                      "nasdominator", "qnapbackup", "custos", "panopticor"]
        statuses: list[SystemStatus] = []
        for i, res in enumerate(results):
            if isinstance(res, Exception):
                sid = system_ids[i] if i < len(system_ids) else f"unknown-{i}"
                statuses.append(SystemStatus(
                    system_id=sid, ok=False, score=0,
                    summary=f"Adapter-Fehler: {type(res).__name__}",
                    metrics={}, fetched_at=datetime.now(timezone.utc),
                    error=str(res)[:300],
                ))
            else:
                statuses.append(res)

        # compute_health liefert das interne Schema (groups als Dict ki_backbone/infra/..,
        # systems als string-Liste). Das Frontend (TopBar.tsx) erwartet aber:
        #   groups: Array von {name, score, systems: [{name, score, ok}]}
        #   plus alert_count
        # Wir mappen hier um — Single-Source-of-Truth fuer (name, group_label) ist
        # aggregator.SYSTEM_INFO.
        from moag.aggregator import SYSTEM_INFO

        raw = compute_health(statuses)
        by_id = {s.system_id: s for s in statuses}

        groups_array = []
        for _group_key, group_data in raw["groups"].items():
            group_systems = []
            for sid in group_data["systems"]:
                info = SYSTEM_INFO.get(sid, (sid, "Unbekannt"))
                st = by_id.get(sid)
                group_systems.append({
                    "name": info[0],
                    "score": st.score if st else 0,
                    "ok": bool(st.ok) if st else False,
                })
            groups_array.append({
                "name": group_data["label"],
                "score": group_data["score"],
                "systems": group_systems,
            })

        alert_count = sum(1 for s in statuses if not s.ok)

        return {
            "overall_score": raw["overall_score"],
            "alert_count": alert_count,
            "groups": groups_array,
            "computed_at": raw["computed_at"],
        }

    # ── Aktionen-API ───────────────────────────────────────────────────────

    # Import erzwingt Ausfuehren aller @register-Dekoratoren (einmalig beim App-Start)
    import moag.actions as _actions_pkg  # noqa: F401 — Side-Effect: Registry befuellen
    from moag.actions.registry import ACTION_REGISTRY
    from moag.schemas import ActionTriggerResponse

    @app.get("/api/v1/actions")
    async def list_actions() -> dict:
        """Liefert die vollstaendige Aktions-Registry (implementierte + Stubs)."""
        return {
            "actions": [a.meta.model_dump() for a in ACTION_REGISTRY.values()],
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        }

    @app.post("/api/v1/actions/{action_id}/trigger", response_model=ActionTriggerResponse)
    async def trigger_action(
        action_id: str,
        body: dict | None = Body(default=None),
    ) -> dict:
        """Fuehrt eine Aktion aus. 404 wenn action_id unbekannt.

        Stub-Aktionen liefern HTTP 200 mit status='not_implemented'.
        """
        if action_id not in ACTION_REGISTRY:
            raise HTTPException(
                status_code=404,
                detail=f"action_id '{action_id}' nicht registriert",
            )
        defn = ACTION_REGISTRY[action_id]
        result = await defn.handler(body or {})
        return result.model_dump()

    # ── Pipeline-Log-Export ────────────────────────────────────────────────

    @app.get("/api/logs/recent", response_class=PlainTextResponse)
    async def get_pipeline_logs(n: int = Query(default=50, ge=1, le=500)) -> str:
        from .pipeline_hooks import plog
        return plog.as_text(n=n)

    # ── Cluster ─────────────────────────────────────────────────────────────

    @app.get("/api/cluster/hubs", response_model=HubListResponse)
    async def list_hubs() -> HubListResponse:
        return HubListResponse(hubs=hub_client.get_status())

    @app.get("/api/cluster/hubs/{hub_id}", response_model=HubStatus)
    async def get_hub(hub_id: str) -> HubStatus:
        st = hub_client.get_status_by_id(hub_id)
        if st is None:
            raise HTTPException(status_code=404, detail=f"Hub '{hub_id}' nicht bekannt")
        return st

    @app.post("/api/cluster/hubs/{hub_id}/default", response_model=SettingsResponse)
    async def set_default_hub(hub_id: str) -> SettingsResponse:
        try:
            settings_store.set_default_hub(hub_id)
        except KeyError as e:
            raise HTTPException(status_code=404, detail=str(e))
        return settings_store.get_response()

    @app.post("/api/cluster/hubs/test", response_model=HubTestResult)
    async def test_hub_url(req: HubTestRequest) -> HubTestResult:
        import httpx as _httpx
        url = req.url.rstrip("/") + "/health"
        headers = {"Authorization": f"Bearer {req.token}"} if req.token else {}
        t0 = datetime.now(timezone.utc)
        try:
            async with _httpx.AsyncClient(timeout=5.0, follow_redirects=True) as client:
                resp = await client.get(url, headers=headers)
            latency = int((datetime.now(timezone.utc) - t0).total_seconds() * 1000)
            return HubTestResult(
                ok=resp.is_success,
                latency_ms=latency,
                status_code=resp.status_code,
                error=None if resp.is_success else f"HTTP {resp.status_code}",
            )
        except Exception as e:
            if "timeout" in str(e).lower() or "TimeoutException" in type(e).__name__:
                return HubTestResult(ok=False, error="Timeout nach 5s")
            return HubTestResult(ok=False, error=f"{type(e).__name__}: {e}")

    @app.get("/api/cluster/nodes", response_model=NodeListResponse)
    async def list_nodes(hub_id: str | None = None) -> NodeListResponse:
        nodes = hub_client.get_nodes(hub_id)
        return NodeListResponse(nodes=nodes)

    @app.get("/api/cluster/nodes/{node_id}")
    async def get_node(node_id: str, hub_id: str | None = None):
        nodes = hub_client.get_nodes(hub_id)
        for n in nodes:
            if n.node_id == node_id or n.hostname == node_id:
                return n
        raise HTTPException(status_code=404, detail=f"Node '{node_id}' nicht gefunden")

    @app.get("/api/cluster/engines", response_model=EngineMatrix)
    async def get_engine_matrix(hub_id: str | None = None) -> EngineMatrix:
        return hub_client.get_engine_matrix(hub_id)

    @app.get("/api/cluster/edge-log", response_model=EdgeLogResponse)
    async def get_edge_log(limit: int = Query(default=50, ge=1, le=200)) -> EdgeLogResponse:
        events = list(reversed(edge_log[-limit:]))
        return EdgeLogResponse(events=events)

    app.include_router(build_cluster_router(settings_store))
    app.include_router(build_cockpit_router(settings_store))

    from .routes_ocrexpert import build_ocrexpert_router
    app.include_router(build_ocrexpert_router(settings_store))

    from moag.routes_oberon import build_oberon_router
    app.include_router(build_oberon_router(settings_store))

    from moag.routes_octoboss import build_octoboss_router
    app.include_router(build_octoboss_router(settings_store))

    from moag.routes_custos import build_custos_router
    app.include_router(build_custos_router(settings_store))

    from moag.routes_nasdominator import build_nasdominator_router
    app.include_router(build_nasdominator_router(settings_store))

    from moag.routes_manifest_health import build_manifest_health_router
    app.include_router(build_manifest_health_router(settings_store))

    # ── Upload-Hub ────────────────────────────────────────────────────────────
    # Handler-Registry befüllen (Import-Seiteneffekt)
    import moag.upload.handlers as _upload_handlers_pkg  # noqa: F401
    from moag.upload import routes as upload_routes
    app.include_router(upload_routes.router)

    # ── Jobs ─────────────────────────────────────────────────────────────────

    @app.post("/api/jobs/upload", response_model=JobUploadResult)
    async def upload_jobs(
        background: BackgroundTasks,
        files: list[UploadFile] = File(...),
        process_now: bool = Form(default=True),
    ) -> JobUploadResult:
        if not enable_pipeline:
            raise HTTPException(
                status_code=403,
                detail="Pipeline deaktiviert (--no-pipeline) — Upload nicht erlaubt",
            )
        accepted: list[str] = []
        rejected: list[dict[str, Any]] = []
        for upload in files:
            data = await upload.read()
            err = _validate_upload(upload.filename or "", len(data))
            if err:
                rejected.append({"filename": upload.filename, "error": err})
                continue
            from .pipeline_hooks import new_job_id
            jid = new_job_id()
            safe_name = _safe_filename(upload.filename or "unbenannt")
            target = upload_dir / f"{jid}_{safe_name}"
            target.write_bytes(data)
            try:
                job_store.create(jid, safe_name, file_path=str(target))
            except sqlite3.IntegrityError:
                jid = new_job_id()
                target = upload_dir / f"{jid}_{safe_name}"
                target.write_bytes(data)
                job_store.create(jid, safe_name, file_path=str(target))
            accepted.append(jid)
            push_edge_log("INFO", "upload", f"Job {jid} angenommen ({safe_name}, {len(data)} bytes)")
            if process_now:
                background.add_task(_run_pipeline_job, jid, str(target), job_store, event_bus)
        return JobUploadResult(job_ids=accepted, accepted=len(accepted), rejected=rejected)

    @app.get("/api/jobs", response_model=JobListResponse)
    async def list_jobs(
        status: str | None = Query(default=None),
        doctype: str | None = Query(default=None),
        since: datetime | None = Query(default=None),
        until: datetime | None = Query(default=None),
        limit: int = Query(default=100, ge=1, le=500),
        offset: int = Query(default=0, ge=0),
    ) -> JobListResponse:
        rows, total, filtered = job_store.list(
            status=status, doctype=doctype,
            since=since, until=until,
            limit=limit, offset=offset,
        )
        return JobListResponse(jobs=rows, total=total, filtered=filtered)

    @app.get("/api/jobs/{job_id}", response_model=JobStatus)
    async def get_job(job_id: str) -> JobStatus:
        job = job_store.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail=f"Job '{job_id}' nicht gefunden")
        return job

    @app.get("/api/jobs/{job_id}/text", response_class=PlainTextResponse)
    async def get_job_text(job_id: str) -> str:
        job = job_store.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Job nicht gefunden")
        with job_store._lock:  # type: ignore[attr-defined]
            row = job_store._conn.execute(  # type: ignore[attr-defined]
                "SELECT result_json FROM jobs WHERE job_id = ?", (job_id,),
            ).fetchone()
        if row is None or not row["result_json"]:
            return "(noch kein OCR-Text verfuegbar)"
        try:
            data = json.loads(row["result_json"])
            seiten = data.get("seiten") or []
            return "\n\n".join(s.get("text", "") for s in seiten)
        except Exception:
            return "(OCR-Daten nicht parsbar)"

    @app.get("/api/jobs/{job_id}/pdf")
    async def get_job_pdf(job_id: str):
        job = job_store.get(job_id)
        if job is None or not job.file_path or not Path(job.file_path).exists():
            raise HTTPException(status_code=404, detail="Original-Datei nicht gefunden")
        return FileResponse(job.file_path, filename=job.filename, media_type="application/pdf")

    @app.get("/api/jobs/{job_id}/output")
    async def get_job_output(job_id: str):
        job = job_store.get(job_id)
        if job is None or not job.output_path or not Path(job.output_path).exists():
            raise HTTPException(status_code=404, detail="Output-Datei nicht gefunden")
        return FileResponse(job.output_path, filename=Path(job.output_path).name,
                            media_type="application/pdf")

    @app.post("/api/jobs/{job_id}/retry")
    async def retry_job(job_id: str, background: BackgroundTasks) -> JobStatus:
        if not enable_pipeline:
            raise HTTPException(status_code=403, detail="Pipeline deaktiviert (--no-pipeline)")
        job = job_store.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Job nicht gefunden")
        if not job.file_path or not Path(job.file_path).exists():
            raise HTTPException(status_code=409, detail="Original-Datei nicht mehr vorhanden")
        job_store.update(job_id, status="pending", error=None, finished_at=None,
                         page_done=0, progress_pct=0)
        background.add_task(_run_pipeline_job, job_id, job.file_path, job_store, event_bus)
        push_edge_log("INFO", "jobs", f"Job {job_id} wird erneut verarbeitet")
        return job_store.get(job_id)  # type: ignore[return-value]

    @app.get("/api/jobs/{job_id}/ab-compare")
    async def get_ab_compare(job_id: str):
        if job_store.get(job_id) is None:
            raise HTTPException(status_code=404, detail="Job nicht gefunden")
        return {"available": False, "reason": "A/B-Vergleich ist Phase-2-Feature"}

    # ── Charts ────────────────────────────────────────────────────────────────

    @app.get("/api/charts/throughput")
    async def chart_throughput(range: str = Query(default="24h")):
        return _chart_throughput(job_store, range)

    @app.get("/api/charts/engine-performance")
    async def chart_engine_perf():
        return _chart_engine_performance(job_store)

    @app.get("/api/charts/doctype-distribution")
    async def chart_doctype():
        return _chart_doctype_distribution(job_store)

    @app.get("/api/charts/round-robin")
    async def chart_round_robin():
        return _chart_round_robin(job_store)

    @app.get("/api/charts/failure-rate")
    async def chart_failure():
        return _chart_failure_rate(job_store)

    # ── Settings ──────────────────────────────────────────────────────────────

    @app.get("/api/settings", response_model=SettingsResponse)
    async def get_settings() -> SettingsResponse:
        return settings_store.get_response()

    @app.post("/api/settings", response_model=SettingsResponse)
    async def update_settings(patch: SettingsUpdate) -> SettingsResponse:
        settings_store.update(patch)
        push_edge_log("INFO", "settings", "Settings aktualisiert")
        return settings_store.get_response()

    @app.post("/api/settings/hubs", response_model=SettingsResponse)
    async def update_hubs(hubs: list[HubConfig]) -> SettingsResponse:
        settings_store.replace_hubs(hubs)
        push_edge_log("INFO", "settings", f"Hub-Liste aktualisiert ({len(hubs)} Eintraege)")
        return settings_store.get_response()

    # ── WebSocket ─────────────────────────────────────────────────────────────

    @app.websocket("/ws/events")
    async def ws_events(ws: WebSocket):
        await ws.accept()
        queue = event_bus.subscribe(replay_backlog=True)
        try:
            while True:
                event = await queue.get()
                await ws.send_json(event)
        except WebSocketDisconnect:
            pass
        except Exception as e:  # pragma: no cover
            logger.warning("WS error: %s", e)
        finally:
            event_bus.unsubscribe(queue)

    # ── Static-Frontend ───────────────────────────────────────────────────────
    try:
        assets_dir = static_dir / "assets"
        index_html = static_dir / "index.html"
        if assets_dir.exists():
            app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")
        if index_html.exists():
            _NO_CACHE = {"Cache-Control": "no-cache, must-revalidate"}

            @app.get("/", include_in_schema=False)
            async def _spa_root() -> FileResponse:
                return FileResponse(str(index_html), media_type="text/html", headers=_NO_CACHE)

            @app.get("/{full_path:path}", include_in_schema=False)
            async def _spa_fallback(full_path: str):
                if full_path.startswith("api/") or full_path.startswith("ws/"):
                    raise HTTPException(status_code=404, detail="Not Found")
                candidate = static_dir / full_path
                if candidate.is_file():
                    return FileResponse(str(candidate))
                return FileResponse(str(index_html), media_type="text/html", headers=_NO_CACHE)
        else:
            logger.info(
                "Frontend-dist nicht vorhanden (%s), GUI nicht ausgeliefert "
                "(Dev-Modus? Vite-HMR auf Port 5173 nutzen)",
                index_html,
            )
    except Exception as e:  # pragma: no cover
        logger.debug("Static-Mount nicht moeglich: %s", e)

    # App-State fuer Tests
    app.state.settings_store = settings_store
    app.state.job_store = job_store
    app.state.event_bus = event_bus
    app.state.hub_client = hub_client
    app.state.upload_dir = upload_dir
    app.state.push_edge_log = push_edge_log

    return app


# ── Hintergrund-Pipeline ───────────────────────────────────────────────────────


def _run_pipeline_job(job_id: str, file_path: str, job_store: JobStore, event_bus: EventBus) -> None:
    """
    Stub-Pipeline fuer MOAG.

    TODO Phase 1.5: OCRexpert per HTTP ansprechen statt In-Process-Import.
    Frueherer OCRexpert-Ansatz (nicht mehr erlaubt in MOAG):
      from ocrexpert.pipeline import process, OutputProfil
      process(file_path, profile=OutputProfil.RAW)

    Aktuell: Job wird als "pending" belassen bis HTTP-Adapter fertig ist.
    """
    logger.info("_run_pipeline_job: Job %s — HTTP-Adapter noch nicht implementiert (Phase 1.5)", job_id)
    # TODO Phase 1.5: ueber HTTP an ocrexpert-service
    # s = get_settings()
    # result = httpx.post(f"{s.ocrexpert_base_url}/api/jobs/upload", ...)
    try:
        event_bus.publish_threadsafe(
            "job_failed",
            job_id=job_id,
            error="HTTP-Adapter noch nicht implementiert (TODO Phase 1.5)",
        )
        job_store.mark_failed(job_id, "HTTP-Adapter noch nicht implementiert (TODO Phase 1.5)")
    except Exception:  # pragma: no cover
        pass


# ── Charts-Aggregation ─────────────────────────────────────────────────────────


def _chart_throughput(job_store: JobStore, range_str: str) -> dict[str, Any]:
    hours = 24
    if range_str.endswith("h"):
        try:
            hours = int(range_str[:-1])
        except ValueError:
            hours = 24
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    rows, _, _ = job_store.list(status="done", since=since, limit=500)
    buckets: dict[str, int] = {}
    for j in rows:
        if j.finished_at is None:
            continue
        h = j.finished_at.replace(minute=0, second=0, microsecond=0, tzinfo=timezone.utc)
        key = h.isoformat()
        buckets[key] = buckets.get(key, 0) + 1
    points = [{"ts": k, "docs_per_hour": v} for k, v in sorted(buckets.items())]
    return {"datapoints": points}


def _chart_engine_performance(job_store: JobStore) -> dict[str, Any]:
    return {"engines": []}


def _chart_doctype_distribution(job_store: JobStore) -> dict[str, Any]:
    rows, _, _ = job_store.list(limit=500)
    counts: dict[str, int] = {}
    total = 0
    for j in rows:
        if j.doctype:
            counts[j.doctype] = counts.get(j.doctype, 0) + 1
            total += 1
    if total == 0:
        return {"current": [], "trend": []}
    current = [
        {"doctype": k, "count": v, "pct": round(v / total, 3)}
        for k, v in sorted(counts.items(), key=lambda kv: -kv[1])
    ]
    return {"current": current, "trend": []}


def _chart_round_robin(job_store: JobStore) -> dict[str, Any]:
    rows, _, _ = job_store.list(limit=500)
    counts: dict[str, int] = {}
    for j in rows:
        for n in (j.nodes_used or []):
            counts[n] = counts.get(n, 0) + 1
    if not counts:
        return {"datapoints": []}
    return {"datapoints": [{"ts": datetime.now(timezone.utc).isoformat(), **counts}]}


def _chart_failure_rate(job_store: JobStore) -> dict[str, Any]:
    rows, total, _ = job_store.list(limit=500)
    failed = [j for j in rows if j.status == "failed"]
    rate = (len(failed) / max(1, len(rows))) if rows else 0.0
    by_error: dict[str, int] = {}
    for j in failed:
        key = (j.error or "unknown")[:60]
        by_error[key] = by_error.get(key, 0) + 1
    top = [
        {"type": k, "count": v}
        for k, v in sorted(by_error.items(), key=lambda kv: -kv[1])[:5]
    ]
    return {
        "trend": [{"ts": datetime.now(timezone.utc).date().isoformat(), "rate": round(rate, 4)}],
        "top_errors": top,
    }
