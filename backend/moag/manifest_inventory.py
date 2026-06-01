"""Manifest-Inventory: Cluster-Intent pro Hub aggregieren.

Ergaenzung zum reinen Health-Check (manifest_health.py): liefert nicht nur
"ist es gruen?", sondern den vollstaendigen Soll-Zustand:

  - Core: default-Version + alle bekannten Versionen + Node-Overrides
  - Bootstrapper: default + Versionen + Node-Overrides via
    /api/v1/seti/bootstrapper/versions (OctoBoss-CR 2026-05-23 umgesetzt);
    Fallback auf /seti/distribute/info fuer alte Hubs
  - Modules: pro Node installierte SonOfSETI-Module + Versionen + Drift-Sicht

Daten-Quellen pro Hub (parallel, jeweils Timeout 5s):
  GET /api/v1/seti/core/versions
  GET /api/v1/seti/bootstrapper/versions
  GET /seti/distribute/info
  GET /seti/nodes?include_test_nodes=true

Architektur-Aussage: "Cluster-Intent sichtbar machen".
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Optional

import httpx

from .pipeline_hooks import plog

logger = logging.getLogger("moag.manifest_inventory")

_PER_REQUEST_TIMEOUT_S = 5.0
_BOOTSTRAPPER_CR_ID = "2026-05-23-bootstrapper-admin-api"


# ---------------------------------------------------------------------------
# Einzel-Probe-Helfer
# ---------------------------------------------------------------------------

async def _fetch_json(
    client: httpx.AsyncClient,
    url: str,
    label: str,
) -> tuple[Optional[dict | list], Optional[str]]:
    """GET <url>, Rueckgabe (json_payload, error_string).

    Bei Erfolg: (payload, None). Bei Fehler: (None, error_msg).
    """
    t0 = time.monotonic()
    try:
        resp = await client.get(url)
        dauer_ms = int((time.monotonic() - t0) * 1000)
        plog.step(
            "manifest.inventory",
            label,
            input={"url": url},
            output={"status": resp.status_code},
            dauer_ms=dauer_ms,
            ok=resp.is_success,
        )
        if not resp.is_success:
            return None, f"HTTP {resp.status_code}"
        return resp.json(), None
    except httpx.TimeoutException:
        return None, "timeout"
    except httpx.ConnectError as exc:
        return None, f"connection_error: {exc}"
    except httpx.HTTPError as exc:
        return None, f"http_error: {exc}"
    except ValueError as exc:
        # JSON-Decode-Fehler
        return None, f"invalid_json: {exc}"


# ---------------------------------------------------------------------------
# Core-Manifest
# ---------------------------------------------------------------------------

async def _gather_core(
    hub_base: str,
    client: httpx.AsyncClient,
) -> dict[str, Any]:
    """Liefert Core-Versions-Block fuer einen Hub.

    Quelle: GET /api/v1/seti/core/versions (offen, kein Auth).
    Falls Hub den Endpoint nicht hat (alte Version), Fallback auf
    /api/v1/seti/core/desired (liefert nur default).
    """
    versions_url = f"{hub_base}/api/v1/seti/core/versions"
    payload, err = await _fetch_json(client, versions_url, "core.versions")

    if err is not None or not isinstance(payload, dict):
        # Fallback: /api/v1/seti/core/desired liefert mind. die default-Version
        desired_url = (
            f"{hub_base}/api/v1/seti/core/desired"
            f"?node_id=00000000-0000-0000-0000-000000000000"
        )
        desired_payload, desired_err = await _fetch_json(
            client, desired_url, "core.desired"
        )
        if desired_err is None and isinstance(desired_payload, dict):
            return {
                "default": desired_payload.get("version") or "",
                "versions": [],
                "overrides": [],
                "asset_inventory_versions": [],
                "supports_versions_api": False,
                "error": (
                    f"/api/v1/seti/core/versions nicht verfuegbar ({err}) — "
                    f"Fallback auf /desired (nur default)"
                ),
            }
        return {
            "default": "",
            "versions": [],
            "overrides": [],
            "asset_inventory_versions": [],
            "supports_versions_api": False,
            "error": err or "core-versions + core-desired beide nicht erreichbar",
        }

    raw_versions = payload.get("versions") or []
    raw_overrides = payload.get("overrides") or {}
    if isinstance(raw_overrides, dict):
        overrides = sorted(
            (
                {"node_id": str(k), "version": str(v)}
                for k, v in raw_overrides.items()
                if isinstance(v, str)
            ),
            key=lambda x: x["node_id"],
        )
    else:
        overrides = []

    # Nur Versions-Strings — SHA + size_bytes liefert /core/versions nicht.
    # Detail-Felder pro Version werden via /core/desired?version=... abrufbar,
    # aber das sprengt das Volumen hier (eine Query pro Version). Frontend
    # holt Details bei Bedarf nach.
    versions_list = [
        {"version": str(v)}
        for v in raw_versions
        if isinstance(v, str)
    ]

    return {
        "default": str(payload.get("default") or ""),
        "versions": versions_list,
        "overrides": overrides,
        "asset_inventory_versions": [
            str(v) for v in (payload.get("asset_inventory_versions") or [])
        ],
        "supports_versions_api": True,
        "error": None,
    }


# ---------------------------------------------------------------------------
# Bootstrapper-Manifest
# ---------------------------------------------------------------------------

async def _gather_bootstrapper_legacy_info(
    hub_base: str,
    client: httpx.AsyncClient,
) -> dict[str, Any]:
    """Fallback: GET /seti/distribute/info (default + sha + size + available).

    Genutzt, wenn der Hub die neue /api/v1/seti/bootstrapper/versions-API
    (OctoBoss-CR 2026-05-23) noch nicht hat. Liefert nur die default-Version
    ohne echte Versions-Liste/Overrides — supports_versions_api=False,
    cr_pending bleibt gesetzt.
    """
    info_url = f"{hub_base}/seti/distribute/info"
    payload, err = await _fetch_json(client, info_url, "bootstrapper.info")
    if err is not None or not isinstance(payload, dict):
        return {
            "default": "",
            "versions": [],
            "overrides": [],
            "supports_versions_api": False,
            "cr_pending": _BOOTSTRAPPER_CR_ID,
            "available": False,
            "sha256": "",
            "size_bytes": 0,
            "error": err or "bootstrapper.info nicht erreichbar",
        }

    binaries = payload.get("binaries") or {}
    boot_bin = binaries.get("bootstrapper") if isinstance(binaries, dict) else {}
    if not isinstance(boot_bin, dict):
        boot_bin = {}

    # SHA / size: Top-Level-Fallback ist wichtig (Bootstrapper-Field-Mapping-Fix)
    sha = (
        boot_bin.get("sha256")
        or payload.get("bootstrapper_sha256", "")
    )
    size = (
        boot_bin.get("size")
        or boot_bin.get("size_bytes")
        or payload.get("bootstrapper_size_bytes", 0)
    )

    default_version = str(payload.get("bootstrapper_version") or "")
    versions_list: list[dict[str, Any]] = []
    if default_version:
        versions_list = [{
            "version": default_version,
            "sha256": str(sha or ""),
            "size_bytes": int(size or 0),
        }]

    return {
        "default": default_version,
        "versions": versions_list,
        "overrides": [],
        "supports_versions_api": False,
        "cr_pending": _BOOTSTRAPPER_CR_ID,
        "available": bool(boot_bin.get("available", default_version != "")),
        "sha256": str(sha or ""),
        "size_bytes": int(size or 0),
        "error": None,
    }


async def _gather_bootstrapper(
    hub_base: str,
    client: httpx.AsyncClient,
) -> dict[str, Any]:
    """Liefert Bootstrapper-Block fuer einen Hub.

    Primaer GET /api/v1/seti/bootstrapper/versions (OctoBoss-CR
    2026-05-23-bootstrapper-admin-api): liefert versions[], default,
    overrides{}, asset_inventory_versions[]. Symmetrisch zu /core/versions.
    supports_versions_api=True ⇒ MOAG-Frontend schaltet Admin-Aktionen frei.

    Fallback (Hub ohne den Endpoint, z.B. alter NAS-Hub): /seti/distribute/info
    via _gather_bootstrapper_legacy_info — dann supports_versions_api=False
    und cr_pending bleibt gesetzt.

    Wire-Format-Hinweis: /bootstrapper/versions liefert nur Versions-Strings
    (keine SHA/size pro Version) — genau wie /core/versions. sha256/size_bytes
    auf Block-Ebene werden best-effort aus /seti/distribute/info ergaenzt.
    """
    versions_url = f"{hub_base}/api/v1/seti/bootstrapper/versions"
    payload, err = await _fetch_json(client, versions_url, "bootstrapper.versions")

    if err is not None or not isinstance(payload, dict):
        # Endpoint fehlt (alter Hub) → Legacy-Fallback
        return await _gather_bootstrapper_legacy_info(hub_base, client)

    raw_versions = payload.get("versions") or []
    raw_overrides = payload.get("overrides") or {}
    if isinstance(raw_overrides, dict):
        overrides = sorted(
            (
                {"node_id": str(k), "version": str(v)}
                for k, v in raw_overrides.items()
                if isinstance(v, str)
            ),
            key=lambda x: x["node_id"],
        )
    else:
        overrides = []

    # /bootstrapper/versions liefert nur Strings (analog /core/versions).
    versions_list = [
        {"version": str(v)}
        for v in raw_versions
        if isinstance(v, str)
    ]

    default_version = str(payload.get("default") or "")

    # SHA/size der aufgeloesten default-Version best-effort aus /distribute/info
    # nachladen (die Versions-API liefert die nicht).
    sha = ""
    size = 0
    available = bool(default_version)
    info_payload, info_err = await _fetch_json(
        client, f"{hub_base}/seti/distribute/info", "bootstrapper.info"
    )
    if info_err is None and isinstance(info_payload, dict):
        binaries = info_payload.get("binaries") or {}
        boot_bin = binaries.get("bootstrapper") if isinstance(binaries, dict) else {}
        if not isinstance(boot_bin, dict):
            boot_bin = {}
        sha = str(boot_bin.get("sha256") or info_payload.get("bootstrapper_sha256", "") or "")
        size = int(
            boot_bin.get("size")
            or boot_bin.get("size_bytes")
            or info_payload.get("bootstrapper_size_bytes", 0)
            or 0
        )
        available = bool(boot_bin.get("available", default_version != ""))

    return {
        "default": default_version,
        "versions": versions_list,
        "overrides": overrides,
        "supports_versions_api": True,
        # CR ist umgesetzt — kein cr_pending mehr
        "available": available,
        "sha256": sha,
        "size_bytes": size,
        "error": None,
    }


# ---------------------------------------------------------------------------
# Module pro Node + Drift
# ---------------------------------------------------------------------------

def _extract_module_list(node: dict) -> list[dict[str, str]]:
    """Extrahiert (name, version, status) pro Node aus dem Heartbeat-Detail.

    OctoBoss legt das Detail unter installed_modules_detail ab. Fallback:
    active_modules liefert nur Namen ohne Version.
    """
    detail = node.get("installed_modules_detail")
    if isinstance(detail, list) and detail:
        out: list[dict[str, str]] = []
        for m in detail:
            if not isinstance(m, dict):
                continue
            name = str(m.get("name") or m.get("module_id") or "").strip()
            if not name:
                continue
            out.append({
                "name": name,
                "version": str(m.get("version") or "?"),
                "status": str(m.get("status") or "?"),
            })
        return out

    active = node.get("active_modules")
    if isinstance(active, list):
        return [
            {"name": str(n), "version": "?", "status": "active"}
            for n in active
            if n
        ]
    return []


def _build_drift(by_node: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Aggregiert Versions-Drift pro Modul ueber alle Nodes.

    Drift = ein Modul, das auf mind. zwei Nodes mit unterschiedlichen
    Versionen laeuft. Module mit nur einer beobachteten Version werden
    weggelassen (kein Drift).
    """
    # module_name -> version -> [node_id, ...]
    bucket: dict[str, dict[str, list[str]]] = {}
    for entry in by_node:
        node_id = entry.get("node_id", "")
        for mod in entry.get("modules", []):
            name = mod.get("name", "")
            version = mod.get("version", "?")
            if not name:
                continue
            bucket.setdefault(name, {}).setdefault(version, []).append(node_id)

    drift: list[dict[str, Any]] = []
    for module_name, versions in bucket.items():
        if len(versions) <= 1:
            continue  # einheitlich, kein Drift
        drift.append({
            "module": module_name,
            "versions": {ver: sorted(nodes) for ver, nodes in versions.items()},
            "version_count": len(versions),
        })
    drift.sort(key=lambda d: (-d["version_count"], d["module"]))
    return drift


