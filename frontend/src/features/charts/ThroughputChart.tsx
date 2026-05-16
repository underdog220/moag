// Throughput-Chart: Docs/Stunde + Avg-Latenz ueber Zeit.
// Zwei Y-Achsen: links docs_per_hour, rechts avg_latency_ms.

import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid,
  Legend,
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
import { rangeToQuery, type TimeRange } from "./timeRange";

export interface ThroughputChartProps {
  range: TimeRange;
}

function formatHour(ts: string): string {
  try {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return ts;
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  } catch {
    return ts;
  }
}

export function ThroughputChart({ range }: ThroughputChartProps) {
  const q = rangeToQuery(range);
  const { data, isLoading, error } = useQuery({
    queryKey: qk.charts.throughput(q),
    queryFn: () => api.getThroughput(q),
  });

  return (
    <Card title="Durchsatz" description="Dokumente pro Stunde mit durchschnittlicher Latenz">
      {isLoading && <ChartSkeleton />}
      {error && (
        <div data-testid="throughput-error" className="text-sm text-status-error">
          Fehler beim Laden: {(error as Error).message}
        </div>
      )}
      {!isLoading && !error && data && (
        <>
          {shouldShowEmpty(data.datapoints.length) ? (
            <ChartEmptyState count={data.datapoints.length} />
          ) : (
            <ChartContainer>
              <LineChart
                data={data.datapoints}
                margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis
                  dataKey="ts"
                  tickFormatter={formatHour}
                  stroke="#64748b"
                  fontSize={11}
                />
                <YAxis
                  yAxisId="docs"
                  stroke="#3b82f6"
                  fontSize={11}
                  label={{ value: "Docs/h", angle: -90, position: "insideLeft", fill: "#94a3b8", fontSize: 11 }}
                />
                <YAxis
                  yAxisId="latency"
                  orientation="right"
                  stroke="#22c55e"
                  fontSize={11}
                  label={{ value: "Latenz (ms)", angle: 90, position: "insideRight", fill: "#94a3b8", fontSize: 11 }}
                />
                <Tooltip
                  contentStyle={{ background: "#1e293b", border: "1px solid #334155" }}
                  labelFormatter={(v: string) => new Date(v).toLocaleString("de-DE")}
                  formatter={(value: number, name: string) => {
                    if (name === "Latenz") return [`${value} ms`, name];
                    return [`${value}`, name];
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line
                  yAxisId="docs"
                  type="monotone"
                  dataKey="docs_per_hour"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  name="Docs/h"
                  dot={false}
                />
                <Line
                  yAxisId="latency"
                  type="monotone"
                  dataKey="avg_latency_ms"
                  stroke="#22c55e"
                  strokeWidth={2}
                  name="Latenz"
                  dot={false}
                />
              </LineChart>
            </ChartContainer>
          )}
        </>
      )}
    </Card>
  );
}

export default ThroughputChart;
