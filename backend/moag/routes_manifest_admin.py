"""Routen fuer Manifest-Admin (Default-Tausch, Pinning, Pretest-Anstoss).

Prefix: /api/v1/manifest/admin

  POST /core/default               ← Body: {version, hub_id?, pretest_run_id}
  POST /core/override              ← Body: {node_id, version, hub_id?}
  POST /core/override/delete       ← Body: {node_id, hub_id?}
  GET  /core/default/impact        ← ?version=...&hub_id=...
  POST /pretest                    ← Body: {target_version, hub_id?, target_kind?}
  POST /pretest-callback           ← Body: {spec_id, verdict, details?}
  GET  /pretest/{spec_id}          ← liest aktuellen Status (pending|green|red)
"""
from __future__ import annotations

import logging
import threading
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from .manifest_admin import (
    DeleteOverrideBody,
    SetDefaultBody,
    SetOverrideBody,
    PretestBody,
    compute_default_impact,
    create_pretest_spec,
    delete_core_override,
    set_core_default,
    set_core_override,
)
from .settings_store import SettingsStore

logger = logging.getLogger("moag.routes_manifest_admin")


# ---------------------------------------------------------------------------
# In-Memory-Store fuer Pretest-Status (Thread-safe)
# ---------------------------------------------------------------------------

class _PretestStore:
    """Haelt Pretest-Ergebnisse pro spec_id in-memory.

    Persistenz nicht noetig — bei Neustart von MOAG ist der laufende
    Pretest sowieso weg, Frontend kann ein neues Spec-File anlegen.
    """

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._items: dict[str, dict[str, Any]] = {}

    def add(self, spec_id: str, payload: dict[str, Any]) -> None:
        with self._lock:
            base = self._items.get(spec_id, {})
            base.update(payload)
            self._items[spec_id] = base

    def get(self, spec_id: str) -> Optional[dict[str, Any]]:
        with self._lock:
            return self._items.get(spec_id)

    def update_verdict(self, spec_id: str, verdict: str, details: Any = None) -> bool:
        with self._lock:
            if spec_id not in self._items:
                return False
            self._items[spec_id]["verdict"] = verdict
            self._items[spec_id]["verdict_at"] = datetime.now(timezone.utc).isoformat()
            if details is not None:
                self._items[spec_id]["details"] = details
            return True


_pretest_store = _PretestStore()


class PretestCallbackBody(BaseModel):
    spec_id: str
    verdict: str  # "green" | "red" | "pending"
    details: Optional[Any] = None


# ---------------------------------------------------------------------------
# Router-Factory
# ---------------------------------------------------------------------------


