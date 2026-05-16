"""
Custos-Adapter — Stub bis Phase 4.

Echte Implementierung: FastAPI Port 17890.
Achtung: Port-Konflikt mit DevLoop moeglich — in Settings pruefen.
"""
from __future__ import annotations

from datetime import datetime, timezone

from moag.schemas import SystemStatus


async def get_status(
    base_url: str = "http://192.168.200.71:17890",
    token: str | None = None,
) -> SystemStatus:
    """Stub — noch nicht angebunden (Phase 4)."""
    return SystemStatus(
        system_id="custos",
        ok=False,
        score=0,
        summary="Custos noch nicht angebunden — Phase 4.",
        metrics={},
        fetched_at=datetime.now(timezone.utc),
        error="noch nicht angebunden — Phase 4",
    )
