"""
Smoke-Tests fuer oberon-Adapter.

Oberon-Adapter nutzt CockpitClient (sync httpx) via run_in_executor.
Ohne erreichbares Oberon liefert er SystemStatus mit ok=False.
"""
from __future__ import annotations

import pytest
import httpx

from moag.adapters import oberon
from moag.schemas import SystemStatus


@pytest.mark.asyncio
async def test_returns_system_status_type(monkeypatch):
    """Adapter liefert immer ein SystemStatus-Objekt."""
    # Kein Token, kein Oberon erreichbar -> Fehler-Status
    def fake_get(*args, **kwargs):
        raise httpx.ConnectError("not available in test")

    monkeypatch.setattr(httpx, "get", fake_get)

    status = await oberon.get_status(
        base_url="http://127.0.0.1:17900",
        token=None,
    )
    assert isinstance(status, SystemStatus)


@pytest.mark.asyncio
async def test_system_id_is_oberon(monkeypatch):
    def fake_get(*args, **kwargs):
        raise httpx.ConnectError("not available")
    monkeypatch.setattr(httpx, "get", fake_get)

    status = await oberon.get_status(base_url="http://127.0.0.1:17900", token=None)
    assert status.system_id == "oberon"


@pytest.mark.asyncio
async def test_unreachable_returns_ok_false(monkeypatch):
    """Ohne echtes Oberon muss ok=False und score=0 kommen."""
    def fake_get(*args, **kwargs):
        raise httpx.ConnectError("refused")
    monkeypatch.setattr(httpx, "get", fake_get)

    status = await oberon.get_status(base_url="http://127.0.0.1:17900", token=None)
    assert status.ok is False
    assert status.score == 0


@pytest.mark.asyncio
async def test_has_fetched_at(monkeypatch):
    def fake_get(*args, **kwargs):
        raise httpx.ConnectError("refused")
    monkeypatch.setattr(httpx, "get", fake_get)

    status = await oberon.get_status(base_url="http://127.0.0.1:17900", token=None)
    assert status.fetched_at is not None
