"""
Stub-Aktionen fuer MOAG — alle laut docs/ACTIONS_SCHEMA.md V1-Mindestmenge
ausser den 3 echten Aktionen (oberon.smoke, ocrexpert.health.check, octoboss.cluster.status).

Alle Stubs:
- haben implemented=False in ihrem Meta-Objekt
- liefern HTTP 200 mit status="not_implemented"
- erscheinen in der Registry (damit Frontend-Liste schon Inhalt hat)

9 Stubs:
  oberon.llm.test
  oberon.dsgvo.check
  octoboss.bench.start
  octoboss.node.reboot       (destruktiv, requires_confirm)
  octoboss.ollama.pull
  ocrexpert.shadow.batch
  nasdominator.services.refresh
  custos.rules.run
  panopticor.scenario.trigger
"""
from __future__ import annotations

import time
from datetime import datetime, timezone

from moag.actions.registry import register
from moag.schemas import Action, ActionTriggerResponse

# ── Hilfsfunktion: gemeinsamer Stub-Handler ─────────────────────────────────


def _make_stub_handler(action_id: str, phase: str = "Phase 2"):
    """Erzeugt einen async Handler der immer not_implemented zurueckliefert."""
    async def handler(body: dict) -> ActionTriggerResponse:
        return ActionTriggerResponse(
            action_id=action_id,
            triggered_at=datetime.now(timezone.utc),
            status="not_implemented",
            result_summary=f"{phase} — noch nicht implementiert",
            payload={},
            duration_ms=0,
        )
    # Eindeutiger __name__ damit Debugging-Output lesbar bleibt
    handler.__name__ = f"handle_{action_id.replace('.', '_')}"
    return handler


# ── Stub-Registrierungen ────────────────────────────────────────────────────

register(meta=Action(
    action_id="oberon.llm.test",
    system_id="oberon",
    name="LLM-Test-Call",
    description="Sendet einen kurzen Test-Prompt an Oberon und misst Latenz und Tokendurchsatz.",
    category="diagnose",
    sub_area="llm",
    requires_confirm=False,
    is_destructive=False,
    estimated_duration_s=5,
    implemented=False,
))(_make_stub_handler("oberon.llm.test", "Phase 2"))


register(meta=Action(
    action_id="oberon.dsgvo.check",
    system_id="oberon",
    name="DSGVO-Vollcheck",
    description=(
        "Fuehrt einen vollstaendigen DSGVO-Scan durch: PII-Erkennung, "
        "NER-Extraktion und Anonymisierungs-Test gegen synthetische Testdaten."
    ),
    category="diagnose",
    sub_area="dsgvo",
    requires_confirm=False,
    is_destructive=False,
    estimated_duration_s=15,
    implemented=False,
))(_make_stub_handler("oberon.dsgvo.check", "Phase 2"))


register(meta=Action(
    action_id="octoboss.bench.start",
    system_id="octoboss",
    name="Benchmark starten",
    description=(
        "Startet einen OCR-Benchmark-Lauf ueber alle verbundenen Cluster-Nodes "
        "und liefert Durchsatz- und Latenz-Metriken."
    ),
    category="operation",
    sub_area="bench",
    requires_confirm=False,
    is_destructive=False,
    estimated_duration_s=30,
    implemented=False,
))(_make_stub_handler("octoboss.bench.start", "Phase 2"))


register(meta=Action(
    action_id="octoboss.node.reboot",
    system_id="octoboss",
    name="Node neu starten",
    description=(
        "Sendet einen Reboot-Befehl an eine OctoBoss-Node. "
        "DESTRUKTIV — laufende Jobs werden abgebrochen."
    ),
    category="operation",
    sub_area="cluster",
    requires_confirm=True,
    is_destructive=True,
    estimated_duration_s=60,
    implemented=False,
))(_make_stub_handler("octoboss.node.reboot", "Phase 2"))


register(meta=Action(
    action_id="octoboss.ollama.pull",
    system_id="octoboss",
    name="Ollama-Modell laden",
    description=(
        "Zieht ein Ollama-Modell auf eine oder alle Cluster-Nodes. "
        "Kann je nach Modellgroesse mehrere Minuten dauern."
    ),
    category="operation",
    sub_area="llm",
    requires_confirm=False,
    is_destructive=False,
    estimated_duration_s=120,
    implemented=False,
))(_make_stub_handler("octoboss.ollama.pull", "Phase 2"))


register(meta=Action(
    action_id="ocrexpert.shadow.batch",
    system_id="ocrexpert",
    name="Shadow-Batch starten",
    description=(
        "Startet einen Shadow-Verarbeitungs-Batch fuer wartende Dokumente "
        "im Shadow-Input-Verzeichnis."
    ),
    category="operation",
    sub_area="shadow",
    requires_confirm=False,
    is_destructive=False,
    estimated_duration_s=30,
    implemented=False,
))(_make_stub_handler("ocrexpert.shadow.batch", "Phase 2"))


register(meta=Action(
    action_id="nasdominator.services.refresh",
    system_id="nasdominator",
    name="Service-Status aktualisieren",
    description=(
        "Zwingt NasDominator, den Status aller kritischen Services "
        "(Oberon, OctoBoss, Postgres) sofort neu abzufragen."
    ),
    category="diagnose",
    sub_area="services",
    requires_confirm=False,
    is_destructive=False,
    estimated_duration_s=5,
    implemented=False,
))(_make_stub_handler("nasdominator.services.refresh", "Phase 3"))


register(meta=Action(
    action_id="custos.rules.run",
    system_id="custos",
    name="Compliance-Regeln ausfuehren",
    description=(
        "Fuehrt alle aktiven Custos-Compliance-Regeln gegen den aktuellen "
        "System-Zustand aus und liefert neue Findings."
    ),
    category="diagnose",
    sub_area="rules",
    requires_confirm=False,
    is_destructive=False,
    estimated_duration_s=10,
    implemented=False,
))(_make_stub_handler("custos.rules.run", "Phase 4"))


register(meta=Action(
    action_id="panopticor.scenario.trigger",
    system_id="panopticor",
    name="Test-Szenario starten",
    description=(
        "Triggert ein Panopticor-Test-Szenario gegen eine Sandbox-Node. "
        "Ergebnis (READY / MANUAL_REVIEW / BLOCKED) wird zurueckgeliefert."
    ),
    category="operation",
    sub_area="scenarios",
    requires_confirm=True,
    is_destructive=False,
    estimated_duration_s=60,
    implemented=False,
))(_make_stub_handler("panopticor.scenario.trigger", "Phase 6"))
