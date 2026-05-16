// Engine-Performance: pro Engine 3 Bars (p50, p95, Konfidenz).
// Konfidenz-Werte sind 0..1 - wir skalieren zu p95-Range fuer die Visualisierung
// und zeigen zusaetzlich eine separate Y-Achse rechts fuer Konfidenz in %.

import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
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

export function EnginePerformanceChart() {
  const { data, isLoading, error } = useQuery({
    queryKey: qk.charts.engines,
    queryFn: () => api.getEnginePerformance(),
  });

  // Daten fuer recharts vorbereiten: konfidenz_pct als 0..100
  const rows =
    data?.engines?.map((e) => ({
      name: e.name,
      p50_ms: e.p50_ms,
      p95_ms: e.p95_ms,
      confidence_pct: Math.round(e.avg_confidence * 1000) / 10,
    })) ?? [];

  return (
    <Card
      title="Engine-Performance"
      description="p50, p95 (ms) und durchschnittliche Konfidenz pro Engine"
    >
      {isLoading && <ChartSkeleton />}
      {error && (
        <div data-testid="engine-performance-error" className="text-sm text-status-error">
          Fehler beim Laden: {(error as Error).message}
        </div>
      )}
      {!isLoading && !error && data && (
        <>
          {shouldShowEmpty(rows.length) ? (
            <ChartEmptyState count={rows.length} />
          ) : (
            <ChartContainer>
              <BarChart data={rows} margin={{ top: 8, right: 24, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                <YAxis
                  yAxisId="ms"
                  stroke="#3b82f6"
                  fontSize={11}
                  label={{ value: "ms", angle: -90, position: "insideLeft", fill: "#94a3b8", fontSize: 11 }}
                />
                <YAxis
                  yAxisId="pct"
                  orientation="right"
                  stroke="#22c55e"
                  fontSize={11}
                  domain={[0, 100]}
                  label={{ value: "Konfidenz %", angle: 90, position: "insideRight", fill: "#94a3b8", fontSize: 11 }}
                />
                <Tooltip
                  contentStyle={{ background: "#1e293b", border: "1px solid #334155" }}
                  formatter={(value: number, name: string) => {
                    if (name === "Konfidenz") return [`${value} %`, name];
                    return [`${value} ms`, name];
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar yAxisId="ms" dataKey="p50_ms" fill="#3b82f6" name="p50" />
                <Bar yAxisId="ms" dataKey="p95_ms" fill="#eab308" name="p95" />
                <Bar yAxisId="pct" dataKey="confidence_pct" fill="#22c55e" name="Konfidenz" />
              </BarChart>
            </ChartContainer>
          )}
        </>
      )}
    </Card>
  );
}

export default EnginePerformanceChart;
