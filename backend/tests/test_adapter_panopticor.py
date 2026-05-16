"""
Smoke-Test fuer panopticor-Adapter (Stub bis Phase 6, CR #4).
"""
from __future__ import annotations

import pytest

from moag.adapters import panopticor
from moag.schemas import SystemStatus


@pytest.mark.asyncio
async def test_stub_returns_system_status():
    status = await panopticor.get_status()
    assert isinstance(status, SystemStatus)


@pytest.mark.asyncio
async def test_stub_is_not_ok():
    status = await panopticor.get_status()
    assert status.ok is False


@pytest.mark.asyncio
async def test_stub_score_is_zero():
    status = await panopticor.get_status()
    assert status.score == 0


@pytest.mark.asyncio
async def test_stub_system_id():
    status = await panopticor.get_status()
    assert status.system_id == "panopticor"


@pytest.mark.asyncio
async def test_stub_has_error():
    status = await panopticor.get_status()
    assert status.error is not None
    assert len(status.error) > 0
