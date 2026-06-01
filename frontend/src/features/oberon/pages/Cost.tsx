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
import { Panel, KV, MiniBar, ErrorBanner } from "../_oberon_ui";
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

// Balkenbreite relativ zum Maximum (0..100)
function costPercent(cost: number, maxCost: number): number {
  if (maxCost === 0) return 0;
  return Math.round((cost / maxCost) * 100);
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

  const maxCost = groups.reduce(
    (m: number, g: any) => Math.max(m, Number(g.total_cost_usd ?? 0)),
    0,
  );

  return (
    <div className="p-4" data-testid="oberon-cost-page">
      <h2 className="mb-4 text-base font-semibold text-fg">Kostenauswertung</h2>

      {/* Filter-Panel */}
      <Panel title="Zeitraum & Gruppierung" className="mb-4">
        <div className="flex flex-wrap items-center gap-3 pt-1 text-sm">
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
      </Panel>

      {isLoading && <LoadingSpinner label="Lade Kostendaten..." />}
      {error && <ErrorBanner message={(error as Error).message} />}

      {!isLoading && !error && (
        <>
          {/* Gesamt-Zusammenfassung */}
          {total && (
            <Panel title="Gesamt" className="mb-4">
              <KV
                label="Kosten (USD)"
                value={
                  <Tooltip
                    title={`Gesamtkosten im Zeitraum: $${Number(total.total_cost_usd).toFixed(4)} USD`}
                    source="GET /api/v1/oberon/cost"
                    updatedAt={`Zuletzt: ${updatedAt}`}
                    thresholds="0.00 = kostenlos/unbekannte Preise · > 0 = tatsaechliche Kosten"
                  >
                    <span className="font-semibold tabular-nums text-brand">
                      ${Number(total.total_cost_usd).toFixed(4)}
                    </span>
                  </Tooltip>
                }
              />
              <KV
                label="API-Calls"
                value={
                  <Tooltip
                    title={`Anzahl LLM-Calls im Zeitraum`}
                    source="GET /api/v1/oberon/cost"
                    updatedAt={`Zuletzt: ${updatedAt}`}
                  >
                    <span className="tabular-nums">{total.calls}</span>
                  </Tooltip>
                }
              />
              <KV
                label="Tokens"
                value={
                  <Tooltip
                    title={`Gesamte Tokens (Prompt + Completion)`}
                    source="GET /api/v1/oberon/cost"
                    updatedAt={`Zuletzt: ${updatedAt}`}
                  >
                    <span className="tabular-nums">{total.total_tokens.toLocaleString("de-DE")}</span>
                  </Tooltip>
                }
              />
            </Panel>
          )}

          {groups.length === 0 ? (
            <EmptyState title="Keine Daten" description="Keine Calls im gewaehlten Zeitraum oder kein Admin-Token." />
          ) : (
            <Panel title={GROUP_BY_OPTIONS.find((o) => o.value === groupBy)?.label ?? groupBy}>
              {/* Scrollbare Liste statt Tabelle */}
              <div className="max-h-96 overflow-y-auto pr-1 space-y-1">
                {groups.map((g: any) => (
                  <div
                    key={g.key}
                    className="rounded border border-white/5 bg-bg-elevated/30 px-2 py-2"
                  >
                    {/* Schluessel + Kosten */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-sm text-fg truncate">{g.key}</span>
                      <Tooltip
                        title={`Kosten: $${Number(g.total_cost_usd).toFixed(4)} — Calls: ${g.calls} — Tokens: ${g.total_tokens.toLocaleString("de-DE")}`}
                        source="GET /api/v1/oberon/cost"
                        updatedAt={`Zuletzt: ${updatedAt}`}
                      >
                        <span className="tabular-nums text-xs text-brand font-semibold shrink-0">
                          ${Number(g.total_cost_usd).toFixed(4)}
                        </span>
                      </Tooltip>
                    </div>
                    {/* Kosten-Bargraph */}
                    <div className="mt-1 flex items-center gap-2 text-xxs text-fg-muted">
                      <MiniBar value={costPercent(Number(g.total_cost_usd), maxCost)} segs={12} />
                      <Tooltip
                        title={`Prompt: ${g.prompt_tokens} · Completion: ${g.completion_tokens}`}
                        source="GET /api/v1/oberon/cost"
                        updatedAt={`Zuletzt: ${updatedAt}`}
                      >
                        <span>{g.total_tokens.toLocaleString("de-DE")} Tokens · {g.calls} Calls</span>
                      </Tooltip>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </>
      )}

      <PageBadge id="oberon.cost" />
    </div>
  );
}

export default CostPage;
