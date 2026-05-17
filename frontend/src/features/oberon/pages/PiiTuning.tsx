// PiiTuning — PII-Erkennungs-Konfiguration der Oberon DSGVO-Engine.
// Datenquelle: GET /api/v1/oberon/pii-tuning

import { useQuery } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import { qk } from "../../../lib/queryKeys";
import { PageBadge } from "../../../components/PageBadge";
import { LoadingSpinner } from "../../../components/LoadingSpinner";
import { EmptyState } from "../../../components/EmptyState";
import { Tooltip } from "../../../components/Tooltip";
import { ActionCard } from "../../aktionen/ActionCard";
import { useQuery as useActionsQuery } from "@tanstack/react-query";
import type { Action } from "../../../lib/types";

export function PiiTuningPage() {
  const { data, isLoading, error, dataUpdatedAt } = useQuery({
    queryKey: qk.oberon.piiTuning,
    queryFn: () => api.oberon.getPiiTuning(),
    refetchInterval: 60_000,
  });

  const { data: actionsData } = useActionsQuery({
    queryKey: qk.actions,
    queryFn: () => api.getActions(),
  });
  const dsgvoAction = actionsData?.actions.find((a: Action) => a.action_id === "oberon.dsgvo.check");

  const updatedAt = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString("de-DE") : "–";
  const isStub = (data as any)?.stub === true;

  // PII-Tuning kann als Array oder Objekt mit entries-Feld kommen
  const entries: any[] = Array.isArray(data)
    ? data
    : Array.isArray((data as any)?.entries)
      ? (data as any).entries
      : [];

  return (
    <div className="p-4" data-testid="oberon-pii-tuning-page">
      <h2 className="mb-4 text-base font-semibold text-fg">PII-Tuning</h2>

      {isLoading && <LoadingSpinner label="Lade PII-Konfiguration..." />}
      {error && <div className="text-sm text-status-error">Fehler: {(error as Error).message}</div>}

      {!isLoading && !error && (
        <>
          {isStub ? (
            <EmptyState title="Kein Zugriff" description={(data as any).message} />
          ) : entries.length === 0 ? (
            <div className="rounded border border-white/10 bg-bg-panel p-4">
              <p className="text-sm text-fg-muted">
                PII-Tuning-Rohdaten:
              </p>
              <pre className="mt-2 overflow-auto rounded bg-bg-elevated p-3 text-xs text-fg">
                {JSON.stringify(data, null, 2)}
              </pre>
            </div>
          ) : (
            <div className="space-y-1">
              {entries.map((entry: any, i: number) => (
                <div
                  key={entry.entity_type ?? i}
                  className="flex items-center gap-3 rounded border border-white/5 bg-bg-panel px-3 py-2 text-sm"
                >
                  <Tooltip
                    title={entry.description ?? `PII-Typ: ${entry.entity_type}`}
                    source="GET /api/v1/oberon/pii-tuning"
                    updatedAt={`Zuletzt: ${updatedAt}`}
                  >
                    <span className="font-mono text-fg">{entry.entity_type}</span>
                  </Tooltip>
                  <span
                    className={`rounded border px-1.5 py-0.5 text-xxs ${
                      entry.enabled
                        ? "border-status-ok/30 bg-status-ok/10 text-status-ok"
                        : "border-white/10 bg-bg-elevated text-fg-muted"
                    }`}
                  >
                    {entry.enabled ? "aktiv" : "inaktiv"}
                  </span>
                  {entry.threshold != null && (
                    <Tooltip
                      title={`Erkennungs-Schwellwert: ${entry.threshold}`}
                      source="GET /api/v1/oberon/pii-tuning"
                      updatedAt={`Zuletzt: ${updatedAt}`}
                      thresholds="0.0 = sehr sensitiv · 1.0 = nur sichere Treffer"
                    >
                      <span className="ml-auto text-xs text-fg-muted">
                        Schwellwert: <span className="tabular-nums text-fg">{entry.threshold}</span>
                      </span>
                    </Tooltip>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* DSGVO-Check ActionCard */}
      {dsgvoAction && (
        <div className="mt-6">
          <h3 className="mb-2 text-sm font-semibold text-fg-muted">DSGVO-Engine testen</h3>
          <ActionCard action={dsgvoAction} />
        </div>
      )}

      <PageBadge id="oberon.pii-tuning" />
    </div>
  );
}

export default PiiTuningPage;
