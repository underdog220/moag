// RoundRobinBar — gestapelter horizontaler Bar der letzten Job-Verteilung pro Node.
// Daten: GET /api/charts/round-robin -> { datapoints: [{ts, host1, host2, ...}, ...] }
// Wir summieren ueber alle datapoints pro Host und zeigen einen einzeilen Stack-Bar.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { api } from "../../lib/api";
import { qk } from "../../lib/queryKeys";
import type { RoundRobinPoint } from "../../lib/types";

const HOST_COLORS = [
  "#3b82f6",
  "#22c55e",
  "#eab308",
  "#a855f7",
  "#ef4444",
  "#06b6d4",
  "#f97316",
];

export interface RoundRobinBarProps {
  refetchIntervalMs?: number;
}

interface AggregatedHost {
  host: string;
  jobs: number;
  pct: number;
  color: string;
}

function aggregate(points: RoundRobinPoint[]): {
  total: number;
  rows: AggregatedHost[];
} {
  const totals: Record<string, number> = {};
  for (const p of points) {
    for (const [k, v] of Object.entries(p)) {
      if (k === "ts") continue;
      const num = typeof v === "number" ? v : Number(v);
      if (Number.isNaN(num)) continue;
      totals[k] = (totals[k] ?? 0) + num;
    }
  }
  const total = Object.values(totals).reduce((a, b) => a + b, 0);
  const rows: AggregatedHost[] = Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .map(([host, jobs], i) => ({
      host,
      jobs,
      pct: total > 0 ? jobs / total : 0,
      color: HOST_COLORS[i % HOST_COLORS.length],
    }));
  return { total, rows };
}

export function RoundRobinBar({ refetchIntervalMs = 30_000 }: RoundRobinBarProps) {
  const rrQuery = useQuery({
    queryKey: qk.charts.roundRobin,
    queryFn: () => api.getRoundRobin(),
    refetchInterval: refetchIntervalMs,
    refetchIntervalInBackground: false,
    retry: 1,
  });

  const { total, rows } = useMemo(
    () => aggregate(rrQuery.data?.datapoints ?? []),
    [rrQuery.data]
  );

  if (rrQuery.isLoading) {
    return (
      <Card title="Round-Robin Job-Verteilung">
        <LoadingSpinner label="Verteilung wird geladen..." />
      </Card>
    );
  }
  if (rrQuery.isError) {
    return (
      <Card title="Round-Robin Job-Verteilung">
        <EmptyState
          title="Verteilungsdaten konnten nicht geladen werden"
          description={(rrQuery.error as Error).message}
        />
      </Card>
    );
  }
  if (rows.length === 0 || total === 0) {
    return (
      <Card title="Round-Robin Job-Verteilung">
        <EmptyState
          title="Noch keine Jobs ausgeliefert"
          description="Sobald der Hub Jobs verteilt, erscheint hier die Round-Robin-Statistik."
        />
      </Card>
    );
  }

  return (
    <Card
      title="Round-Robin Job-Verteilung"
      description={`${total} Jobs auf ${rows.length} Nodes`}
    >
      <div className="space-y-3" data-testid="round-robin-bar">
        {/* Gestapelter Bar */}
        <div
          className="flex h-8 w-full overflow-hidden rounded border border-white/5"
          role="img"
          aria-label="Job-Verteilung als gestapelter Balken"
        >
          {rows.map((r) => (
            <div
              key={r.host}
              className="flex items-center justify-center text-xxs font-mono
                         text-bg-panel"
              style={{
                width: `${r.pct * 100}%`,
                backgroundColor: r.color,
                minWidth: r.pct > 0 ? 4 : 0,
              }}
              data-testid={`rr-segment-${r.host}`}
              title={`${r.host}: ${r.jobs} Jobs (${(r.pct * 100).toFixed(1)}%)`}
            >
              {r.pct > 0.08 ? r.host : ""}
            </div>
          ))}
        </div>

        {/* Legende */}
        <ul className="flex flex-wrap gap-3 text-xs">
          {rows.map((r) => (
            <li
              key={r.host}
              className="flex items-center gap-2"
              data-testid={`rr-legend-${r.host}`}
            >
              <span
                className="inline-block h-2 w-2 rounded-sm"
                style={{ backgroundColor: r.color }}
                aria-hidden="true"
              />
              <span className="font-mono text-fg">{r.host}</span>
              <span className="tabular-nums text-fg-muted">
                {r.jobs} ({(r.pct * 100).toFixed(1)}%)
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

export default RoundRobinBar;
