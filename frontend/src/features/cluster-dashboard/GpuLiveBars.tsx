// GpuLiveBars — pro Node ein kleines BarChart mit GPU-Load, CPU-Load, RAM-frei (in %).
// Daten: GET /api/cluster/nodes  -> Hardware-Felder
// Live-Update: WS-Event "node_health_changed" patcht die letzten Werte einzeln.
// Tolerante Anzeige: gpu_load_percent === null (CPU-Mode-Nodes wie WhiteStar) -> "CPU-only"
// statt 0%-Bar.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { StatusDot } from "../../components/StatusDot";
import { api } from "../../lib/api";
import { qk } from "../../lib/queryKeys";
import { useWebSocket } from "../../lib/ws";
import { formatRelative } from "../../lib/format";
import type { ClusterNode, WsEvent } from "../../lib/types";

export interface GpuLiveBarsProps {
  refetchIntervalMs?: number;
}

interface NodeMetrics {
  hostname: string;
  connected: boolean;
  last_heartbeat: string;
  gpu_load_percent: number | null;
  cpu_load_percent: number | null;
  ram_free_gb: number | null;
  gpu_name: string | null;
  isCpuOnly: boolean;
}

function nodeToMetrics(node: ClusterNode): NodeMetrics {
  const gpu =
    node.hardware?.gpu_load_percent ??
    (node as unknown as { gpu_load_percent?: number | null }).gpu_load_percent ??
    null;
  const cpu =
    node.hardware?.cpu_load_percent ??
    (node as unknown as { cpu_load_percent?: number | null }).cpu_load_percent ??
    null;
  const ramFree =
    node.hardware?.ram_free_gb ??
    (node as unknown as { ram_free_gb?: number | null }).ram_free_gb ??
    null;
  return {
    hostname: node.hostname,
    connected: node.connected,
    last_heartbeat: node.last_heartbeat,
    gpu_load_percent: gpu,
    cpu_load_percent: cpu,
    ram_free_gb: ramFree,
    gpu_name: node.hardware?.gpu_name ?? null,
    isCpuOnly:
      gpu === null &&
      (node.hardware?.gpu_name == null || /amd radeon/i.test(node.hardware.gpu_name ?? "")),
  };
}

export function GpuLiveBars({ refetchIntervalMs = 10_000 }: GpuLiveBarsProps) {
  const nodesQuery = useQuery({
    queryKey: qk.cluster.nodes,
    queryFn: () => api.getNodes(),
    refetchInterval: refetchIntervalMs,
    refetchIntervalInBackground: false,
    retry: 1,
  });

  // Live-Patches aus WS — keyed by hostname (uniform mit Backend-Eventschema).
  const [livePatches, setLivePatches] = useState<Record<string, Partial<NodeMetrics>>>({});

  useWebSocket({
    onEvent: (ev: WsEvent) => {
      if (ev.type !== "node_health_changed") return;
      const e = ev as Extract<WsEvent, { type: "node_health_changed" }>;
      if (!e.hostname) return;
      setLivePatches((prev) => ({
        ...prev,
        [e.hostname]: {
          gpu_load_percent: e.gpu_load_percent ?? null,
          cpu_load_percent: e.cpu_load_percent ?? null,
          ram_free_gb: e.ram_free_gb ?? null,
        },
      }));
    },
  });

  const merged = useMemo<NodeMetrics[]>(() => {
    const base = (nodesQuery.data?.nodes ?? []).map(nodeToMetrics);
    return base.map((m) => {
      const patch = livePatches[m.hostname];
      if (!patch) return m;
      return {
        ...m,
        gpu_load_percent:
          patch.gpu_load_percent !== undefined ? patch.gpu_load_percent : m.gpu_load_percent,
        cpu_load_percent:
          patch.cpu_load_percent !== undefined ? patch.cpu_load_percent : m.cpu_load_percent,
        ram_free_gb: patch.ram_free_gb !== undefined ? patch.ram_free_gb : m.ram_free_gb,
      };
    });
  }, [nodesQuery.data, livePatches]);

  if (nodesQuery.isLoading) {
    return (
      <Card title="GPU/CPU/RAM Live">
        <LoadingSpinner label="Node-Metriken werden geladen..." />
      </Card>
    );
  }
  if (nodesQuery.isError) {
    return (
      <Card title="GPU/CPU/RAM Live">
        <EmptyState
          title="Node-Metriken konnten nicht geladen werden"
          description={(nodesQuery.error as Error).message}
        />
      </Card>
    );
  }
  if (merged.length === 0) {
    return (
      <Card title="GPU/CPU/RAM Live">
        <EmptyState
          title="Keine Nodes gemeldet"
          description="Hub kennt keine Nodes. Pruefe Hub-Status oder Settings."
        />
      </Card>
    );
  }

  return (
    <Card
      title="GPU / CPU / RAM Live"
      description={`${merged.length} Nodes · WS-Update ueber node_health_changed`}
    >
      <div
        className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
        data-testid="gpu-live-bars"
      >
        {merged.map((m) => (
          <NodeBarCard key={m.hostname} metrics={m} />
        ))}
      </div>
    </Card>
  );
}

