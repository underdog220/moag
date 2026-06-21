"""
OctoBoss-Proxy-Routes fuer MOAG — alle Read-Only-Endpunkte + Bench-Endpoints.

Prefix: /api/v1/octoboss

Routen:
  GET /nodes              → GET /seti/nodes am Hub
  GET /nodes/{node_id}    → GET /seti/nodes/{node_id}
  GET /overview           → GET /seti/overview
  GET /jobs               → GET /jobs  (mit ?state=&limit=)
  GET /assets             → GET /api/v1/assets (mit ?type=&name=)
  GET /cluster/status     → GET /admin/cluster/status
  GET /cluster/peers      → GET /api/v1/mesh/peers
  GET /ocr/status         → GET /ocr/status
  GET /llm/models         → GET /v1/models

  # Benchmark-Suite
  GET  /benchmarks/matrix          → GET /api/v1/benchmarks/matrix
  GET  /benchmarks/history         → GET /api/v1/benchmarks/history (Query-Param-Passthrough)
  GET  /benchmarks/runs            → GET /api/v1/benchmarks/runs (mit ?limit=)
  GET  /benchmarks/runs/{run_id}   → GET /api/v1/benchmarks/runs/{run_id}
  POST /benchmarks/run             → POST /api/v1/benchmarks/run (body-passthrough)

Hub-URL kommt aus Settings (default_hub_id-Lookup), Fallback:
  http://192.168.200.71:18765
"""
from __future__ import annotations

import logging
from typing import Any, Optional

import httpx
from fastapi import APIRouter, HTTPException, Query, Request

from .settings_store import SettingsStore
from .manifest_inventory import gather_all_inventories

logger = logging.getLogger("moag.routes_octoboss")

_FALLBACK_HUB = "http://192.168.200.71:18765"


def _resolve_hub(settings_store: SettingsStore) -> tuple[str, Optional[str]]:
    """Liefert (hub_base_url, token) aus den Settings.

    Bevorzugt den konfigurierten default_hub, faellt auf Fallback zurueck.
    """
    s = settings_store.get()
    target_id = s.default_hub_id
    for h in s.hubs:
        if h.id == target_id:
            url = (h.url or "").rstrip("/")
            token = h.token or s.api_token
            return (url or _FALLBACK_HUB, token or None)
    # Kein passender Hub → Fallback + globales Token
    return (_FALLBACK_HUB, s.api_token or None)


def _auth_headers(token: Optional[str]) -> dict[str, str]:
    if not token:
        return {}
    return {
        "Authorization": f"Bearer {token}",
        "X-DevLoop-Token": token,
    }


async def _proxy_get(
    hub_url: str,
    path: str,
    token: Optional[str],
    params: dict[str, str] | None = None,
) -> Any:
    """Sendet ein GET an den Hub und gibt das JSON-Ergebnis zurueck.

    Wirft HTTPException mit passenden Status-Codes wenn der Hub antwortet
    oder nicht erreichbar ist.
    """
    target = f"{hub_url}{path}"
    try:
        async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as cli:
            resp = await cli.get(
                target,
                headers=_auth_headers(token),
                params=params or {},
            )
        if resp.is_success:
            ct = resp.headers.get("content-type", "")
            if "application/json" in ct:
                return resp.json()
            return {"raw": resp.text}
        # Hub-Fehler durchreichen
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"OctoBoss-Hub {path} antwortete HTTP {resp.status_code}: {resp.text[:200]}",
        )
    except HTTPException:
        raise
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail=f"OctoBoss-Hub Timeout ({path})")
    except (httpx.ConnectError, httpx.HTTPError) as exc:
        raise HTTPException(
            status_code=502,
            detail=f"OctoBoss-Hub nicht erreichbar ({path}): {exc}",
        )


