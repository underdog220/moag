"""
QnapBackup-Adapter — Stub bis Phase 5.

Echte Implementierung: HTTP-Status-API offen (CR #3).
Web-UI lebt bereits auf VDR.
"""
from __future__ import annotations

from datetime import datetime, timezone

from moag.schemas import SystemStatus


async def get_status(
    base_url: str | None = None,
    token: str | None = None,
) -> SystemStatus:
    """Stub — HTTP-Status-API-CR (#3) noch nicht umgesetzt (Phase 5)."""
    return SystemStatus(
        system_id="qnapbackup",
        ok=False,
        score=0,
        summary="qnapbackup noch nicht angebunden — wartet auf CR #3 (Phase 5).",
        metrics={},
        fetched_at=datetime.now(timezone.utc),
        error="noch nicht angebunden — wartet auf CR #3 (Phase 5)",
    )
