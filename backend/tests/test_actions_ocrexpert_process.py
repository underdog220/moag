"""
Tests fuer ocrexpert.process Aktion.

2026-05-17: Aktion ist STUB bis Phase 1.5b — OCRexpert-Endpoints
brauchen multipart-Upload oder URL-Objekte, beides nicht in MOAG-V1.
Echte Verarbeitung via ocrexpert.shadow.batch (siehe dort).
"""
from __future__ import annotations

import pytest

from moag.schemas import ActionTriggerResponse


@pytest.mark.asyncio
async def test_process_is_stub():
    """Stub-Status: liefert not_implemented mit alternative_action_id-Hinweis."""
    from moag.actions.ocrexpert_process import handle_ocrexpert_process

    result = await handle_ocrexpert_process({})

    assert isinstance(result, ActionTriggerResponse)
    assert result.action_id == "ocrexpert.process"
    assert result.status == "not_implemented"
    assert "Phase 1.5b" in result.result_summary
    assert result.payload["alternative_action_id"] == "ocrexpert.shadow.batch"


@pytest.mark.asyncio
async def test_process_stub_ignores_body():
    """Auch mit Body wird Stub-Antwort geliefert."""
    from moag.actions.ocrexpert_process import handle_ocrexpert_process

    result = await handle_ocrexpert_process({"pfad": "/tmp/test.pdf", "profile": "custom"})

    assert result.status == "not_implemented"


@pytest.mark.asyncio
async def test_process_in_registry_as_stub():
    """In Registry mit implemented=False markiert."""
    from moag.actions import ACTION_REGISTRY

    assert "ocrexpert.process" in ACTION_REGISTRY
    entry = ACTION_REGISTRY["ocrexpert.process"]
    assert entry.meta.implemented is False
    assert entry.meta.system_id == "ocrexpert"
    assert entry.meta.sub_area == "process"