interface NodeBarCardProps {
  metrics: NodeMetrics;
}

function NodeBarCard({ metrics }: NodeBarCardProps) {
  // Skala fuer RAM: in unserem Mock max 32 GB -> auf 100% skalieren.
  // Wir zeigen RAM als "verfuegbar" (frei) — nicht als Auslastung.
  const ramAxisPct = metrics.ram_free_gb != null ? Math.min(100, (metrics.ram_free_gb / 32) * 100) : 0;
  const data = [
    {
      key: "GPU",
      label:
        metrics.gpu_load_percent == null
          ? "GPU"
          : `GPU ${Math.round(metrics.gpu_load_percent)}%`,
      value: metrics.gpu_load_percent ?? 0,
      isCpuOnly: metrics.isCpuOnly,
      color: "#22c55e",
    },
    {
      key: "CPU",
      label:
        metrics.cpu_load_percent == null
          ? "CPU"
          : `CPU ${Math.round(metrics.cpu_load_percent)}%`,
      value: metrics.cpu_load_percent ?? 0,
      isCpuOnly: false,
      color: "#3b82f6",
    },
    {
      key: "RAM",
      label:
        metrics.ram_free_gb == null
          ? "RAM"
          : `RAM ${metrics.ram_free_gb.toFixed(1)} GB frei`,
      value: ramAxisPct,
      isCpuOnly: false,
      color: "#eab308",
    },
  ];

  return (
    <div
      className="rounded border border-white/5 bg-bg-elevated/50 p-3"
      data-testid={`gpu-bar-card-${metrics.hostname}`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-fg">
            <StatusDot
              status={metrics.connected ? "ok" : "error"}
              size="sm"
              pulse={!metrics.connected}
            />
            {metrics.hostname}
          </div>
          <div className="text-xxs text-fg-muted">
            {metrics.gpu_name ?? "GPU unbekannt"} · {formatRelative(metrics.last_heartbeat)}
          </div>
        </div>
        {metrics.isCpuOnly && (
          <span
            className="rounded border border-status-info/40 bg-status-info/10 px-1.5
                       py-0.5 text-xxs font-mono uppercase text-status-info"
            data-testid={`cpu-only-badge-${metrics.hostname}`}
            title="Kein dedizierter GPU-Workload — CPU-only Node"
          >
            CPU-only
          </span>
        )}
      </div>

      <div className="h-32" data-testid={`gpu-bar-chart-${metrics.hostname}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
            <XAxis type="number" domain={[0, 100]} hide />
            <YAxis
              type="category"
              dataKey="label"
              width={120}
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: "rgba(148,163,184,0.08)" }}
              contentStyle={{
                background: "#0f172a",
                border: "1px solid rgba(148,163,184,0.2)",
                fontSize: 12,
              }}
              formatter={(_value, _name, payload) => {
                const p = payload as unknown as { payload: typeof data[number] };
                return [p.payload.label, p.payload.key];
              }}
            />
            <Bar dataKey="value" radius={[0, 3, 3, 0]} isAnimationActive={false}>
              {data.map((d) => (
                <Cell
                  key={d.key}
                  fill={d.isCpuOnly ? "#475569" : d.color}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default GpuLiveBars;
