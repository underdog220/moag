// Custos Rules-Seite — Regel-Engine-Liste + Last-Run + ActionCard

import { useQuery } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import { qk } from "../../../lib/queryKeys";
import { PageBadge } from "../../../components/PageBadge";
import { LoadingSpinner } from "../../../components/LoadingSpinner";
import { EmptyState } from "../../../components/EmptyState";
import { Tooltip } from "../../../components/Tooltip";
import type { CustosRegel } from "../../../lib/types";

const KATEGORIE_LABEL: Record<string, string> = {
  DOKUMENTATION: "Dokumentation",
  FINANZIELL: "Finanziell",
  ZEITLICH: "Zeitlich",
  KONSISTENZ: "Konsistenz",
  CHANCE: "Chance",
};

const SCHWERE_COLOR: Record<string, string> = {
  CRIT: "text-status-error",
  WARN: "text-status-warn",
  INFO: "text-fg-muted",
};

function RuleRow({ regel }: { regel: CustosRegel }) {
  const lastRun = regel.letzter_lauf
    ? new Date(regel.letzter_lauf).toLocaleString("de-DE")
    : "Noch nicht gelaufen";

  return (
    <div className="flex flex-col gap-1 rounded border border-white/5 bg-bg-panel px-4 py-3">
      <div className="flex items-center gap-3">
        <Tooltip
          title="Standard-Schwere der erzeugten Findings"
          source="/api/v1/custos/rules"
        >
          <span className={`text-xs font-semibold ${SCHWERE_COLOR[regel.schwere_default] ?? "text-fg-muted"}`}>
            {regel.schwere_default}
          </span>
        </Tooltip>
        <span className="flex-1 truncate text-sm font-medium text-fg">{regel.titel}</span>
        <Tooltip
          title={regel.aktiv ? "Regel ist aktiv" : "Regel ist deaktiviert"}
          source="/api/v1/custos/rules"
        >
          <span
            className={`rounded px-2 py-0.5 text-xs ${
              regel.aktiv
                ? "bg-status-ok/10 text-status-ok"
                : "bg-fg-subtle/10 text-fg-subtle"
            }`}
          >
            {regel.aktiv ? "Aktiv" : "Inaktiv"}
          </span>
        </Tooltip>
      </div>

      <p className="text-xs text-fg-muted">{regel.beschreibung}</p>

      <div className="flex flex-wrap gap-4 text-xs text-fg-subtle">
        <Tooltip
          title="Kategorie der Compliance-Regel"
          source="/api/v1/custos/rules"
        >
          <span>{KATEGORIE_LABEL[regel.kategorie] ?? regel.kategorie}</span>
        </Tooltip>
        <Tooltip
          title="Geplantes Laufintervall in Minuten"
          source="/api/v1/custos/rules"
        >
          <span>Intervall: {regel.laufintervall_minuten} min</span>
        </Tooltip>
        <Tooltip
          title="Zeitpunkt des letzten automatischen Rule-Engine-Laufs"
          source="/api/v1/custos/audit"
        >
          <span>Letzter Lauf: {lastRun}</span>
        </Tooltip>
      </div>
    </div>
  );
}

function RulesRunActionCard() {
  const { data: actions } = useQuery({
    queryKey: qk.actions,
    queryFn: () => api.getActions(),
  });

  const action = actions?.actions?.find((a) => a.action_id === "custos.rules.run");
  if (!action) return null;

  const handleRun = async () => {
    if (!window.confirm("Alle Compliance-Regeln jetzt ausführen?")) return;
    try {
      const result = await api.triggerAction("custos.rules.run", {});
      alert(
        result.status === "completed"
          ? `Fertig: ${result.result_summary}`
          : `Status: ${result.status} — ${result.result_summary ?? result.error ?? ""}`,
      );
    } catch (e) {
      alert(`Fehler: ${(e as Error).message}`);
    }
  };

  return (
    <div className="rounded border border-brand/20 bg-brand/5 px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-fg">{action.name}</p>
          <p className="text-xs text-fg-muted">{action.description}</p>
          {action.estimated_duration_s && (
            <p className="text-xs text-fg-subtle">Dauert ca. {action.estimated_duration_s}s</p>
          )}
        </div>
        <Tooltip
          title="Startet alle aktiven Compliance-Regeln manuell"
          source="/api/v1/actions/custos.rules.run/trigger"
        >
          <button
            type="button"
            onClick={handleRun}
            className="shrink-0 rounded bg-brand px-4 py-2 text-xs font-semibold text-white hover:bg-brand/80 active:scale-95 transition-transform"
          >
            Jetzt ausführen
          </button>
        </Tooltip>
      </div>
    </div>
  );
}

export function RulesPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: qk.custos.rules,
    queryFn: () => api.custos.getRules(),
    refetchInterval: 60_000,
  });

  const regeln: CustosRegel[] = Array.isArray(data) ? data : [];

  return (
    <div className="flex flex-col gap-4 p-4" data-testid="custos-rules">
      <RulesRunActionCard />

      {isLoading && <LoadingSpinner label="Lade Regeln..." />}
      {error && (
        <div className="text-sm text-status-error">
          Fehler: {(error as Error).message}
        </div>
      )}
      {!isLoading && !error && regeln.length === 0 && (
        <EmptyState
          title="Keine Regeln"
          description="Noch keine Compliance-Regeln im System registriert."
        />
      )}
      {!isLoading && regeln.length > 0 && (
        <div className="space-y-2">
          {regeln.map((r) => (
            <RuleRow key={r.id} regel={r} />
          ))}
        </div>
      )}

      <PageBadge id="custos.rules" />
    </div>
  );
}

export default RulesPage;