async def _proxy_post(
    hub_url: str,
    path: str,
    token: Optional[str],
    body: dict[str, Any] | None = None,
) -> Any:
    """Sendet ein POST an den Hub und gibt das JSON-Ergebnis zurueck.

    Analog zu _proxy_get, aber mit JSON-Body und POST-Methode.
    Wirft HTTPException mit passenden Status-Codes (inkl. 202 Accepted).
    """
    target = f"{hub_url}{path}"
    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as cli:
            resp = await cli.post(
                target,
                headers={**_auth_headers(token), "Content-Type": "application/json"},
                json=body or {},
            )
        # 202 Accepted ist fuer Bench-Run normal — ebenfalls als Erfolg behandeln
        if resp.is_success:
            ct = resp.headers.get("content-type", "")
            if "application/json" in ct:
                return resp.json()
            return {"raw": resp.text}
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"OctoBoss-Hub {path} antwortete HTTP {resp.status_code}: {resp.text[:200]}",
        )
    except HTTPException:
        raise
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail=f"OctoBoss-Hub Timeout ({path})")
    except (httpx.ConnectError, httpx.HTTPError) as exc:
        raise HTTPException(
            status_code=502,
            detail=f"OctoBoss-Hub nicht erreichbar ({path}): {exc}",
        )


def _enrich_node_hardware(node: dict) -> dict:
    """Reichert den hardware-Block einer Node mit hardware_direct an.

    OctoBoss liefert zwei Quellen: `hardware` (Heartbeat — gpu_load/cpu_load oft
    null, bekannter Bug) und `hardware_direct` (HwDirectPullPoller, echte Lasten).
    Wir mergen die effektiven Werte (hardware_direct bevorzugt) in `hardware` und
    setzen `hardware_source`/`hardware_at`, damit das Frontend (Nodes.tsx liest
    hw.gpu_load_percent + hw.hardware_source) die echten Werte zeigt.
    gpu_name/cpu_model bleiben aus `hardware` erhalten (hardware_direct hat sie nicht).
    Fallback: kein hardware_direct → hardware mit Quelle "heartbeat".
    """
    if not isinstance(node, dict):
        return node
    hw = dict(node.get("hardware") or {})
    hw_direct = node.get("hardware_direct") or {}
    if hw_direct:
        hw.update(hw_direct)  # echte Lasten gewinnen; gpu_name/cpu_model bleiben aus hw
        hw["hardware_source"] = "direct"
        hw["hardware_at"] = node.get("hardware_direct_at")
    elif hw:
        hw["hardware_source"] = "heartbeat"
    node["hardware"] = hw
    return node


async def collect_hw_samples(settings_store: SettingsStore, store: Any) -> int:
    """Zieht /seti/nodes, reichert an und schreibt neue Samples in den Store.

    Wird vom Hintergrund-Poller (api.py-Lifespan) periodisch aufgerufen — entkoppelt
    von Frontend-Requests, damit auch ohne offenes Cockpit gesammelt wird. Dedup
    nach hardware_at passiert im Store, der MOAG-Poll-Takt ist daher egal.
    Rückgabe: Anzahl tatsächlich neu gespeicherter Samples.
    """
    hub_url, token = _resolve_hub(settings_store)
    data = await _proxy_get(hub_url, "/seti/nodes", token)
    nodes = data.get("nodes") if isinstance(data, dict) else data
    if not isinstance(nodes, list):
        return 0
    saved = 0
    for raw in nodes:
        node = _enrich_node_hardware(raw)
        nid = node.get("node_id") or node.get("id")
        if nid and store.record(nid, node.get("hardware") or {}):
            saved += 1
    return saved