async def _gather_modules(
    hub_base: str,
    client: httpx.AsyncClient,
) -> dict[str, Any]:
    """Sammelt installed_modules_detail pro Node + berechnet Drift."""
    nodes_url = f"{hub_base}/seti/nodes?include_test_nodes=true"
    payload, err = await _fetch_json(client, nodes_url, "modules.nodes")
    if err is not None or not isinstance(payload, dict):
        return {
            "by_node": [],
            "drift": [],
            "node_count": 0,
            "module_count": 0,
            "error": err or "/seti/nodes nicht erreichbar",
        }

    nodes_raw = payload.get("nodes") or []
    by_node: list[dict[str, Any]] = []
    seen_modules: set[str] = set()
    for n in nodes_raw:
        if not isinstance(n, dict):
            continue
        modules = _extract_module_list(n)
        for m in modules:
            seen_modules.add(m["name"])
        by_node.append({
            "node_id": str(n.get("node_id") or n.get("id") or ""),
            "hostname": str(n.get("hostname") or ""),
            "connected": bool(n.get("connected", False)),
            "node_pool": str(n.get("node_pool") or "production"),
            "modules": modules,
        })

    return {
        "by_node": by_node,
        "drift": _build_drift(by_node),
        "node_count": len(by_node),
        "module_count": len(seen_modules),
        "error": None,
    }


