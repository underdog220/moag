"""Manifest-Admin: Schreib-Operationen auf OctoBoss-Manifests via Proxy.

Wraps OctoBoss-Bearer-geschuetzte Endpoints:

  POST /api/v1/admin/seti/core/default      ← Default-Version global setzen
  POST /api/v1/admin/seti/core/override     ← Per-Node-Override setzen/loeschen

Plus zwei MOAG-eigene Hilfs-Endpoints:

  GET  /api/v1/manifest/admin/core/default/impact?version=...&hub_id=...
       liefert betroffene Node-Zahl + bestehende Overrides als Vorschau
       (Doppel-Confirm-Modal-Pflicht aus ADR-007)

  POST /api/v1/manifest/admin/core/pretest
       legt eine Panopticor-Spec-File an und liefert spec_path zurueck —
       Frontend pollt danach den Run-Status

Token-Quelle: SettingsStore.octoboss_admin_token (ENV-Override
MOAG_OCTOBOSS_ADMIN_TOKEN).
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import httpx
from pydantic import BaseModel, Field

from .pipeline_hooks import plog
from .settings_store import SettingsStore

logger = logging.getLogger("moag.manifest_admin")

_FALLBACK_HUB = "http://192.168.200.71:18765"
_PROXY_TIMEOUT_S = 10.0
_PANOPTICOR_OPEN_DIR = Path(r"C:\code\Panopticor\requests\open")


# ---------------------------------------------------------------------------
# Pydantic-Modelle
# ---------------------------------------------------------------------------


class SetDefaultBody(BaseModel):
    version: str
    hub_id: Optional[str] = None  # None ⇒ default_hub_id aus Settings
    pretest_run_id: Optional[str] = None  # Pflicht-Referenz (Panopticor-Pretest)


class SetOverrideBody(BaseModel):
    node_id: str
    version: str
    hub_id: Optional[str] = None


class DeleteOverrideBody(BaseModel):
    node_id: str
    hub_id: Optional[str] = None


class PretestBody(BaseModel):
    target_version: str
    hub_id: Optional[str] = None
    target_kind: str = Field(default="core")  # "core" | "bootstrapper"


class ImpactPreview(BaseModel):
    target_version: str
    hub_id: str
    nodes_total: int
    nodes_affected: int     # Nodes ohne Override (werden umgestellt)
    nodes_pinned: int       # Nodes mit Override (bleiben auf gepinnter Version)
    overrides: list[dict[str, str]] = Field(default_factory=list)
    current_default: str = ""
    error: Optional[str] = None


# ---------------------------------------------------------------------------
# Hub-Auflösung
# ---------------------------------------------------------------------------


def resolve_hub(
    settings_store: SettingsStore,
    hub_id: Optional[str],
) -> tuple[str, str]:
    """Liefert (hub_url, resolved_hub_id). Faellt auf default_hub_id zurueck.

    Bei unbekanntem hub_id wird ValueError geworfen.
    """
    s = settings_store.get()
    target_id = hub_id or s.default_hub_id
    for h in s.hubs:
        if h.id == target_id:
            url = (h.url or "").rstrip("/")
            if url:
                return url, h.id
    # Keine Treffer — fuer den Production-Fall hart fehlen lassen,
    # damit man nicht versehentlich gegen den Fallback-Hub schreibt.
    raise ValueError(f"Hub-ID '{target_id}' nicht in Settings konfiguriert")


def get_admin_token(settings_store: SettingsStore) -> str:
    """Holt den OctoBoss-Admin-Token. Wirft RuntimeError wenn leer."""
    token = (settings_store.get().octoboss_admin_token or "").strip()
    if not token:
        raise RuntimeError(
            "octoboss_admin_token nicht gesetzt — Settings oder "
            "ENV MOAG_OCTOBOSS_ADMIN_TOKEN konfigurieren"
        )
    return token


# ---------------------------------------------------------------------------
# Proxy-Calls
# ---------------------------------------------------------------------------


async def _proxy_admin_post(
    hub_url: str,
    path: str,
    token: str,
    body: dict[str, Any],
) -> tuple[int, dict[str, Any]]:
    """POST <hub_url><path> mit Bearer-Token. Liefert (status, json_or_error)."""
    full_url = f"{hub_url}{path}"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=_PROXY_TIMEOUT_S) as client:
        try:
            resp = await client.post(full_url, json=body, headers=headers)
        except httpx.TimeoutException:
            return 504, {"error": "upstream_timeout", "detail": f"{full_url} hat nicht innerhalb {_PROXY_TIMEOUT_S}s geantwortet"}
        except (httpx.ConnectError, httpx.HTTPError) as exc:
            return 502, {"error": "upstream_unreachable", "detail": str(exc)}

    plog.step(
        "manifest.admin",
        f"POST {path}",
        input={"hub_url": hub_url, "body": body},
        output={"status": resp.status_code},
        dauer_ms=int(resp.elapsed.total_seconds() * 1000),
        ok=resp.is_success,
    )

    try:
        data = resp.json()
    except ValueError:
        data = {"raw_text": resp.text}
    return resp.status_code, data


async def set_core_default(
    settings_store: SettingsStore,
    body: SetDefaultBody,
) -> tuple[int, dict[str, Any]]:
    """POST /api/v1/admin/seti/core/default (Bearer).

    Pretest-Pflicht: body.pretest_run_id MUSS gesetzt sein und auf einen
    GREEN Pretest verweisen (Hart-Block — wird hier nicht inhaltlich geprueft,
    nur referenziert. Frontend verhindert den Aufruf solange Pretest != GREEN).
    """
    if not body.pretest_run_id:
        return 412, {
            "error": "precondition_failed",
            "detail": "pretest_run_id ist Pflicht — Default-Tausch ohne Panopticor-Pretest blockiert",
        }
    hub_url, _hid = resolve_hub(settings_store, body.hub_id)
    token = get_admin_token(settings_store)
    return await _proxy_admin_post(
        hub_url=hub_url,
        path="/api/v1/admin/seti/core/default",
        token=token,
        body={"version": body.version},
    )


async def set_core_override(
    settings_store: SettingsStore,
    body: SetOverrideBody,
) -> tuple[int, dict[str, Any]]:
    """POST /api/v1/admin/seti/core/override mit version=<string>."""
    hub_url, _hid = resolve_hub(settings_store, body.hub_id)
    token = get_admin_token(settings_store)
    return await _proxy_admin_post(
        hub_url=hub_url,
        path="/api/v1/admin/seti/core/override",
        token=token,
        body={"node_id": body.node_id, "version": body.version},
    )


async def delete_core_override(
    settings_store: SettingsStore,
    body: DeleteOverrideBody,
) -> tuple[int, dict[str, Any]]:
    """POST /api/v1/admin/seti/core/override mit version=null (Loeschen)."""
    hub_url, _hid = resolve_hub(settings_store, body.hub_id)
    token = get_admin_token(settings_store)
    return await _proxy_admin_post(
        hub_url=hub_url,
        path="/api/v1/admin/seti/core/override",
        token=token,
        body={"node_id": body.node_id, "version": None},
    )


# ---------------------------------------------------------------------------
# Default-Tausch-Impact-Vorschau
# ---------------------------------------------------------------------------


async def compute_default_impact(
    settings_store: SettingsStore,
    target_version: str,
    hub_id: Optional[str],
) -> ImpactPreview:
    """Berechnet Betroffenheit eines Default-Tauschs.

    Zaehlt Nodes mit/ohne Override gegen den gewaehlten Hub. Nodes OHNE
    Override werden beim Default-Tausch umgestellt; Nodes MIT Override
    bleiben auf der gepinnten Version.
    """
    hub_url, resolved_id = resolve_hub(settings_store, hub_id)

    async with httpx.AsyncClient(timeout=_PROXY_TIMEOUT_S) as client:
        # 1) /core/versions fuer Overrides + aktuelle Default
        try:
            v_resp = await client.get(f"{hub_url}/api/v1/seti/core/versions")
            v_data = v_resp.json() if v_resp.is_success else {}
        except (httpx.HTTPError, ValueError):
            v_data = {}

        # 2) /seti/nodes fuer Gesamt-Anzahl
        try:
            n_resp = await client.get(f"{hub_url}/seti/nodes?include_test_nodes=true")
            n_data = n_resp.json() if n_resp.is_success else {}
        except (httpx.HTTPError, ValueError):
            n_data = {}

    nodes = n_data.get("nodes") or []
    overrides_dict = v_data.get("overrides") or {}
    if not isinstance(overrides_dict, dict):
        overrides_dict = {}

    nodes_total = len(nodes)
    node_ids = {str(n.get("node_id") or n.get("id") or "") for n in nodes if isinstance(n, dict)}

    # Pinned counts nur Nodes die heute im Cluster sind UND Override haben.
    pinned_ids = {nid for nid in overrides_dict.keys() if nid in node_ids}
    nodes_pinned = len(pinned_ids)
    nodes_affected = max(0, nodes_total - nodes_pinned)

    overrides_list = sorted(
        (
            {"node_id": str(k), "version": str(v)}
            for k, v in overrides_dict.items()
            if isinstance(v, str)
        ),
        key=lambda x: x["node_id"],
    )

    return ImpactPreview(
        target_version=target_version,
        hub_id=resolved_id,
        nodes_total=nodes_total,
        nodes_affected=nodes_affected,
        nodes_pinned=nodes_pinned,
        overrides=overrides_list,
        current_default=str(v_data.get("default") or ""),
    )


# ---------------------------------------------------------------------------
# Panopticor-Pretest: Spec-File erzeugen
# ---------------------------------------------------------------------------


def _slugify(version: str) -> str:
    """Datei-System-vertraeglicher Slug aus Versions-String."""
    return "".join(c if c.isalnum() or c in ("-", "_", ".") else "-" for c in version)


def create_pretest_spec(
    target_version: str,
    hub_id: str,
    target_kind: str = "core",
    impact: Optional[ImpactPreview] = None,
) -> dict[str, Any]:
    """Erzeugt Panopticor-Spec-File fuer den Default-Tausch-Pretest.

    Pattern: Weg A (Spec-File) aus globaler CLAUDE.md "Panopticor-Tests aus
    anderen Sessions".

    Liefert:
      {
        "spec_path": <absoluter Pfad>,
        "spec_id":   <Datei-Name ohne .md>,
        "target_version": ...,
        "hub_id": ...,
        "created_at": ISO-8601,
      }
    """
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    slug = _slugify(target_version)
    fname = f"{today}-moag-{target_kind}-default-flip-{slug}.md"
    spec_path = _PANOPTICOR_OPEN_DIR / fname

    impact_block = ""
    if impact is not None:
        impact_block = (
            f"\n**Betroffenheit (zum Anfrage-Zeitpunkt):**\n"
            f"- Nodes total: {impact.nodes_total}\n"
            f"- Nodes betroffen (ohne Override): {impact.nodes_affected}\n"
            f"- Nodes gepinnt (Override aktiv): {impact.nodes_pinned}\n"
            f"- Aktueller Default: `{impact.current_default}`\n"
        )

    content = f"""# MOAG · {target_kind.title()}-Default-Tausch auf `{target_version}` — Pretest

