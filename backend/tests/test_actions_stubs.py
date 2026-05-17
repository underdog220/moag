"""
Tests fuer Stub-Aktionen.

Alle Stubs muessen:
- in ACTION_REGISTRY vorhanden sein
- implemented=False haben
- status=not_implemented liefern
- keine Exception werfen

Aktueller Stand: die meisten ehemals als Stubs deklarierten Aktionen sind
inzwischen echt implementiert. Nur 3 verbliebene echte Stubs werden hier
geprueft. Alle echten Aktionen haben eigene Test-Dateien.
"""
from __future__ import annotations

import pytest

import moag.actions  # noqa: F401 -- stellt sicher dass Registry befuellt ist
from moag.actions.registry import ACTION_REGISTRY
from moag.schemas import ActionTriggerResponse

# Verbleibende Stubs (implemented=False) nach aktueller Registry
STUB_IDS = [
    # nasdominator.services.refresh ist seit Phase 3 ECHT (implemented=True)
    # Eigen-Test: test_actions_nasdominator_services_refresh.py
    "octoboss.node.reboot",
    "panopticor.scenario.trigger",
]

# Alle Pflicht-Aktions-IDs gemaess Schema-Spec muessen vorhanden sein --
# einige davon sind jetzt echt (implemented=True), einige sind Stubs
ALL_MANDATORY_IDS = [
    "oberon.smoke",
    "ocrexpert.health.check",
    "octoboss.cluster.status",
    "oberon.llm.test",
    "oberon.dsgvo.check",
    "octoboss.bench.start",
    "octoboss.node.reboot",
    "octoboss.ollama.pull",
    "ocrexpert.shadow.batch",
    "nasdominator.services.refresh",
    "custos.rules.run",
    "panopticor.scenario.trigger",
]


def test_all_mandatory_in_registry():
    """Alle Pflicht-Aktions-IDs aus ACTIONS_SCHEMA.md muessen vorhanden sein."""
    for action_id in ALL_MANDATORY_IDS:
        assert action_id in ACTION_REGISTRY, f"Pflicht-ID '{action_id}' fehlt in ACTION_REGISTRY"


def test_all_stubs_in_registry():
    """Alle verbleibenden Stub-IDs muessen in der Registry sein."""
    for action_id in STUB_IDS:
        assert action_id in ACTION_REGISTRY, f"Stub '{action_id}' fehlt in ACTION_REGISTRY"


def test_stubs_have_implemented_false():
    """Verbleibende Stubs muessen implemented=False haben."""
    for action_id in STUB_IDS:
        meta = ACTION_REGISTRY[action_id].meta
        assert meta.implemented is False, f"Stub '{action_id}' hat implemented=True (erwartet False)"


@pytest.mark.asyncio
@pytest.mark.parametrize("action_id", STUB_IDS)
async def test_stub_returns_not_implemented(action_id: str):
    """Jeder Stub liefert status=not_implemented ohne Exception."""
    defn = ACTION_REGISTRY[action_id]
    result = await defn.handler({})

    assert isinstance(result, ActionTriggerResponse)
    assert result.action_id == action_id
    assert result.status == "not_implemented"
    assert result.result_summary is not None
    assert "implementiert" in (result.result_summary or "").lower()


@pytest.mark.asyncio
async def test_stub_with_body_ignored():
    """Stub ignoriert Request-Body (kein Crash)."""
    defn = ACTION_REGISTRY["octoboss.node.reboot"]
    result = await defn.handler({"node_id": "test-node", "force": True})

    assert result.status == "not_implemented"


def test_destructive_stub_has_confirm_flag():
    """octoboss.node.reboot muss requires_confirm=True und is_destructive=True haben."""
    meta = ACTION_REGISTRY["octoboss.node.reboot"].meta
    assert meta.requires_confirm is True
    assert meta.is_destructive is True