# ---------------------------------------------------------------------------
# Pro-Hub-Aggregat
# ---------------------------------------------------------------------------

async def gather_hub_inventory(
    hub_base_url: str,
) -> dict[str, Any]:
    """Sammelt Core-, Bootstrapper- und Module-Daten parallel fuer einen Hub.

    Antwort-Schema siehe _build_hub_block.
    """
    hub_base = hub_base_url.rstrip("/")

    async with httpx.AsyncClient(
        timeout=_PER_REQUEST_TIMEOUT_S,
        follow_redirects=True,
    ) as client:
        core, bootstrapper, modules = await asyncio.gather(
            _gather_core(hub_base, client),
            _gather_bootstrapper(hub_base, client),
            _gather_modules(hub_base, client),
        )

    return {
        "core": core,
        "bootstrapper": bootstrapper,
        "modules": modules,
    }


# ---------------------------------------------------------------------------
# Multi-Hub-Wrapper
# ---------------------------------------------------------------------------

async def gather_all_inventories(
    hubs: list[tuple[str, str, bool]],
    overall_timeout_s: float = 8.0,
) -> dict[str, Any]:
    """Aggregiert das Inventory aller konfigurierten Hubs parallel.

    Args:
        hubs: Liste von (hub_id, hub_url, is_active)-Tupeln
        overall_timeout_s: Gesamt-Timeout je Hub (Aussenrand um die Einzel-Probes)
    """
    async def _one(hub_id: str, hub_url: str, is_active: bool) -> dict[str, Any]:
        try:
            data = await asyncio.wait_for(
                gather_hub_inventory(hub_url),
                timeout=overall_timeout_s,
            )
            return {
                "id": hub_id,
                "url": hub_url,
                "is_active": is_active,
                "inventory": data,
                "error": None,
            }
        except asyncio.TimeoutError:
            return {
                "id": hub_id,
                "url": hub_url,
                "is_active": is_active,
                "inventory": None,
                "error": f"timeout nach {overall_timeout_s}s",
            }
        except (httpx.HTTPError, OSError) as exc:
            return {
                "id": hub_id,
                "url": hub_url,
                "is_active": is_active,
                "inventory": None,
                "error": f"connection_error: {exc}",
            }

    tasks = [_one(hid, url, active) for hid, url, active in hubs]
    results = list(await asyncio.gather(*tasks)) if tasks else []

    active_hub_id = next((h[0] for h in hubs if h[2]), "")

    return {
        "schema": "manifest-inventory-v1",
        "active_hub_id": active_hub_id,
        "hubs": results,
    }