**Quelle:** MOAG `/octoboss/manifest-health` (`manifest_admin.create_pretest_spec`)
**Datum:** {today}
**Hub-ID:** `{hub_id}`
**Ziel-Version:** `{target_version}`
**Ziel:** `{target_kind}` (Core- oder Bootstrapper-Manifest)
{impact_block}

## Was testen

Default-Tausch der globalen `{target_kind}`-Manifest-Version auf `{target_version}`
auf dem Hub `{hub_id}` als Cluster-Intent verifizieren — bevor MOAG den
Tausch live anstoesst.

Zu pruefen:
- Manifest-Validator gegen Ziel-Manifest gruen
- Versionierte EXE/Bundle ist im Asset-Inventar erreichbar (kein 404)
- Rueckwaerts-Kompatibilitaet zu aktuellen Cluster-Nodes (keine
  `SCHEMA_DRIFT`/`MISSING_FIELD` Codes)
- Cache-TTL-Verhalten des Hubs nach Schreib-Aktion

## Eingabe-Artefakt

Aktuelles Production-Manifest auf Hub `{hub_id}`, Lesen via:
- `GET /api/v1/seti/core/versions`
- `GET /seti/distribute/info`

## Akzeptanzkriterium

**GREEN:**
- `manifest-validator.py` gegen das Ziel-Manifest exit 0
- Alle Versionen aus `versions{{}}` haben gueltige SHA256 + size
- `cross-ref`-Check fuer `default_version = {target_version}` ist gruen
- Keine `SERVICE_CORPSE`, `SINGLETON_VIOLATION`, `STOP_PENDING_HANG`-Codes
  in den Pretest-Logs

**RED:**
- Beliebiger Validator-Fehler
- Schema-Drift gegen aktuelle Cluster-Nodes
- Asset-Inventar-404 fuer die Ziel-Version

## Callback-Pfad

`POST http://localhost:17900/api/v1/manifest/admin/pretest-callback`
(Body: `{{run_id, verdict: "green"|"red", details}}`)

## Verwandte CRs / Memories

- MOAG-Architektur: "Cluster-Intent sichtbar und steuerbar machen"
  (Diskussion 2026-05-22)
- OctoBoss-CR `2026-05-23-bootstrapper-admin-api` (parallele Arbeit fuer
  Bootstrapper-Pendant)
- Lessons: `C:\\code\\docs\\lessons\\` — vor Cutover relevanter Lessons
  konsultieren (Cache-TTL, Manifest-Edit-Pretest)
"""

    spec_path.parent.mkdir(parents=True, exist_ok=True)
    spec_path.write_text(content, encoding="utf-8")
    logger.info("Panopticor-Pretest-Spec angelegt: %s", spec_path)

    return {
        "spec_path": str(spec_path),
        "spec_id": fname.removesuffix(".md"),
        "target_version": target_version,
        "hub_id": hub_id,
        "target_kind": target_kind,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
