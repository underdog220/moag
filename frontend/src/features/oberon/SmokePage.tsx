// SmokePage — Oberon Smoke-Test-Ergebnisse (delegiert an SmokeIndicator-Daten).
// Zeigt alle Sub-Checks mit Status, Latenz und Fehler.

import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { qk } from "../../lib/queryKeys";
import { PageBadge } from "../../components/PageBadge";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { EmptyState } from "../../components/EmptyState";

export function SmokePage() {
  const { data, isLoading, error } = useQuery({
    queryKey: qk.cockpit.smoke,
    queryFn: () => api.getCockpitSmoke(),
    refetchInterval: 30_000,
  });

  if (isLoading) return <LoadingSpinner label="Lade Smoke-Ergebnisse..." />;
  if (error)
    return (
      <div className="p-4 text-sm text-status-error">
        Fehler: {(error as Error).message}
      </div>
    );

  const suites = data?.suites ?? [];
  const summary = data?.summary;

  return (
    <div className="p-4" data-testid="smoke-page">
      <h1 className="mb-4 text-lg font-semibold text-fg">Oberon Smoke-Tests</h1>

      {summary && (
        <div className="mb-4 flex items-center gap-4 text-sm">
          <span className="text-status-ok">✓ {summary.pass} OK</span>
          <span className="text-status-warn">⚠ {summary.warn} Warn</span>
          <span className="text-status-error">✗ {summary.fail} Fehler</span>
          <span className="text-fg-muted">Gesamt: {summary.total}</span>
        </div>
      )}

      {suites.length === 0 ? (
        <EmptyState title="Keine Smoke-Daten" description="Backend noch nicht verfügbar." />
      ) : (
        <div className="space-y-2">
          {suites.map((check) => (
            <div
              key={check.name}
              className="flex items-center gap-3 rounded border border-white/5 bg-bg-panel px-3 py-2"
            >
              <span
                className={
                  check.status === "PASS"
                    ? "text-status-ok"
                    : check.status === "WARN"
                      ? "text-status-warn"
                      : "text-status-error"
                }
              >
                {check.status === "PASS" ? "✓" : check.status === "WARN" ? "⚠" : "✗"}
              </span>
              <span className="flex-1 text-sm text-fg">{check.name}</span>
              <span className="tabular-nums text-xs text-fg-muted">{check.latency_ms}ms</span>
              {check.error && (
                <span className="text-xs text-status-error" title={check.error}>
                  Fehler
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      <PageBadge id="oberon.smoke" />
    </div>
  );
}

export default SmokePage;
