// CostTab — Oberon-Cockpit-Kostenauswertung.
// Zeigt aggregierte USD-Kosten aus /api/oberon/cockpit/cost
// mit Pie-Chart + sortierbare Tabelle + Date-Range + GroupBy-Switcher.

import { useState, useCallback, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { api } from "../../lib/api";
import { qk } from "../../lib/queryKeys";
import { Card } from "../../components/Card";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { EmptyState } from "../../components/EmptyState";
import type { CostGroupBy, CockpitCostBucket } from "../../lib/types";

// LocalStorage-Key fuer Range-Persistenz
const COST_RANGE_KEY = "moag.cost.range";
const COST_GROUPBY_KEY = "moag.cost.groupby";

// Farbpalette fuer Pie-Chart-Sektoren
const PIE_COLORS = [
  "#6366f1", // indigo
  "#22d3ee", // cyan
  "#f59e0b", // amber
  "#10b981", // emerald
  "#f43f5e", // rose
  "#a78bfa", // violet
  "#fb923c", // orange
];

/** Formatiert USD-Betrag: $1,234.56. Akzeptiert number ODER String
 *  (Pydantic-Decimal-Serialisierung). */
export function formatUsd(val: number | string | null | undefined): string {
  const n =
    typeof val === "number"
      ? val
      : typeof val === "string"
        ? parseFloat(val)
        : 0;
  const safe = Number.isFinite(n) ? n : 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safe);
}

type SortDir = "asc" | "desc";
type SortCol = "key" | "calls" | "total_cost_usd" | "total_tokens";

interface SortState {
  col: SortCol;
  dir: SortDir;
}

// --- GroupBy-Switcher ---

const GROUP_BY_OPTIONS: { id: CostGroupBy; label: string }[] = [
  { id: "client", label: "Client" },
  { id: "model", label: "Modell" },
  { id: "day", label: "Tag" },
  { id: "provider", label: "Provider" },
];

// --- DateRange-Hilfsfunktionen ---

function defaultFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

function defaultTo(): string {
  return new Date().toISOString().slice(0, 10);
}

function loadPersistedRange(): { from: string; to: string } {
  try {
    if (typeof window === "undefined") return { from: defaultFrom(), to: defaultTo() };
    const raw = window.localStorage?.getItem(COST_RANGE_KEY);
    if (!raw) return { from: defaultFrom(), to: defaultTo() };
    const parsed = JSON.parse(raw) as { from?: string; to?: string };
    if (
      typeof parsed.from === "string" &&
      typeof parsed.to === "string" &&
      parsed.from.length >= 10 &&
      parsed.to.length >= 10
    ) {
      return { from: parsed.from, to: parsed.to };
    }
  } catch {
    // ignore
  }
  return { from: defaultFrom(), to: defaultTo() };
}

function saveRange(from: string, to: string): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage?.setItem(COST_RANGE_KEY, JSON.stringify({ from, to }));
  } catch {
    // ignore
  }
}

function loadPersistedGroupBy(): CostGroupBy {
  try {
    if (typeof window === "undefined") return "client";
    const raw = window.localStorage?.getItem(COST_GROUPBY_KEY);
    const valid: CostGroupBy[] = ["client", "model", "day", "provider"];
    if (raw && valid.includes(raw as CostGroupBy)) return raw as CostGroupBy;
  } catch {
    // ignore
  }
  return "client";
}

function saveGroupBy(g: CostGroupBy): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage?.setItem(COST_GROUPBY_KEY, g);
  } catch {
    // ignore
  }
}

// --- Tabellen-Sort ---

/** total_cost_usd kommt von Oberon je nach Decimal-Serialisierung als number
 *  ODER als String. Wir parsen defensiv. */
function asNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function sortBuckets(
  buckets: CockpitCostBucket[],
  sort: SortState,
): CockpitCostBucket[] {
  const sorted = [...buckets].sort((a, b) => {
    const av = a[sort.col];
    const bv = b[sort.col];
    // Numerische Spalten (auch wenn als String serialisiert): parsen + vergleichen.
    if (sort.col === "total_cost_usd" || sort.col === "total_tokens" || sort.col === "calls") {
      const an = asNumber(av);
      const bn = asNumber(bv);
      return sort.dir === "asc" ? an - bn : bn - an;
    }
    if (typeof av === "number" && typeof bv === "number") {
      return sort.dir === "asc" ? av - bv : bv - av;
    }
    return sort.dir === "asc"
      ? String(av).localeCompare(String(bv), "de")
      : String(bv).localeCompare(String(av), "de");
  });
  return sorted;
}

