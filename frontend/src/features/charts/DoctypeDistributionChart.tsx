// Doctype-Distribution: Pie (aktuelle Verteilung) + LineChart-Trend pro Doctype.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
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

export function DoctypeDistributionChart() {
  const { data, isLoading, error } = useQuery({
    queryKey: qk.charts.doctypes,
    queryFn: () => api.getDoctypeDistribution(),
  });

  const trendKeys = useMemo(() => {
    if (!data?.trend?.length) return [] as string[];
    return Object.keys(data.trend[0]).filter((k) => k !== "ts");
  }, [data]);

  const pieData = data?.current ?? [];

  return (
    <Card
      title="Dokumenttypen"
      description="Aktuelle Verteilung + Trend ueber Zeit"
    >
      {isLoading && <ChartSkeleton height={320} />}
      {error && (
        <div data-testid="doctype-error" className="text-sm text-status-error">
          Fehler beim Laden: {(error as Error).message}
        </div>
      )}
      {!isLoading && !error && data && (
        <>
          {shouldShowEmpty(pieData.length) && shouldShowEmpty(data.trend?.length ?? 0) ? (
            <ChartEmptyState count={pieData.length + (data.trend?.length ?? 0)} />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <div data-testid="doctype-pie-wrap">
                <ChartContainer height={240}>
                  <PieChart>
                    <Tooltip
                      contentStyle={{ background: "#1e293b", border: "1px solid #334155" }}
                      formatter={(value: number, name: string) => [`${value}`, name]}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Pie
                      data={pieData}
                      dataKey="count"
                      nameKey="doctype"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label
                    >
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
              </div>
              <div data-testid="doctype-trend-wrap">
                <ChartContainer height={240}>
                  <LineChart
                    data={data.trend}
                    margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="ts" stroke="#64748b" fontSize={11} />
                    <YAxis stroke="#64748b" fontSize={11} />
                    <Tooltip
                      contentStyle={{ background: "#1e293b", border: "1px solid #334155" }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {trendKeys.map((key, i) => (
                      <Line
                        key={key}
                        type="monotone"
                        dataKey={key}
                        stroke={COLORS[i % COLORS.length]}
                        strokeWidth={2}
                        dot={false}
                      />
                    ))}
                  </LineChart>
                </ChartContainer>
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

export default DoctypeDistributionChart;