def build_octoboss_router(settings_store: SettingsStore) -> APIRouter:
    """Erstellt den FastAPI-Router fuer alle OctoBoss-Proxy-Routen."""
    router = APIRouter(prefix="/api/v1/octoboss", tags=["octoboss"])

    @router.get("/nodes")
    async def get_nodes() -> Any:
        """Node-Liste: GET /seti/nodes am OctoBoss-Hub.

        Liefert Hardware-Telemetrie, Ollama-Status, Mode und Modules pro Node.
        """
        hub_url, token = _resolve_hub(settings_store)
        data = await _proxy_get(hub_url, "/seti/nodes", token)
        if isinstance(data, dict) and isinstance(data.get("nodes"), list):
            data["nodes"] = [_enrich_node_hardware(n) for n in data["nodes"]]
        elif isinstance(data, list):
            data = [_enrich_node_hardware(n) for n in data]
        return data

    @router.get("/nodes/{node_id}")
    async def get_node(node_id: str) -> Any:
        """Node-Detail: GET /seti/nodes/{node_id} am OctoBoss-Hub."""
        hub_url, token = _resolve_hub(settings_store)
        node = await _proxy_get(hub_url, f"/seti/nodes/{node_id}", token)
        return _enrich_node_hardware(node)

    @router.get("/nodes/{node_id}/history")
    async def get_node_history(
        node_id: str,
        since_s: int = Query(7200, ge=60, le=86400, description="Zeitfenster in Sekunden"),
    ) -> dict:
        """GPU/CPU/RAM/VRAM-Verlauf einer Node aus dem MOAG-internen Ring-Buffer.

        Samples sind timestamp-getrieben (Feld `at` = echter Messzeitpunkt), die
        Abstände können variieren — das Frontend rendert auf echter Zeitachse.
        Datenquelle: MOAG-Hintergrund-Poller (kein zusätzlicher Hub-Call hier).
        """
        from .hw_history import HW_HISTORY

        samples = HW_HISTORY.series(node_id, since_s=since_s)
        return {
            "node_id": node_id,
            "since_s": since_s,
            "count": len(samples),
            "samples": samples,
        }

    @router.get("/overview")
    async def get_overview() -> Any:
        """Capability-Summary: GET /seti/overview am OctoBoss-Hub."""
        hub_url, token = _resolve_hub(settings_store)
        return await _proxy_get(hub_url, "/seti/overview", token)

    @router.get("/jobs")
    async def get_jobs(
        state: Optional[str] = Query(default=None),
        limit: int = Query(default=50, ge=1, le=500),
    ) -> Any:
        """Scheduler-Queue: GET /jobs am OctoBoss-Hub.

        ?state=pending|running|done|failed  (optional)
        ?limit=N
        """
        hub_url, token = _resolve_hub(settings_store)
        params: dict[str, str] = {"limit": str(limit)}
        if state:
            params["state"] = state
        return await _proxy_get(hub_url, "/jobs", token, params=params)

    @router.get("/assets")
    async def get_assets(
        type: Optional[str] = Query(default=None, alias="type"),
        name: Optional[str] = Query(default=None),
    ) -> Any:
        """Asset-Inventar: GET /api/v1/assets am OctoBoss-Hub.

        ?type=model|script|...  (optional)
        ?name=<teilname>        (optional)
        """
        hub_url, token = _resolve_hub(settings_store)
        params: dict[str, str] = {}
        if type:
            params["type"] = type
        if name:
            params["name"] = name
        return await _proxy_get(hub_url, "/api/v1/assets", token, params=params)

    @router.get("/cluster/status")
    async def get_cluster_status() -> Any:
        """Cluster-Modus / Primary / Replica: GET /admin/cluster/status."""
        hub_url, token = _resolve_hub(settings_store)
        return await _proxy_get(hub_url, "/admin/cluster/status", token)

    @router.get("/cluster/peers")
    async def get_cluster_peers() -> Any:
        """Mesh-Peers: GET /api/v1/mesh/peers am OctoBoss-Hub."""
        hub_url, token = _resolve_hub(settings_store)
        return await _proxy_get(hub_url, "/api/v1/mesh/peers", token)

    @router.get("/ocr/status")
    async def get_ocr_status() -> Any:
        """OCR-Gateway-Status: GET /ocr/status am OctoBoss-Hub."""
        hub_url, token = _resolve_hub(settings_store)
        return await _proxy_get(hub_url, "/ocr/status", token)

    @router.get("/llm/models")
    async def get_llm_models() -> Any:
        """OpenAI-kompatible Model-Liste: GET /v1/models am OctoBoss-Hub.

        Liefert Ollama-Modelle die ueber den Hub-Proxy erreichbar sind.
        """
        hub_url, token = _resolve_hub(settings_store)
        return await _proxy_get(hub_url, "/v1/models", token)

    # ── Benchmark-Routen ─────────────────────────────────────────────────────────

    @router.get("/benchmarks/matrix")
    async def get_benchmarks_matrix() -> Any:
        """Benchmark-Matrix (subjects x nodes): GET /api/v1/benchmarks/matrix.

        Sparse-Matrix — fehlende Zellen werden als null/None geliefert.
        Kein Auth-Header noetig (OctoBoss-Bench ist offen).
        503 wenn Benchmark-DB nicht verfuegbar.
        """
        hub_url, token = _resolve_hub(settings_store)
        return await _proxy_get(hub_url, "/api/v1/benchmarks/matrix", token)

    @router.get("/benchmarks/history")
    async def get_benchmarks_history(
        limit: int = Query(default=100, ge=1, le=1000),
        node_id: Optional[str] = Query(default=None),
        domain: Optional[str] = Query(default=None),
        subject: Optional[str] = Query(default=None),
        metric_key: Optional[str] = Query(default=None),
    ) -> Any:
        """Benchmark-History: GET /api/v1/benchmarks/history.

        Alle Query-Parameter werden an OctoBoss durchgereicht.
        ?limit=N  ?node_id=...  ?domain=...  ?subject=...  ?metric_key=...
        503 wenn Benchmark-DB nicht verfuegbar.
        """
        hub_url, token = _resolve_hub(settings_store)
        params: dict[str, str] = {"limit": str(limit)}
        if node_id:
            params["node_id"] = node_id
        if domain:
            params["domain"] = domain
        if subject:
            params["subject"] = subject
        if metric_key:
            params["metric_key"] = metric_key
        return await _proxy_get(hub_url, "/api/v1/benchmarks/history", token, params=params)

    @router.get("/benchmarks/runs")
    async def get_benchmarks_runs(
        limit: int = Query(default=50, ge=1, le=500),
    ) -> Any:
        """Benchmark-Run-Liste: GET /api/v1/benchmarks/runs.

        Antwort enthaelt active_run_id (null = idle, UUID = laeuft).
        503 wenn Benchmark-DB nicht verfuegbar.
        """
        hub_url, token = _resolve_hub(settings_store)
        return await _proxy_get(
            hub_url, "/api/v1/benchmarks/runs", token, params={"limit": str(limit)}
        )

    @router.get("/benchmarks/runs/{run_id}")
    async def get_benchmarks_run_detail(run_id: str) -> Any:
        """Benchmark-Run-Detail: GET /api/v1/benchmarks/runs/{run_id}.

        Liefert Run-Metadaten + alle Einzel-Ergebnisse.
        503 wenn Benchmark-DB nicht verfuegbar.
        """
        hub_url, token = _resolve_hub(settings_store)
        return await _proxy_get(hub_url, f"/api/v1/benchmarks/runs/{run_id}", token)

    # ── Rollout & Test — Aggregations-Endpoint (Phase 1, read-only) ───────────────

    @router.get("/rollout/status")
    async def get_rollout_status() -> dict:
        """Komprimierte Rollout-/Test-/Verbesserungs-Sicht (EIN Call statt sechs).

        Aggregiert (read-only) die bereits durchgereichten OctoBoss-Routen:
          - /manifest/inventory  → Core-default + Versions + Per-Node Overrides + Module-by-Node
          - /seti/nodes          → agent_version + connected + last_heartbeat je Node
          - /api/v1/benchmarks/runs?limit=1 + /runs/{id} → letzter Benchmark-Lauf
          - /api/v1/benchmarks/matrix → Trend (▲/=/▼) je subject/domain für VERBESSERUNG

        Robust gegen Teilausfälle: Schlägt eine Quelle fehl, wird der jeweilige
        Block mit `error` markiert statt den ganzen Endpoint scheitern zu lassen.

        EHRLICHE LÜCKE (siehe Konzept 2026-06-21): Per-Node *Ist*-Core-Version ist
        NICHT getrackt. `agent_version` ist der Agent-/Bootstrapper-Build, NICHT die
        deployte Core-Version. Wir liefern Soll (Manifest-default/override) +
        `agent_version` + Heartbeat und kennzeichnen das im Feld
        `core_ist_tracked: false` + `core_ist_note`. Kein stilles "alle grün".
        """
        hub_url, token = _resolve_hub(settings_store)

        async def _safe_get(path: str, params: dict[str, str] | None = None) -> tuple[Any, str | None]:
            """GET mit Fehler-Kapselung: (data|None, error_str|None)."""
            try:
                return (await _proxy_get(hub_url, path, token, params=params), None)
            except HTTPException as exc:
                return (None, f"HTTP {exc.status_code}: {exc.detail}")
            except Exception as exc:  # noqa: BLE001 — Degradation statt Total-Fail
                return (None, str(exc))

        async def _safe_inventory() -> tuple[Any, str | None]:
            """Inventory in-process via gather_all_inventories — NICHT als Hub-Proxy.

            Der OctoBoss-Hub hat KEINEN /api/v1/manifest/inventory-Endpoint (404).
            Das Inventory ist eine MOAG-eigene Aggregation aus
            /api/v1/seti/bootstrapper/versions (+ Fallback /seti/distribute/info) —
            dieselbe Quelle + dasselbe Schema wie die /api/v1/manifest/inventory-Route.
            Vorher proxyte der Aggregator faelschlich den Hub-Pfad → garantiert 404.
            """
            try:
                s = settings_store.get()
                active_id = s.default_hub_id
                hubs_arg: list[tuple[str, str, bool]] = []
                for h in s.hubs:
                    url_clean = (h.url or "").rstrip("/")
                    if not url_clean:
                        continue
                    hubs_arg.append((h.id, url_clean, h.id == active_id))
                if not hubs_arg:
                    hubs_arg = [("fallback", hub_url, True)]
                return (await gather_all_inventories(hubs_arg), None)
            except Exception as exc:  # noqa: BLE001 — Degradation statt Total-Fail
                return (None, str(exc))

        # ── 1) ROLLOUT: Manifest-Inventory — MOAG-eigene Aggregation (kein Hub-Proxy)
        inv, inv_err = await _safe_inventory()
        seti, seti_err = await _safe_get("/seti/nodes")

        core_default: str | None = None
        hub_version: str | None = None
        overrides_by_node: dict[str, str] = {}
        node_meta: dict[str, dict] = {}  # node_id → {hostname, connected, node_pool}

        if isinstance(inv, dict):
            hub_version = inv.get("active_hub_id") if isinstance(inv.get("active_hub_id"), str) else hub_version
            hubs = inv.get("hubs")
            active_id = inv.get("active_hub_id")
            chosen = None
            if isinstance(hubs, list) and hubs:
                # aktiven Hub bevorzugen, sonst ersten mit Inventory
                for h in hubs:
                    if isinstance(h, dict) and h.get("is_active"):
                        chosen = h
                        break
                if chosen is None:
                    chosen = next((h for h in hubs if isinstance(h, dict) and h.get("inventory")), None)
            if isinstance(chosen, dict):
                hub_version = chosen.get("id") or hub_version
                inventory = chosen.get("inventory") or {}
                core = inventory.get("core") or {}
                core_default = core.get("default")
                for ov in core.get("overrides") or []:
                    if isinstance(ov, dict) and ov.get("node_id"):
                        overrides_by_node[str(ov["node_id"])] = str(ov.get("version") or "")
                for n in (inventory.get("modules") or {}).get("by_node") or []:
                    if isinstance(n, dict) and n.get("node_id"):
                        node_meta[str(n["node_id"])] = {
                            "hostname": n.get("hostname"),
                            "connected": n.get("connected"),
                            "node_pool": n.get("node_pool"),
                        }
            _ = active_id  # nur zur Klarheit referenziert

        # Hub-Software-Version (octoboss x.y.z) — aus /seti/overview wäre genauer,
        # aber wir bleiben bei den hier schon gezogenen Quellen. active_hub_id ist
        # die Hub-Identität; die Hub-Software-Version lassen wir bewusst optional.

        # ── Nodes aus /seti/nodes mergen (agent_version + Heartbeat)
        import datetime as _dt

        def _heartbeat_age_s(iso: Any) -> int | None:
            if not iso or not isinstance(iso, str):
                return None
            try:
                ts = _dt.datetime.fromisoformat(iso.replace("Z", "+00:00"))
                now = _dt.datetime.now(_dt.timezone.utc)
                if ts.tzinfo is None:
                    ts = ts.replace(tzinfo=_dt.timezone.utc)
                return max(0, int((now - ts).total_seconds()))
            except Exception:
                return None

        seti_nodes_raw: list = []
        if isinstance(seti, dict) and isinstance(seti.get("nodes"), list):
            seti_nodes_raw = seti["nodes"]
        elif isinstance(seti, list):
            seti_nodes_raw = seti

        rollout_nodes: list[dict] = []
        seen_ids: set[str] = set()
        for raw in seti_nodes_raw:
            if not isinstance(raw, dict):
                continue
            nid = str(raw.get("node_id") or raw.get("id") or "")
            if not nid:
                continue
            seen_ids.add(nid)
            soll = overrides_by_node.get(nid) or core_default
            meta = node_meta.get(nid, {})
            rollout_nodes.append({
                "node_id": nid,
                "hostname": raw.get("hostname") or meta.get("hostname"),
                "soll": soll,
                "soll_source": "override" if nid in overrides_by_node else "default",
                "agent_version": raw.get("agent_version"),
                "connected": bool(raw.get("connected")),
                "heartbeat_age_s": _heartbeat_age_s(raw.get("last_heartbeat")),
                "last_heartbeat": raw.get("last_heartbeat"),
            })
        # Nodes, die nur im Manifest-Inventory stehen (kein Heartbeat) ergänzen
        for nid, meta in node_meta.items():
            if nid in seen_ids:
                continue
            rollout_nodes.append({
                "node_id": nid,
                "hostname": meta.get("hostname"),
                "soll": overrides_by_node.get(nid) or core_default,
                "soll_source": "override" if nid in overrides_by_node else "default",
                "agent_version": None,
                "connected": bool(meta.get("connected")),
                "heartbeat_age_s": None,
                "last_heartbeat": None,
            })
        rollout_nodes.sort(key=lambda n: (n.get("hostname") or n.get("node_id") or ""))

        rollout = {
            "core_default": core_default,
            "hub_version": hub_version,
            "core_ist_tracked": False,
            "core_ist_note": (
                "Per-Node Ist-Core-Version ist NICHT getrackt: agent_version ist der "
                "Agent-/Bootstrapper-Build, nicht die deployte Core-Version. Angezeigt "
                "werden Soll (Manifest) + agent_version + Heartbeat (≈*)."
            ),
            "nodes": rollout_nodes,
            "error": inv_err or seti_err,
        }

        # ── 2) LETZTER TEST: letzter Benchmark-Lauf (+ Pretest-Lücke ehrlich)
        runs_data, runs_err = await _safe_get("/api/v1/benchmarks/runs", params={"limit": "1"})
        benchmark_run: dict | None = None
        if isinstance(runs_data, dict):
            runs = runs_data.get("runs") or []
            if runs and isinstance(runs[0], dict):
                r0 = runs[0]
                run_id = r0.get("run_id")
                summary = r0.get("summary") or {}
                # Verdict aus summary ableiten (kein eigenes Feld am Run)
                failed = summary.get("failed")
                verdict = None
                if isinstance(failed, int):
                    verdict = "GREEN" if failed == 0 else "RED"
                subjects: list[dict] = []
                # Run-Detail für Einzel-Ergebnisse (subjects) ziehen
                if run_id:
                    detail, _derr = await _safe_get(f"/api/v1/benchmarks/runs/{run_id}")
                    results = (detail or {}).get("results") if isinstance(detail, dict) else None
                    for res in results or []:
                        if not isinstance(res, dict):
                            continue
                        subjects.append({
                            "subject": res.get("subject"),
                            "domain": res.get("domain"),
                            "metric": res.get("metric_string")
                            or (str(res.get("metric_value")) if res.get("metric_value") is not None else None),
                            "passed": bool(res.get("passed")),
                            "node_id": res.get("node_id"),
                        })
                benchmark_run = {
                    "run_id": run_id,
                    "started_at": r0.get("started_at"),
                    "finished_at": r0.get("finished_at"),  # ggf. None (Hub liefert nicht immer)
                    "status": r0.get("status"),
                    "verdict": verdict,
                    "summary": summary,
                    "subjects": subjects,
                }
        last_test = {
            "benchmark_run": benchmark_run,
            # Pretest read-only nicht abrufbar: Pretests werden als Panopticor-
            # Spec-Files angelegt + per spec_id gepollt; es gibt keine "letzter
            # Verdikt"-List-API. → Folge-TODO (Phase 2 / kleiner Backend-CR).
            "pretest": None,
            "pretest_note": (
                "Letzter Pretest-Verdikt ist read-only nicht abrufbar (keine List-API; "
                "Pretests laufen als Panopticor-Spec-Files + spec_id-Polling). Folge-TODO."
            ),
            "error": runs_err,
        }

        # ── 3) VERBESSERUNG: Trend je subject/domain aus der Matrix
        matrix_data, matrix_err = await _safe_get("/api/v1/benchmarks/matrix")
        improvement: list[dict] = []
        if isinstance(matrix_data, dict):
            subjects_list = matrix_data.get("subjects") or []
            mat = matrix_data.get("matrix") or {}
            for subj in subjects_list:
                cells = (mat.get(subj) or {}) if isinstance(mat, dict) else {}
                # repräsentative Zelle je subject: bevorzugt eine mit metric_value
                chosen_cell = None
                for cell in cells.values():
                    if isinstance(cell, dict):
                        if cell.get("metric_value") is not None:
                            chosen_cell = cell
                            break
                        chosen_cell = chosen_cell or cell
                if not isinstance(chosen_cell, dict):
                    continue
                trend = chosen_cell.get("trend")  # "up" | "down" | "stable"
                symbol = {"up": "▲", "down": "▼", "stable": "="}.get(trend or "", "=")
                improvement.append({
                    "subject": subj,
                    "domain": chosen_cell.get("domain"),
                    "trend": trend,
                    "symbol": symbol,
                    "metric": chosen_cell.get("metric_string")
                    or (str(chosen_cell.get("metric_value")) if chosen_cell.get("metric_value") is not None else None),
                    "passed": bool(chosen_cell.get("passed")),
                    "stale": bool(chosen_cell.get("stale")),
                })

        return {
            "schema": "octoboss-rollout-status-v1",
            "fetched_at": _dt.datetime.now(_dt.timezone.utc).isoformat(),
            "rollout": rollout,
            "last_test": last_test,
            "improvement": improvement,
            "improvement_error": matrix_err,
        }

    @router.post("/benchmarks/run")
    async def post_benchmarks_run(request: Request) -> Any:
        """Benchmark-Run starten: POST /api/v1/benchmarks/run.

        Body wird 1:1 an OctoBoss weitergeleitet (scope_filters etc.).
        Antwort: 202 {run_id, started_at, scope_filters, message}.
        Bei laufendem Run: Antwort enthaelt summary.skipped=true.
        Kein Auth-Header noetig.
        """
        hub_url, token = _resolve_hub(settings_store)
        try:
            body = await request.json()
        except Exception:
            body = {}
        return await _proxy_post(hub_url, "/api/v1/benchmarks/run", token, body=body)

    return router


# Convenience-Export fuer api.py (analog routes_cluster / routes_cockpit)
router = None  # wird in api.py ueber build_octoboss_router(...) erzeugt
