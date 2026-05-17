"""
MOAG-eigene Pydantic-Schemas — zentrale Typen die ueber Adapter geteilt werden.

SystemStatus ist das Haupt-Schema fuer alle 8 Sub-System-Adapter.
Action + ActionTriggerResponse sind die Schemas fuer die Aktionen-API (docs/ACTIONS_SCHEMA.md).
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field


class SystemStatus(BaseModel):
    """Einheitliches Status-Objekt fuer jedes Sub-System (ADR-008).

    Wird von jedem Adapter via get_status() geliefert und vom Aggregator
    zu Gruppen-Scores verrechnet.
    """
    system_id: str          # "oberon", "octoboss", "sonofseti", ...
    ok: bool
    score: int              # 0..100
    summary: str            # 1 Satz, deutsch
    metrics: dict[str, Any]  # Mini-Indikatoren fuer die UI-Karte
    fetched_at: datetime
    error: str | None = None


# ── Aktionen-API (docs/ACTIONS_SCHEMA.md) ─────────────────────────────────────


class Action(BaseModel):
    """Statische Beschreibung einer ausfuehrbaren Aktion.

    action_id-Schema: "<system>.<verb>[.<sub>]" z.B. "oberon.smoke"
    category:  diagnose | config | operation
    implemented=False: Stub, Frontend zeigt grau / "Phase X"
    """
    action_id: str
    system_id: str
    name: str
    description: str
    category: Literal["diagnose", "config", "operation"]
    sub_area: str | None = None
    requires_confirm: bool = False
    is_destructive: bool = False
    estimated_duration_s: int | None = None
    implemented: bool = True


class ActionTriggerResponse(BaseModel):
    """Antwort nach dem Trigger einer Aktion.

    status-Werte:
      started         — Aktion laeuft noch (V2: Long-Running, in V1 nicht verwendet)
      completed       — Aktion erfolgreich abgeschlossen
      failed          — Aktion fehlgeschlagen (error enthaelt Beschreibung)
      not_implemented — Stub-Aktion (implemented=False in Action)
    """
    action_id: str
    triggered_at: datetime
    status: Literal["started", "completed", "failed", "not_implemented"]
    result_summary: str | None = None
    payload: dict = Field(default_factory=dict)
    duration_ms: int | None = None
    error: str | None = None
