// Smoke — Live-Smoke-Test-Ergebnisse + ActionCard fuer oberon.smoke.
// Datenquelle: GET /api/v1/oberon/smoke

import { useQuery } from "@tanstack/react-query";
import { useQuery as useActionsQuery } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import { qk } from "../../../lib/queryKeys";
import { PageBadge } from "../../../components/PageBadge";
import { LoadingSpinner } from "../../../components/LoadingSpinner";
import { EmptyState } from "../../../components/EmptyState";
import { Tooltip } from "../../../components/Tooltip";
import { ActionCard } from "../../aktionen/ActionCard";
import { Panel, ErrorBanner } from "../_oberon_ui";
import type { Action } from "../../../lib/types";

function SmokeStatusIcon({ status }: { status: string }) {
  if (status === "PASS") return <span className="text-status-ok">✓</span>;
  if (status === "WARN") return <span className="text-status-warn">⚠</span>;
  return <span className="text-status-error">✗</span>;
}

function VerdictBadge({ verdict }: { verdict: string }) {
  const color =
    verdict === "PASS"
      ? "bg-status-ok/10 text-status-ok border-status-ok/30"
      : verdict === "WARN"
        ? "bg-status-warn/10 text-status-warn border-status-warn/30"
        : "bg-status-error/10 text-status-error border-status-error/30";
  return (
    <span className={`rounded border px-2 py-1 text-sm font-bold ${color}`}>
      {verdict}
    </span>
  );
}

export function SmokePage() {
  const { data, isLoading, error, dataUpdatedAt, refetch } = useQuery({
    queryKey: qk.oberon.smoke,
    queryFn: () => api.oberon.getSmoke(),
    refetchInterval: 30_000,
  });

  const { data: actionsData } = useActionsQuery({
    queryKey: qk.actions,
    queryFn: () => api.getActions(),
  });
  const smokeAction = actionsData?.actions.find((a: Action) => a.action_id === "oberon.smoke");

  const updatedAt = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString("de-DE") : "–";
  const suites = (data as any)?.suites ?? [];
  const summary = (data as any)?.summary;

  return (
    <div className="p-4" data-testid="oberon-smoke-page">
      {/* Header mit Verdict */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-fg">Smoke-Tests</h2>
        {summary && (
          <Tooltip
            title={`Gesamt-Verdict: ${summary.verdict} (${summary.pass} PASS, ${summary.warn} WARN, ${summary.fail} FAIL von ${summary.total})`}
            source="GET /api/v1/oberon/smoke"
            updatedAt={`Zuletzt: ${updatedAt}`}
            thresholds="PASS = alle OK · WARN = mindestens 1 Warnung · FAIL = mindestens 1 Fehler"
          >
            <VerdictBadge verdict={summary.verdict} />
          </Tooltip>
        )}
      </div>

      {/* Zusammenfassung-Panel */}
      {summary && (
        <Panel title="Zusammenfassung" className="mb-4">
          <div className="grid grid-cols-3 gap-3 pt-1 text-center">
            <Tooltip
              title={`${summary.pass} Sub-Checks mit Status PASS`}
              source="GET /api/v1/oberon/smoke"
              updatedAt={`Zuletzt: ${updatedAt}`}
            >
              <div>
                <div className="text-2xl font-bold tabular-nums text-status-ok">{summary.pass}</div>
                <div className="text-xxs text-fg-muted uppercase tracking-wide">OK</div>
              </div>
            </Tooltip>
            <Tooltip
              title={`${summary.warn} Sub-Checks mit Status WARN`}
              source="GET /api/v1/oberon/smoke"
              updatedAt={`Zuletzt: ${updatedAt}`}
            >
              <div>
                <div className="text-2xl font-bold tabular-nums text-status-warn">{summary.warn}</div>
                <div className="text-xxs text-fg-muted uppercase tracking-wide">Warn</div>
              </div>
            </Tooltip>
            <Tooltip
              title={`${summary.fail} Sub-Checks mit Status FAIL`}
              source="GET /api/v1/oberon/smoke"
              updatedAt={`Zuletzt: ${updatedAt}`}
            >
              <div>
                <div className="text-2xl font-bold tabular-nums text-status-error">{summary.fail}</div>
                <div className="text-xxs text-fg-muted uppercase tracking-wide">Fehler</div>
              </div>
            </Tooltip>
          </div>
          <div className="mt-2 border-t border-white/10 pt-1 text-right text-xxs text-fg-muted">
            Zuletzt: {updatedAt}
          </div>
        </Panel>
      )}

      {isLoading && <LoadingSpinner label="Lade Smoke-Ergebnisse..." />}
      {error && <ErrorBanner message={(error as Error).message} />}

      {!isLoading && !error && (
        <>
          {suites.length === 0 ? (
            <EmptyState title="Keine Smoke-Daten" description="Kein Admin-Token konfiguriert oder Oberon nicht erreichbar." />
          ) : (
            <Panel title={`Sub-Checks (${suites.length})`}>
              <div className="space-y-1">
                {suites.map((check: any) => (
                  <div
                    key={check.name}
                    className={`flex items-center gap-3 rounded border px-3 py-2 ${
                      check.status === "FAIL"
                        ? "border-status-error/20 bg-status-error/5"
                        : check.status === "WARN"
                          ? "border-status-warn/20 bg-status-warn/5"
                          : "border-white/5 bg-bg-elevated/20"
                    }`}
                  >
                    <Tooltip
                      title={`Status: ${check.status}${check.error ? ` — ${check.error}` : ""}`}
                      source="GET /api/v1/oberon/smoke"
                      updatedAt={`Zuletzt: ${updatedAt}`}
                      thresholds="PASS = alles OK · WARN = Einschraenkung · FAIL = kritischer Fehler"
                    >
                      <SmokeStatusIcon status={check.status} />
                    </Tooltip>
                    <span className="flex-1 text-sm text-fg">{check.name}</span>
                    <Tooltip
                      title={`Messdauer dieses Sub-Checks: ${check.latency_ms}ms`}
                      source="GET /api/v1/oberon/smoke"
                      updatedAt={`Zuletzt: ${updatedAt}`}
                    >
                      <span className="tabular-nums text-xs text-fg-muted">{check.latency_ms}ms</span>
                    </Tooltip>
                    {check.error && (
                      <Tooltip
                        title={check.error}
                        source="GET /api/v1/oberon/smoke"
                        updatedAt={`Zuletzt: ${updatedAt}`}
                      >
                        <span className="rounded border border-status-error/30 bg-status-error/10 px-1.5 py-0.5 text-xxs text-status-error">
                          Fehler
                        </span>
                      </Tooltip>
                    )}
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </>
      )}

      {/* ActionCard fuer oberon.smoke — falls in Registry vorhanden */}
      {smokeAction && (
        <div className="mt-6">
          <h3 className="mb-2 text-sm font-semibold text-fg-muted">Smoke-Test manuell ausfuehren</h3>
          <ActionCard
            action={smokeAction}
            onResult={() => { void refetch(); }}
          />
        </div>
      )}

      <PageBadge id="oberon.smoke" />
    </div>
  );
}

export default SmokePage;
