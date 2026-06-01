// Overview — Cockpit-Startseite mit Sub-System-Karten in 3 Gruppen.
// Datenquelle: /api/v1/overview (Polling 30s).
// Stil: "For All Mankind" Mission-Control — wie Nodes.tsx.

import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { qk } from "../../lib/queryKeys";
import { PageBadge } from "../../components/PageBadge";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Tooltip } from "../../components/Tooltip";
import { SystemCard } from "./SystemCard";
import type { SystemStatus } from "../../lib/types";

const GROUPS: { label: string; key: string }[] = [
  { label: "KI-Backbone",       key: "KI-Backbone" },
  { label: "Infrastruktur",     key: "Infrastruktur" },
  { label: "Compliance & Test", key: "Compliance & Test" },
];

// Gruppen-Score-Farbe (identisch zur SegBar-Logik in SystemCard)
function groupScoreClass(score: number): string {
  return score >= 70 ? "text-status-ok" : score >= 40 ? "text-status-warn" : "text-status-error";
}

// Gruppe: wie viele Systeme ok vs. down?
function groupSummary(systems: SystemStatus[]): { ok: number; total: number } {
  return { ok: systems.filter((s) => s.ok).length, total: systems.length };
}

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
    <div className="min-h-full p-4 pb-12 font-mono" data-testid="overview">
      {/* Seitenheader */}
      <header className="mb-6 border-b border-brand/20 pb-4">
        <h1 className="text-base font-bold uppercase tracking-widest text-brand">
          MOAG — Systemübersicht
        </h1>
        <p className="mt-1 text-xs text-fg-subtle font-sans">
          Alle Sub-Systeme auf einen Blick · Klick auf eine Karte für Drilldown
        </p>
      </header>

      {isLoading && systems.length === 0 && (
        <LoadingSpinner label="Lade Systemstatus..." />
      )}

      {error && systems.length === 0 && (
        <div className="rounded border border-status-error/30 bg-status-error/10 p-4 text-sm text-status-error font-sans">
          Fehler beim Laden: {(error as Error).message}
        </div>
      )}

      {GROUPS.map(({ label, key }) => {
        const groupSystems = systems.filter((s) => s.group === key);
        if (groupSystems.length === 0) return null;

        const groupScore = Math.round(
          groupSystems.reduce((sum, s) => sum + s.score, 0) / groupSystems.length
        );
        const { ok, total } = groupSummary(groupSystems);

        return (
          <section key={key} className="mb-8" data-testid={`group-${key}`}>
            {/* Gruppen-Header */}
            <div className="mb-3 flex items-center gap-3 border-b border-white/8 pb-2">
              <h2 className="text-xs font-bold uppercase tracking-widest text-fg-subtle">
                {label}
              </h2>

              {/* Gruppen-Score */}
              <Tooltip
                title={`Gruppen-Durchschnitt: ${groupScore} / 100`}
                source="/api/v1/overview"
                thresholds="≥70 OK · 40–69 Beeinträchtigt · <40 Kritisch"
              >
                <span
                  className={`tabular-nums text-xs font-semibold ${groupScoreClass(groupScore)}`}
                >
                  ⌀ {groupScore}
                </span>
              </Tooltip>

              {/* ok/total-Pill */}
              <Tooltip
                title={`${ok} von ${total} Systemen in Ordnung`}
                source="/api/v1/overview"
              >
                <span
                  className={`rounded border px-1.5 py-0.5 text-xxs font-semibold ${
                    ok === total
                      ? "border-status-ok/40 text-status-ok"
                      : ok === 0
                        ? "border-status-error/40 text-status-error"
                        : "border-status-warn/40 text-status-warn"
                  }`}
                >
                  {ok}/{total}
                </span>
              </Tooltip>
            </div>

            {/* Karten-Grid: 1 → 2 → 3 → 4 Spalten je Viewport */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 3xl:grid-cols-4">
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