def build_manifest_admin_router(settings_store: SettingsStore) -> APIRouter:
    router = APIRouter(prefix="/api/v1/manifest/admin", tags=["manifest-admin"])

    @router.get("/core/default/impact")
    async def core_default_impact(
        version: str = Query(..., min_length=1),
        hub_id: Optional[str] = Query(default=None),
    ) -> dict:
        """Vorschau: wie viele Nodes wuerde ein Default-Tausch betreffen.

        Pflicht-Read vor Default-Tausch (Doppel-Confirm-Modal-Pflicht).
        """
        try:
            impact = await compute_default_impact(
                settings_store=settings_store,
                target_version=version,
                hub_id=hub_id,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        return impact.model_dump()

    @router.post("/core/default")
    async def core_set_default(body: SetDefaultBody) -> dict:
        """Setzt default_version global auf dem Hub.

        Pretest-Pflicht: body.pretest_run_id muss auf einen GREEN-Run zeigen.
        MOAG prueft den Verdict gegen den lokalen Pretest-Store (Hart-Block).
        """
        # Hart-Block: Pretest-Run muss GREEN sein
        if not body.pretest_run_id:
            raise HTTPException(
                status_code=412,
                detail="pretest_run_id ist Pflicht — Default-Tausch ohne Panopticor-Pretest blockiert",
            )
        entry = _pretest_store.get(body.pretest_run_id)
        if not entry:
            raise HTTPException(
                status_code=412,
                detail=f"pretest_run_id '{body.pretest_run_id}' nicht gefunden — Pretest erst via POST /pretest starten",
            )
        if entry.get("verdict") != "green":
            raise HTTPException(
                status_code=412,
                detail=f"Pretest-Verdict ist '{entry.get('verdict', 'pending')}' — Default-Tausch nur bei GREEN moeglich",
            )

        try:
            status, data = await set_core_default(settings_store, body)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        except RuntimeError as exc:
            raise HTTPException(status_code=401, detail=str(exc))
        if status >= 400:
            raise HTTPException(status_code=status, detail=data)
        return {"ok": True, "upstream": data, "pretest_run_id": body.pretest_run_id}

    @router.post("/core/override")
    async def core_set_override(body: SetOverrideBody) -> dict:
        """Setzt Override (Node-Pinning)."""
        try:
            status, data = await set_core_override(settings_store, body)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        except RuntimeError as exc:
            raise HTTPException(status_code=401, detail=str(exc))
        if status >= 400:
            raise HTTPException(status_code=status, detail=data)
        return {"ok": True, "upstream": data}

    @router.post("/core/override/delete")
    async def core_delete_override(body: DeleteOverrideBody) -> dict:
        """Loescht Node-Override (Pinning entfernen)."""
        try:
            status, data = await delete_core_override(settings_store, body)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        except RuntimeError as exc:
            raise HTTPException(status_code=401, detail=str(exc))
        if status >= 400:
            raise HTTPException(status_code=status, detail=data)
        return {"ok": True, "upstream": data}

    @router.post("/pretest")
    async def pretest_start(body: PretestBody) -> dict:
        """Erzeugt Panopticor-Pretest-Spec-File und legt Eintrag im Store an.

        Frontend pollt danach GET /pretest/{spec_id} bis verdict != "pending".
        """
        try:
            # Impact-Vorschau einbinden, damit das Spec-File aussagekraeftig ist
            impact = await compute_default_impact(
                settings_store=settings_store,
                target_version=body.target_version,
                hub_id=body.hub_id,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

        spec = create_pretest_spec(
            target_version=body.target_version,
            hub_id=impact.hub_id,
            target_kind=body.target_kind,
            impact=impact,
        )
        spec_id = spec["spec_id"]
        _pretest_store.add(spec_id, {
            **spec,
            "verdict": "pending",
            "impact": impact.model_dump(),
        })
        return {
            "spec_id": spec_id,
            "spec_path": spec["spec_path"],
            "verdict": "pending",
            "impact": impact.model_dump(),
        }

    @router.post("/pretest-callback")
    async def pretest_callback(body: PretestCallbackBody) -> dict:
        """Panopticor ruft hier zurueck mit dem Verdict.

        Frontend muss diesen Endpoint nicht selbst rufen — er ist im
        Spec-File als callback_url eingetragen.
        """
        if body.verdict not in ("green", "red", "pending"):
            raise HTTPException(
                status_code=400,
                detail=f"verdict muss green|red|pending sein (got: {body.verdict})",
            )
        ok = _pretest_store.update_verdict(body.spec_id, body.verdict, body.details)
        if not ok:
            raise HTTPException(
                status_code=404,
                detail=f"spec_id '{body.spec_id}' nicht im Pretest-Store",
            )
        return {"ok": True, "spec_id": body.spec_id, "verdict": body.verdict}

    @router.get("/pretest/{spec_id}")
    async def pretest_status(spec_id: str) -> dict:
        entry = _pretest_store.get(spec_id)
        if not entry:
            raise HTTPException(
                status_code=404,
                detail=f"spec_id '{spec_id}' nicht gefunden",
            )
        return entry

    return router


# Exponiere den Store fuer Tests
def _get_pretest_store_for_tests() -> _PretestStore:
    return _pretest_store
