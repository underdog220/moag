"""
MOAG-eigene Pydantic-Schemas — zentrale Typen die ueber Adapter geteilt werden.

SystemStatus ist das Haupt-Schema fuer alle 8 Sub-System-Adapter.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

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
