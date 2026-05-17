// AktionenPage — zweite Top-Achse neben dem Dashboard.
// Zeigt alle ausführbaren Operationen, gruppiert nach Sub-System.
// Datenquelle: GET /api/v1/actions (Polling deaktiviert — manuell refreshbar).

import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { qk } from "../../lib/queryKeys";
import { PageBadge } from "../../components/PageBadge";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { ActionCard } from "./ActionCard";
import type { Action } from "../../lib/types";

// System-ID → Anzeigename (synchron zum SYSTEM_INFO im Aggregator).
const SYSTEM_NAMES: Record<string, string> = {
  oberon:       "Oberon",
  octoboss:     "OctoBoss",
  ocrexpert:    "OCRexpert",
  nasdominator: "NasDominator",
  qnapbackup:   "qnapbackup",
  custos:       "Custos",
  panopticor:   "Panopticor",
};

// Reihenfolge der Gruppen (zuerst KI-Systeme, dann Infra, dann C&T)
const SYSTEM_ORDER: string[] = [
  "oberon",
  "octoboss",
  "ocrexpert",
  "nasdominator",
  "qnapbackup",
  "custos",
  "panopticor",
];

/** Gruppiert Aktionen nach system_id und sortiert nach SYSTEM_ORDER. */
function groupBySystem(actions: Action[]): Array<{ system_id: string; actions: Action[] }> {
  const map = new Map<string, Action[]>();
  for (const action of actions) {
    const bucket = map.get(action.system_id) ?? [];
    bucket.push(action);
    map.set(action.system_id, bucket);
  }

  // Sortierung: bekannte Systeme in definierter Reihenfolge, unbekannte ans Ende
  const result: Array<{ system_id: string; actions: Action[] }> = [];
  for (const id of SYSTEM_ORDER) {
    if (map.has(id)) {
      result.push({ system_id: id, actions: map.get(id)! });
    }
  }
  // Unbekannte system_ids (Schema-Erweiterungen)
  for (const [id, acts] of map) {
    if (!SYSTEM_ORDER.includes(id)) {
      result.push({ system_id: id, actions: acts });
    }
  }
  return result;
}

export function AktionenPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: qk.actions,
    queryFn: () => api.getActions(),
    // Aktionen-Registry ändert sich selten — kein Auto-Refetch
    refetchInterval: false,
    retry: 1,
  });

  const actions = data?.actions ?? [];
  const groups = groupBySystem(actions);

  return (
    <div className="min-h-full p-4 pb-12" data-testid="aktionen-page">
      {/* Header */}
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-fg">MOAG — Aktionen</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Alle ausführbaren Operationen über alle Sub-Systeme. Klick auf „Start" führt die Aktion aus.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          className="shrink-0 rounded-lg border border-white/10 bg-bg-subtle px-3 py-3
                     text-sm text-fg-muted min-h-[44px] transition-colors
                     hover:border-white/20 hover:text-fg
                     focus:outline-none focus:ring-2 focus:ring-brand/60"
          title="Aktions-Liste neu laden"
        >
          Aktualisieren
        </button>
      </header>

      {/* Ladezustand */}
      {isLoading && actions.length === 0 && (
        <LoadingSpinner label="Lade Aktionen..." />
      )}

      {/* Fehler */}
      {error && actions.length === 0 && (
        <div
          data-testid="aktionen-error"
          className="rounded border border-status-error/30 bg-status-error/10 p-4 text-sm text-status-error"
        >
          Fehler beim Laden der Aktionen: {(error as Error).message}
        </div>
      )}

      {/* Empty-State */}
      {!isLoading && !error && actions.length === 0 && (
        <div
          data-testid="aktionen-empty"
          className="rounded border border-white/10 bg-bg-panel p-8 text-center text-sm text-fg-muted"
        >
          Keine Aktionen verfügbar. Backend antwortet möglicherweise noch nicht.
        </div>
      )}

      {/* Gruppen */}
      {groups.map(({ system_id, actions: groupActions }) => (
        <section
          key={system_id}
          className="mb-8"
          data-testid={`aktionen-group-${system_id}`}
        >
          {/* Gruppen-Headline */}
          <div className="mb-3 flex items-center gap-3">
            <h2 className="text-base font-semibold uppercase tracking-wide text-fg-subtle">
              {SYSTEM_NAMES[system_id] ?? system_id}
            </h2>
            <span className="text-xs text-fg-subtle">
              {groupActions.length} Aktion{groupActions.length !== 1 ? "en" : ""}
            </span>
          </div>

          {/* ActionCards in Grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {groupActions.map((action) => (
              <ActionCard key={action.action_id} action={action} />
            ))}
          </div>
        </section>
      ))}

      <PageBadge id="aktionen" />
    </div>
  );
}

export default AktionenPage;
