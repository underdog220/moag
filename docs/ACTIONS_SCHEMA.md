# MOAG Actions-API — Schema-Spec

Stand 2026-05-17 — verbindlich für alle Subagents die an der Aktionen-Achse arbeiten.
Drift-Schutz: Backend und Frontend müssen sich an genau diese Felder halten.

## Grundidee

MOAG hat zwei gleichwertige Top-Achsen:

- **Dashboard** — Anzeige des Zustands (was wir heute haben)
- **Aktionen** — alle ausführbaren Operationen, die wir sonst über die jeweiligen
  Original-GUIs anstoßen würden (Smoke-Test, Benchmark, DSGVO-Check, Node-Reboot, ...)

Die gleichen Aktionen sollen zusätzlich an der passenden Stelle im jeweiligen
Drilldown auftauchen (Mehrere Wege zum gleichen Ziel — DRY-Komponente).

## Pydantic-Schema (Backend) / TypeScript-Mirror (Frontend)

```python
class Action(BaseModel):
    action_id: str            # "<system>.<verb>[.<sub>]"  z.B. "oberon.smoke"
    system_id: str            # "oberon" | "octoboss" | "ocrexpert" | "nasdominator" | "qnapbackup" | "custos" | "panopticor"
    name: str                 # Mensch-lesbar, deutsch — z.B. "DSGVO-Smoke ausführen"
    description: str          # 1-2 Sätze was die Aktion tut
    category: str             # "diagnose" | "config" | "operation"
    sub_area: str | None      # für Drilldown-Einordnung — z.B. "dsgvo", "llm", "instances"
    requires_confirm: bool    # wenn True: Frontend zeigt Confirm-Dialog vor Trigger
    is_destructive: bool      # wenn True: Button rot, ConfirmDialog mit Warnung
    estimated_duration_s: int | None   # Hinweis für UI ("dauert ~30s")
    implemented: bool         # False = Stub (Frontend zeigt grau, "Phase X")
```

```python
class ActionTriggerResponse(BaseModel):
    action_id: str
    triggered_at: datetime
    status: str              # "started" | "completed" | "failed" | "not_implemented"
    result_summary: str | None  # 1 Satz mit dem Ergebnis (deutsch)
    payload: dict             # adapter-spezifische strukturierte Ergebnisdaten
    duration_ms: int | None
    error: str | None         # bei status=failed
```

## Endpoints

### `GET /api/v1/actions`

Read-only. Liefert die komplette Aktions-Registry.

Response:
```json
{
  "actions": [
    {
      "action_id": "oberon.smoke",
      "system_id": "oberon",
      "name": "DSGVO-Smoke ausführen",
      "description": "Triggert den Oberon-Cockpit-Smoke (6 Sub-Checks: DSGVO, PII, NER, OctoBoss, Postgres, Local-LLM).",
      "category": "diagnose",
      "sub_area": "smoke",
      "requires_confirm": false,
      "is_destructive": false,
      "estimated_duration_s": 5,
      "implemented": true
    }
  ],
  "fetched_at": "2026-05-17T..."
}
```

### `POST /api/v1/actions/{action_id}/trigger`

Mutierend (auch wenn die Aktion intern nur read-only ist, ist Trigger ein Schreib-Akt
für das Audit-Log).

Request-Body (optional): adapter-spezifische Parameter, z.B. `{"node_id": "..."}` für
Node-Reboot.

Response: `ActionTriggerResponse` (siehe oben).

Wenn `action_id` nicht existiert: HTTP 404.

Wenn `implemented=false`: HTTP 200 mit `status="not_implemented"` (kein 4xx, weil das
in der Frontend-UI normal behandelbar sein soll).

## Aktions-Konventionen

| action_id-Muster | Beispiel | Bedeutung |
|---|---|---|
| `<system>.smoke` | `oberon.smoke` | Self-Check / Diagnose-Lauf |
| `<system>.health.check` | `ocrexpert.health.check` | Healthcheck-Refresh |
| `<system>.cluster.status` | `octoboss.cluster.status` | Status-Pull (read-only) |
| `<system>.cluster.sync` | `octoboss.cluster.sync` | Cluster-Sync triggern (operation) |
| `<system>.bench.start` | `octoboss.bench.start` | Benchmark anstoßen |
| `<system>.node.reboot` | `octoboss.node.reboot` | destruktiv, requires_confirm |
| `<system>.<modell>.pull` | `octoboss.ollama.pull` | Modell laden |

## V1-Mindestmenge (für den ersten Subagent-Lauf)

**Echt implementiert (3):**
- `oberon.smoke` → proxy auf Oberon `/api/v2/admin/cockpit/smoke`
- `ocrexpert.health.check` → proxy auf OCRexpert `/api/v1/health`
- `octoboss.cluster.status` → proxy auf OctoBoss `/admin/cluster/status`

**Stub (≥7, damit die UI-Liste schon Inhalt zeigt):**
- `oberon.llm.test` (kurzer LLM-Test-Call)
- `oberon.dsgvo.check`
- `octoboss.bench.start`
- `octoboss.node.reboot` (destruktiv)
- `octoboss.ollama.pull`
- `ocrexpert.shadow.batch`
- `nasdominator.services.refresh`
- `custos.rules.run`
- `panopticor.scenario.trigger`

Stubs liefern HTTP 200 mit `{status:"not_implemented", result_summary:"Phase X — noch nicht implementiert"}`.

## Was NICHT in V1

- Asynchrone Long-Running-Jobs mit Polling — V1 ist synchron, alles unter 30s
- Parameter-Eingabe-Forms — V1 nimmt nur optionalen JSON-Body, Frontend zeigt nur
  Plain-Button. Parameter-UI ist Phase 2.
- Audit-Persistierung in DB — V1 logged nur via PipelineLog
