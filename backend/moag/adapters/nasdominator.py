"""
NasDominator-Adapter — Stub bis Phase 3.

Echte Implementierung: FastAPI Port 9090 auf QNAP NAS.
Kern-Datenquelle: Critical-Services-Layer.
"""
from __future__ import annotations

from datetime import datetime, timezone

from moag.schemas import SystemStatus


async def get_status(
    base_url: str = "http://192.168.200.169:9090",
    token: str | None = None,
) -> SystemStatus:
    """Stub — noch nicht angebunden (Phase 3)."""
    return SystemStatus(
        system_id="nasdominator",
        ok=False,
        score=0,
        summary="NasDominator noch nicht angebunden — Phase 3.",
        metrics={},
        fetched_at=datetime.now(timezone.utc),
        error="noch nicht angebunden — Phase 3",
    )
