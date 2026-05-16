// Failure-Rate: LineChart-Trend + Top-3-Fehler-Liste rechts.

import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../../lib/api";
import { qk } from "../../lib/queryKeys";
import { Card } from "../../components/Card";
import { ChartSkeleton } from "./ChartSkeleton";
import { ChartEmptyState, shouldShowEmpty } from "./ChartEmptyState";
import { ChartContainer } from "./ChartContainer";

function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(2)} %`;
}

export function FailureRateChart() {
  const { data, isLoading, error } = useQuery({
    queryKey: qk.charts.failures,
    queryFn: () => api.getFailureRate(),
  });

  const trend = data?.trend ?? [];
  const top = (data?.top_errors ?? []).slice(0, 3);

  return (
    <Card
      title="Failure-Rate"
      description="Fehler-Quote ueber Zeit + Top-3-Fehlertypen"
    >
      {isLoading && <ChartSkeleton />}
      {error && (
        <div data-testid="failure-rate-error" className="text-sm text-status-error">
          Fehler beim Laden: {(error as Error).message}
        </div>
      )}
      {!isLoading && !error && data && (
        <>
          {shouldShowEmpty(trend.length) && top.length === 0 ? (
            <ChartEmptyState count={trend.length} />
          ) : (
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2" data-testid="failure-trend-wrap">
                <ChartContainer>
                  <LineChart
                    data={trend}
                    margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="ts" stroke="#64748b" fontSize={11} />
                    <YAxis
                      stroke="#64748b"
                      fontSize={11}
                      tickFormatter={(v: number) => `${(v * 100).toFixed(1)}%`}
                    />
                    <Tooltip
                      contentStyle={{ background: "#1e293b", border: "1px solid #334155" }}
                      formatter={(value: number) => [formatRate(value), "Failure-Rate"]}
                    />
                    <Line
                      type="monotone"
                      dataKey="rate"
                      stroke="#ef4444"
                      strokeWidth={2}
                      dot
                      name="Failure-Rate"
                    />
                  </LineChart>
                </ChartContainer>
              </div>
              <div data-testid="failure-top-list">
                <h3 className="mb-2 text-xs font-semibold uppercase text-fg-muted">
                  Top-3-Fehler
                </h3>
                {top.length === 0 ? (
                  <p className="text-sm text-fg-subtle">Keine Fehler in diesem Zeitraum.</p>
                ) : (
                  <ul className="space-y-2">
                    {top.map((err, i) => (
                      <li
                        key={`${err.type}-${i}`}
                        data-testid={`failure-top-item-${i}`}
                        className="rounded border border-white/5 bg-bg-subtle/50 p-2 text-sm"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-fg">{err.type}</span>
                          <span className="rounded bg-status-error/20 px-2 py-0.5 text-xs text-status-error">
                            {err.count}
                          </span>
                        </div>
                        {err.example && (
                          <div className="mt-1 truncate font-mono text-xs text-fg-muted">
                            {err.example}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

export default FailureRateChart;