// --- Haupt-Komponente ---

export function CostTab() {
  const initRange = loadPersistedRange();
  const [from, setFrom] = useState(initRange.from);
  const [to, setTo] = useState(initRange.to);
  const [groupBy, setGroupBy] = useState<CostGroupBy>(() => loadPersistedGroupBy());
  const [sort, setSort] = useState<SortState>({ col: "total_cost_usd", dir: "desc" });

  // Persistenz
  useEffect(() => saveRange(from, to), [from, to]);
  useEffect(() => saveGroupBy(groupBy), [groupBy]);

  const onGroupByChange = useCallback((g: CostGroupBy) => {
    setGroupBy(g);
  }, []);

  const onSortClick = (col: SortCol) => {
    setSort((prev) =>
      prev.col === col
        ? { col, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { col, dir: "desc" },
    );
  };

  const { data, isLoading, error } = useQuery({
    queryKey: qk.cockpit.cost(from, to, groupBy),
    queryFn: () => api.getCockpitCost({ from, to, groupBy }),
    staleTime: 60_000,
  });

  const sortedBuckets = useMemo(
    () => sortBuckets(data?.groups ?? [], sort),
    [data?.groups, sort],
  );

  // Pie-Daten: nur top-N (max 7) sichtbar, Rest als "Sonstige"
  const pieData = useMemo(() => {
    const buckets = [...(data?.groups ?? [])].sort(
      (a, b) => asNumber(b.total_cost_usd) - asNumber(a.total_cost_usd),
    );
    if (buckets.length <= 7) {
      return buckets.map((b) => ({ name: b.key, value: asNumber(b.total_cost_usd) }));
    }
    const top = buckets.slice(0, 6).map((b) => ({
      name: b.key,
      value: asNumber(b.total_cost_usd),
    }));
    const rest = buckets.slice(6).reduce((acc, b) => acc + asNumber(b.total_cost_usd), 0);
    return [...top, { name: "Sonstige", value: rest }];
  }, [data?.groups]);

  const arrowFor = (col: SortCol) => {
    if (sort.col !== col) return "";
    return sort.dir === "asc" ? " ^" : " v";
  };

  return (
    <div className="space-y-4 p-4" data-testid="cost-tab">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-fg">Kosten</h1>
          <p className="text-xs text-fg-muted">
            Oberon-LLM-Kosten — {from} bis {to}
          </p>
        </div>

        {/* Date-Range */}
        <div className="flex flex-wrap items-center gap-2" data-testid="cost-date-range">
          <input
            type="date"
            aria-label="Kosten von"
            data-testid="cost-date-from"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded border border-white/10 bg-bg-subtle px-2 py-1 text-sm text-fg"
          />
          <span className="text-fg-subtle">-</span>
          <input
            type="date"
            aria-label="Kosten bis"
            data-testid="cost-date-to"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded border border-white/10 bg-bg-subtle px-2 py-1 text-sm text-fg"
          />
        </div>
      </header>

      {/* GroupBy-Switcher */}
      <div
        role="group"
        aria-label="Gruppierung"
        className="flex flex-wrap items-center gap-1"
        data-testid="cost-groupby-switcher"
      >
        {GROUP_BY_OPTIONS.map((opt) => {
          const active = groupBy === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              data-testid={`cost-groupby-${opt.id}`}
              aria-pressed={active}
              onClick={() => onGroupByChange(opt.id)}
              className={`rounded px-3 py-1 text-xs transition-colors ${
                active
                  ? "bg-brand text-white"
                  : "bg-bg-subtle text-fg-muted hover:text-fg"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {isLoading && <LoadingSpinner label="Lade Kostendaten..." />}
      {error && (
        <div data-testid="cost-error" className="text-sm text-status-error">
          Fehler: {(error as Error).message}
        </div>
      )}

      {!isLoading && !error && (
        <>
          {/* Gesamt-Aggregat */}
          {data?.total && (
            <div
              className="grid grid-cols-2 gap-3 sm:grid-cols-4"
              data-testid="cost-totals"
            >
              <Card>
                <div className="p-3 text-center">
                  <div className="text-xs text-fg-muted">Gesamt-Kosten</div>
                  <div
                    className="mt-1 text-xl font-semibold text-fg"
                    data-testid="cost-total-usd"
                  >
                    {formatUsd(data.total.total_cost_usd)}
                  </div>
                </div>
              </Card>
              <Card>
                <div className="p-3 text-center">
                  <div className="text-xs text-fg-muted">Calls</div>
                  <div className="mt-1 text-xl font-semibold text-fg">
                    {data.total.calls.toLocaleString("de-DE")}
                  </div>
                </div>
              </Card>
              <Card>
                <div className="p-3 text-center">
                  <div className="text-xs text-fg-muted">Tokens gesamt</div>
                  <div className="mt-1 text-xl font-semibold text-fg">
                    {data.total.total_tokens.toLocaleString("de-DE")}
                  </div>
                </div>
              </Card>
              <Card>
                <div className="p-3 text-center">
                  <div className="text-xs text-fg-muted">Gruppen</div>
                  <div className="mt-1 text-xl font-semibold text-fg">
                    {data.groups.length}
                  </div>
                </div>
              </Card>
            </div>
          )}

          {data?.groups.length === 0 ? (
            <EmptyState
              title="Keine Kostendaten"
              description="Fuer den gewahlten Zeitraum liegen keine Daten vor."
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {/* Sektion 1: Pie-Chart */}
              <Card title="USD-Verteilung">
                <div
                  className="h-64"
                  data-testid="cost-pie-chart"
                  aria-label="Kostenverteilung als Kreisdiagramm"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label={({ name, percent }) =>
                          percent >= 0.05
                            ? `${name} ${(percent * 100).toFixed(0)}%`
                            : ""
                        }
                      >
                        {pieData.map((_, i) => (
                          <Cell
                            key={`cell-${i}`}
                            fill={PIE_COLORS[i % PIE_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(val: number) => [formatUsd(val), "USD"]}
                      />
                      <Legend
                        formatter={(val) => (
                          <span className="text-xs text-fg">{val}</span>
                        )}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              {/* Sektion 2: Tabelle */}
              <Card title="Detail-Auswertung">
                <div className="overflow-x-auto" data-testid="cost-table">
                  <table className="min-w-full text-sm">
                    <thead className="border-b border-white/10">
                      <tr>
                        <th
                          scope="col"
                          className="cursor-pointer select-none px-3 py-2 text-left text-xs font-semibold uppercase text-fg-muted"
                          onClick={() => onSortClick("key")}
                          data-testid="cost-sort-key"
                        >
                          {groupBy === "client"
                            ? "Client"
                            : groupBy === "model"
                            ? "Modell"
                            : groupBy === "day"
                            ? "Tag"
                            : "Provider"}
                          {arrowFor("key")}
                        </th>
                        <th
                          scope="col"
                          className="cursor-pointer select-none px-3 py-2 text-right text-xs font-semibold uppercase text-fg-muted"
                          onClick={() => onSortClick("total_cost_usd")}
                          data-testid="cost-sort-usd"
                        >
                          USD{arrowFor("total_cost_usd")}
                        </th>
                        <th
                          scope="col"
                          className="cursor-pointer select-none px-3 py-2 text-right text-xs font-semibold uppercase text-fg-muted"
                          onClick={() => onSortClick("calls")}
                          data-testid="cost-sort-calls"
                        >
                          Calls{arrowFor("calls")}
                        </th>
                        <th
                          scope="col"
                          className="cursor-pointer select-none px-3 py-2 text-right text-xs font-semibold uppercase text-fg-muted"
                          onClick={() => onSortClick("total_tokens")}
                          data-testid="cost-sort-tokens"
                        >
                          Tokens{arrowFor("total_tokens")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedBuckets.map((bucket) => (
                        <tr
                          key={bucket.key}
                          data-testid={`cost-row-${bucket.key}`}
                          className="border-b border-white/5 hover:bg-bg-elevated/40"
                        >
                          <td className="px-3 py-2 font-mono text-xs text-fg">
                            {bucket.key}
                          </td>
                          <td
                            className="px-3 py-2 text-right font-mono text-xs text-fg"
                            data-testid={`cost-usd-${bucket.key}`}
                          >
                            {formatUsd(bucket.total_cost_usd)}
                          </td>
                          <td className="px-3 py-2 text-right text-xs text-fg-muted">
                            {bucket.calls.toLocaleString("de-DE")}
                          </td>
                          <td className="px-3 py-2 text-right text-xs text-fg-muted">
                            {bucket.total_tokens.toLocaleString("de-DE")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default CostTab;
