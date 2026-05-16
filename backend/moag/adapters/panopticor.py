"""
Panopticor-Adapter — Stub bis Phase 6.

Echte Implementierung: FastAPI-Headless-Modus parallel zur Desktop-App.
CR #4 offen fuer Status-Endpoint.

Hinweis Doppelrolle: MOAG-Cutover-Skripte werden IN Panopticor getestet
(Sandbox-Pflicht aus globaler CLAUDE.md), waehrend MOAG hier den
Panopticor-Status anzeigt.
"""
from __future__ import annotations

from datetime import datetime, timezone

from moag.schemas import SystemStatus


async def get_status(
    base_url: str = "http://127.0.0.1:8787",
    token: str | None = None,
) -> SystemStatus:
    """Stub — wartet auf CR #4 fuer Status-Endpoint (Phase 6)."""
    return SystemStatus(
        system_id="panopticor",
        ok=False,
        score=0,
        summary="Panopticor noch nicht angebunden — wartet auf CR #4 (Phase 6).",
        metrics={},
        fetched_at=datetime.now(timezone.utc),
        error="noch nicht angebunden — wartet auf CR #4 (Phase 6)",
    )
