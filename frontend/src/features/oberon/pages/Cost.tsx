// Cost — Kostenauswertung mit GroupBy-Selector.
// Datenquelle: GET /api/v1/oberon/cost

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import { qk } from "../../../lib/queryKeys";
import { PageBadge } from "../../../components/PageBadge";
import { LoadingSpinner } from "../../../components/LoadingSpinner";
import { EmptyState } from "../../../components/EmptyState";
import { Tooltip } from "../../../components/Tooltip";
import type { CostGroupBy } from "../../../lib/types";

const GROUP_BY_OPTIONS: { value: CostGroupBy; label: string }[] = [
  { value: "day",      label: "Pro Tag" },
  { value: "client",   label: "Pro Client" },
  { value: "model",    label: "Pro Modell" },
  { value: "provider", label: "Pro Provider" },
];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function sevenDaysAgo(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}

export function CostPage() {
  const [groupBy, setGroupBy] = useState<CostGroupBy>("day");
  const [from, setFrom] = useState(sevenDaysAgo());
  const [to, setTo] = useState(today());

  const { data, isLoading, error, dataUpdatedAt } = useQuery({
    queryKey: qk.oberon.cost(from, to, groupBy),
    queryFn: () => api.oberon.getCost({ from, to, groupBy }),
    refetchInterval: 60_000,
  });

  const updatedAt = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString("de-DE") : "–";

  const groups = (data as any)?.groups ?? [];
  const total = (data as any)?.total;

  return (
    <div className="p-4" data-testid="oberon-cost-page">
      <h2 className="mb-4 text-base font-semibold text-fg">Kostenauswertung</h2>

      {/* Filter-Zeile */}
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <Tooltip
          title="Zeitraum-Anfang"
          source="GET /api/v1/oberon/cost"
          updatedAt={`Zuletzt: ${updatedAt}`}
        >
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded border border-white/10 bg-bg-elevated px-2 py-1 text-fg"
            aria-label="Von"
          />
        </Tooltip>
        <span className="text-fg-muted">bis</span>
        <Tooltip
          title="Zeitraum-Ende"
          source="GET /api/v1/oberon/cost"
          updatedAt={`Zuletzt: ${updatedAt}`}
        >
          <input
            type="date"
            value={to}
            min={from}
            max={today()}
            onChange={(e) => setTo(e.target.value)}
            className="rounded border border-white/10 bg-bg-elevated px-2 py-1 text-fg"
            aria-label="Bis"
          />
        </Tooltip>
        <Tooltip
          title="Gruppierungs-Dimension"
          source="GET /api/v1/oberon/cost"
          updatedAt={`Zuletzt: ${updatedAt}`}
        >
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as CostGroupBy)}
            className="rounded border border-white/10 bg-bg-elevated px-2 py-1 text-fg"
            aria-label="Gruppierung"
          >
            {GROUP_BY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </Tooltip>
      </div>

      {isLoading && <LoadingSpinner label="Lade Kostendaten..." />}
      {error && (
        <div className="text-sm text-status-error">
          Fehler: {(error as Error).message}
        </div>
      )}

      {!isLoading && !error && (
        <>
          {/* Gesamt-Summe */}
          {total && (
            <div className="mb-4 rounded border border-white/10 bg-bg-panel p-3 text-sm">
              <span className="text-fg-muted">Gesamt: </span>
              <Tooltip
                title={`Gesamtkosten im Zeitraum: $${Number(total.total_cost_usd).toFixed(4)} USD`}
                source="GET /api/v1/oberon/cost"
                updatedAt={`Zuletzt: ${updatedAt}`}
                thresholds="0.00 = kostenlos/unbekannte Preise · > 0 = tatsaechliche Kosten"
              >
                <span className="font-medium text-fg tabular-nums">
                  ${Number(total.total_cost_usd).toFixed(4)}
                </span>
              </Tooltip>
              <span className="ml-3 text-fg-muted">
                {total.calls} Calls · {total.total_tokens.toLocaleString("de-DE")} Tokens
              </span>
            </div>
          )}

          {groups.length === 0 ? (
            <EmptyState title="Keine Daten" description="Keine Calls im gewaehlten Zeitraum oder kein Admin-Token." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/5 text-left text-fg-muted">
                    <th className="pb-2 pr-4">
                      {GROUP_BY_OPTIONS.find((o) => o.value === groupBy)?.label ?? groupBy}
                    </th>
                    <th className="pb-2 pr-4 text-right">Calls</th>
                    <th className="pb-2 pr-4 text-right">Tokens</th>
                    <th className="pb-2 text-right">Kosten (USD)</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g: any) => (
                    <tr key={g.key} className="border-b border-white/5 hover:bg-bg-elevated">
                      <td className="py-1.5 pr-4 font-mono text-fg">{g.key}</td>
                      <td className="py-1.5 pr-4 text-right tabular-nums text-fg-muted">{g.calls}</td>
                      <Tooltip
                        title={`Prompt: ${g.prompt_tokens} · Completion: ${g.completion_tokens}`}
                        source="GET /api/v1/oberon/cost"
                        updatedAt={`Zuletzt: ${updatedAt}`}
                      >
                        <td className="py-1.5 pr-4 text-right tabular-nums text-fg-muted">{g.total_tokens.toLocaleString("de-DE")}</td>
                      </Tooltip>
                      <td className="py-1.5 text-right tabular-nums text-fg">${Number(g.total_cost_usd).toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <PageBadge id="oberon.cost" />
    </div>
  );
}

export default CostPage;
