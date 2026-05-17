// Overview — Cockpit-Startseite mit 8 Karten in 3 Gruppen.
// Datenquelle: /api/v1/overview (Polling 30s).
// Mock-Daten aktiv wenn Backend nicht antwortet.

import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { qk } from "../../lib/queryKeys";
import { PageBadge } from "../../components/PageBadge";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { SystemCard } from "./SystemCard";
import type { SystemStatus } from "../../lib/types";

const GROUPS: { label: string; key: string }[] = [
  { label: "KI-Backbone",      key: "KI-Backbone" },
  { label: "Infrastruktur",    key: "Infrastruktur" },
  { label: "Compliance & Test",key: "Compliance & Test" },
];

export function Overview() {
  const { data, isLoading, error } = useQuery({
    queryKey: qk.overview,
    queryFn: () => api.getOverview(),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    retry: 1,
  });

  const systems: SystemStatus[] = data?.systems ?? [];

  return (
    <div className="min-h-full p-4 pb-12" data-testid="overview">
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-fg">MOAG — Systemübersicht</h1>
        <p className="mt-1 text-base text-fg-muted">
          Alle 8 Sub-Systeme auf einen Blick. Klick auf eine Karte für Drilldown.
        </p>
      </header>

      {isLoading && systems.length === 0 && (
        <LoadingSpinner label="Lade Systemstatus..." />
      )}

      {error && systems.length === 0 && (
        <div className="rounded border border-status-error/30 bg-status-error/10 p-4 text-sm text-status-error">
          Fehler beim Laden: {(error as Error).message}
        </div>
      )}

      {GROUPS.map(({ label, key }) => {
        const groupSystems = systems.filter((s) => s.group === key);
        if (groupSystems.length === 0) return null;

        const groupScore = Math.round(
          groupSystems.reduce((sum, s) => sum + s.score, 0) / groupSystems.length
        );

        return (
          <section key={key} className="mb-8" data-testid={`group-${key}`}>
            <div className="mb-3 flex items-center gap-3">
              <h2 className="text-base font-semibold uppercase tracking-wide text-fg-subtle">
                {label}
              </h2>
              <span
                className={`text-sm font-semibold tabular-nums ${
                  groupScore >= 70
                    ? "text-status-ok"
                    : groupScore >= 40
                      ? "text-status-warn"
                      : "text-status-error"
                }`}
              >
                ⌀ {groupScore}%
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {groupSystems.map((system) => (
                <SystemCard key={system.id} system={system} />
              ))}
            </div>
          </section>
        );
      })}

      <PageBadge id="overview" />
    </div>
  );
}

export default Overview;
