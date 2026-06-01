// PiiTuning — PII-Erkennungs-Konfiguration der Oberon DSGVO-Engine.
// Datenquelle: GET /api/v1/oberon/pii-tuning

import { useQuery } from "@tanstack/react-query";
import { useQuery as useActionsQuery } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import { qk } from "../../../lib/queryKeys";
import { PageBadge } from "../../../components/PageBadge";
import { LoadingSpinner } from "../../../components/LoadingSpinner";
import { EmptyState } from "../../../components/EmptyState";
import { Tooltip } from "../../../components/Tooltip";
import { ActionCard } from "../../aktionen/ActionCard";
import { Panel, Chip, MiniBar, ErrorBanner } from "../_oberon_ui";
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

  const entries: any[] = Array.isArray(data)
    ? data
    : Array.isArray((data as any)?.entries)
      ? (data as any).entries
      : [];

  // Zaehle aktive/inaktive
  const activeCount = entries.filter((e) => e.enabled).length;
  const inactiveCount = entries.length - activeCount;

  return (
    <div className="p-4" data-testid="oberon-pii-tuning-page">
      <h2 className="mb-4 text-base font-semibold text-fg">PII-Tuning</h2>

      {isLoading && <LoadingSpinner label="Lade PII-Konfiguration..." />}
      {error && <ErrorBanner message={(error as Error).message} />}

      {!isLoading && !error && (
        <>
          {isStub ? (
            <EmptyState title="Kein Zugriff" description={(data as any).message} />
          ) : entries.length === 0 ? (
            // Fallback: Rohdaten anzeigen wenn kein strukturiertes Format
            <Panel title="PII-Konfiguration (Rohdaten)">
              <pre className="mt-1 overflow-auto rounded bg-bg-elevated p-3 text-xs text-fg max-h-96">
                {JSON.stringify(data, null, 2)}
              </pre>
            </Panel>
          ) : (
            <>
              {/* Zusammenfassung */}
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Panel title="Gesamt">
                  <div className="pt-1 text-2xl font-bold text-brand tabular-nums">{entries.length}</div>
                  <div className="text-xs text-fg-muted">PII-Typen konfiguriert</div>
                </Panel>
                <Panel title="Aktiv">
                  <Tooltip
                    title={`${activeCount} von ${entries.length} PII-Typen aktiv (Erkennung eingeschaltet)`}
                    source="GET /api/v1/oberon/pii-tuning"
                    updatedAt={`Zuletzt: ${updatedAt}`}
                  >
                    <div className="pt-1 text-2xl font-bold text-status-ok tabular-nums">{activeCount}</div>
                  </Tooltip>
                  <div className="text-xs text-fg-muted">aktiv</div>
                </Panel>
                <Panel title="Inaktiv">
                  <Tooltip
                    title={`${inactiveCount} PII-Typen deaktiviert`}
                    source="GET /api/v1/oberon/pii-tuning"
                    updatedAt={`Zuletzt: ${updatedAt}`}
                  >
                    <div className={`pt-1 text-2xl font-bold tabular-nums ${inactiveCount > 0 ? "text-fg-muted" : "text-fg-subtle"}`}>
                      {inactiveCount}
                    </div>
                  </Tooltip>
                  <div className="text-xs text-fg-muted">inaktiv</div>
                </Panel>
              </div>

              {/* PII-Typen — scrollbare Panel-Liste */}
              <Panel title={`PII-Typen (${entries.length})`}>
                <div className="max-h-96 overflow-y-auto pr-1 space-y-1.5">
                  {entries.map((entry: any, i: number) => (
                    <div
                      key={entry.entity_type ?? i}
                      className="rounded border border-white/5 bg-bg-elevated/30 px-3 py-2"
                    >
                      {/* Kopfzeile: entity_type + Aktiv-Badge */}
                      <div className="flex items-center justify-between gap-2">
                        <Tooltip
                          title={entry.description ?? `PII-Erkennungs-Typ: ${entry.entity_type}`}
                          source="GET /api/v1/oberon/pii-tuning"
                          updatedAt={`Zuletzt: ${updatedAt}`}
                        >
                          <span className="font-mono text-sm font-semibold text-brand">
                            {entry.entity_type}
                          </span>
                        </Tooltip>
                        <Chip tone={entry.enabled ? "ok" : "neutral"}>
                          {entry.enabled ? "aktiv" : "inaktiv"}
                        </Chip>
                      </div>

                      {/* Schwellwert-Bargraph */}
                      {entry.threshold != null && (
                        <div className="mt-1.5 flex items-center gap-2">
                          <Tooltip
                            title={`Erkennungs-Schwellwert: ${entry.threshold} (0 = sehr sensitiv, 1 = nur sichere Treffer)`}
                            source="GET /api/v1/oberon/pii-tuning"
                            updatedAt={`Zuletzt: ${updatedAt}`}
                            thresholds="0.0 = sehr sensitiv · 0.5 = ausgewogen · 1.0 = nur sichere Treffer"
                          >
                            <MiniBar value={Math.round(entry.threshold * 100)} segs={10} />
                          </Tooltip>
                          <span className="text-xxs text-fg-muted tabular-nums">
                            {entry.threshold}
                          </span>
                        </div>
                      )}

                      {/* Optionale Beschreibung */}
                      {entry.description && (
                        <p className="mt-1 text-xxs text-fg-subtle">{entry.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              </Panel>
            </>
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
