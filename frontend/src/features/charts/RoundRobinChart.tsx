// Round-Robin-Verteilung: stacked AreaChart, Layer pro Node.
// Bei perfektem RR sollten die Layer gleich-hoch sein.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
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

const COLORS = ["#3b82f6", "#22c55e", "#eab308", "#ef4444", "#a855f7", "#06b6d4"];

export function RoundRobinChart() {
  const { data, isLoading, error } = useQuery({
    queryKey: qk.charts.roundRobin,
    queryFn: () => api.getRoundRobin(),
  });

  const points = data?.datapoints ?? [];

  // Layer-Keys aus dem ersten Datapoint extrahieren (alles ausser ts)
  const nodeKeys = useMemo(() => {
    if (!points.length) return [] as string[];
    return Object.keys(points[0]).filter((k) => k !== "ts");
  }, [points]);

  return (
    <Card
      title="Round-Robin-Verteilung"
      description="Job-Counts pro Node (gestapelt)"
    >
      {isLoading && <ChartSkeleton />}
      {error && (
        <div data-testid="round-robin-error" className="text-sm text-status-error">
          Fehler beim Laden: {(error as Error).message}
        </div>
      )}
      {!isLoading && !error && data && (
        <>
          {shouldShowEmpty(points.length) ? (
            <ChartEmptyState count={points.length} />
          ) : (
            <ChartContainer>
              <AreaChart
                data={points}
                margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="ts" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} />
                <Tooltip
                  contentStyle={{ background: "#1e293b", border: "1px solid #334155" }}
                  labelFormatter={(v: string) => new Date(v).toLocaleString("de-DE")}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {nodeKeys.map((key, i) => (
                  <Area
                    key={key}
                    type="monotone"
                    dataKey={key}
                    stackId="1"
                    stroke={COLORS[i % COLORS.length]}
                    fill={COLORS[i % COLORS.length]}
                    fillOpacity={0.5}
                  />
                ))}
              </AreaChart>
            </ChartContainer>
          )}
        </>
      )}
    </Card>
  );
}

export default RoundRobinChart;
