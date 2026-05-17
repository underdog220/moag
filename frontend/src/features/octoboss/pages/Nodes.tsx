// OctoBoss Nodes — Node-Liste mit Hardware-Telemetrie.
// Sub-Route: /octoboss/nodes
// Datenquelle: GET /api/v1/octoboss/nodes

import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../../../lib/api";
import { Tooltip } from "../../../components/Tooltip";
import { PageBadge } from "../../../components/PageBadge";
import { LoadingSpinner } from "../../../components/LoadingSpinner";
import type { OctoBossNodeDetail } from "../../../lib/types";

function pct(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v.toFixed(1)} %`;
}

function gb(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v.toFixed(1)} GB`;
}

function relTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const s = Math.floor(diff / 1000);
    if (s < 60) return `vor ${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `vor ${m}min`;
    return `vor ${Math.floor(m / 60)}h`;
  } catch {
    return iso;
  }
}

export function NodesPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["octoboss", "nodes"],
    queryFn: () => api.octoboss.getNodes(),
    refetchInterval: 10_000,
  });

  const nodes: OctoBossNodeDetail[] = (() => {
    if (!data) return [];
    if (Array.isArray(data)) return data as OctoBossNodeDetail[];
    const d = data as Record<string, unknown>;
    if (Array.isArray(d.nodes)) return d.nodes as OctoBossNodeDetail[];
    return [];
  })();

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-fg">Nodes</h2>

      {isLoading && <LoadingSpinner />}
      {error && (
        <div className="rounded border border-status-error/30 bg-status-error/10 px-3 py-2 text-sm text-status-error">
          Fehler: {(error as Error).message}
        </div>
      )}

      {!isLoading && !error && nodes.length === 0 && (
        <p className="text-sm text-fg-muted">Keine Nodes registriert.</p>
      )}

      {nodes.length > 0 && (
        <div className="overflow-x-auto rounded border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-bg-panel text-left text-xs text-fg-muted">
                <th className="px-3 py-2">
                  <Tooltip title="Hostname der Node" source="/api/v1/octoboss/nodes">Hostname</Tooltip>
                </th>
                <th className="px-3 py-2">
                  <Tooltip title="Verbindungsstatus zum Hub" source="/api/v1/octoboss/nodes">Connected</Tooltip>
                </th>
                <th className="px-3 py-2">
                  <Tooltip title="Betriebsmodus (IDLE/ACTIVE/OFFLINE)" source="/api/v1/octoboss/nodes">Mode</Tooltip>
                </th>
                <th className="px-3 py-2">
                  <Tooltip title="GPU-Modellname" source="/api/v1/octoboss/nodes">GPU</Tooltip>
                </th>
                <th className="px-3 py-2">
                  <Tooltip title="GPU-Auslastung in %" source="/api/v1/octoboss/nodes" thresholds="<70% ok · 70-90% warn · >90% krit">GPU-Load</Tooltip>
                </th>
                <th className="px-3 py-2">
                  <Tooltip title="CPU-Auslastung in %" source="/api/v1/octoboss/nodes" thresholds="<70% ok · 70-90% warn · >90% krit">CPU-Load</Tooltip>
                </th>
                <th className="px-3 py-2">
                  <Tooltip title="Freier Arbeitsspeicher in GB" source="/api/v1/octoboss/nodes">RAM-Free</Tooltip>
                </th>
                <th className="px-3 py-2">
                  <Tooltip title="Ollama-Dienst läuft auf der Node" source="/api/v1/octoboss/nodes">Ollama</Tooltip>
                </th>
                <th className="px-3 py-2">
                  <Tooltip title="Letzter Heartbeat (relativ)" source="/api/v1/octoboss/nodes" updatedAt="alle 10s">Heartbeat</Tooltip>
                </th>
              </tr>
            </thead>
            <tbody>
              {nodes.map((node) => {
                const hw = node.hardware;
                const ollamaRunning = node.ollama?.running ?? false;
                const nodeId = node.node_id;
                return (
                  <tr
                    key={nodeId}
                    className="border-b border-white/5 hover:bg-bg-elevated/40 transition-colors"
                  >
                    <td className="px-3 py-2 font-medium text-fg">
                      <Link
                        to={nodeId}
                        className="text-brand hover:underline"
                        title={`Node-Detail für ${node.hostname}`}
                      >
                        {node.hostname}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <Tooltip
                        title={node.connected ? "Node ist verbunden" : "Node getrennt"}
                        source="/api/v1/octoboss/nodes"
                      >
                        <span className={node.connected ? "text-status-ok" : "text-status-error"}>
                          {node.connected ? "✓" : "✗"}
                        </span>
                      </Tooltip>
                    </td>
                    <td className="px-3 py-2 text-fg-muted">{node.mode ?? "—"}</td>
                    <td className="px-3 py-2 text-fg-muted text-xs">{hw?.gpu_name ?? "—"}</td>
                    <td className="px-3 py-2">
                      <Tooltip
                        title={`GPU-Auslastung: ${pct(hw?.gpu_load_percent)}`}
                        source="/api/v1/octoboss/nodes"
                        thresholds="<70% ok · 70-90% warn · >90% krit"
                      >
                        <span className={
                          hw?.gpu_load_percent == null ? "text-fg-subtle" :
                          hw.gpu_load_percent > 90 ? "text-status-error" :
                          hw.gpu_load_percent > 70 ? "text-status-warn" : "text-status-ok"
                        }>
                          {pct(hw?.gpu_load_percent)}
                        </span>
                      </Tooltip>
                    </td>
                    <td className="px-3 py-2">
                      <Tooltip
                        title={`CPU-Auslastung: ${pct(hw?.cpu_load_percent)}`}
                        source="/api/v1/octoboss/nodes"
                        thresholds="<70% ok · 70-90% warn · >90% krit"
                      >
                        <span className={
                          hw?.cpu_load_percent == null ? "text-fg-subtle" :
                          hw.cpu_load_percent > 90 ? "text-status-error" :
                          hw.cpu_load_percent > 70 ? "text-status-warn" : "text-status-ok"
                        }>
                          {pct(hw?.cpu_load_percent)}
                        </span>
                      </Tooltip>
                    </td>
                    <td className="px-3 py-2 text-fg-muted">
                      <Tooltip title={`Freier RAM: ${gb(hw?.ram_free_gb)}`} source="/api/v1/octoboss/nodes">
                        {gb(hw?.ram_free_gb)}
                      </Tooltip>
                    </td>
                    <td className="px-3 py-2">
                      <Tooltip
                        title={ollamaRunning ? "Ollama-Dienst läuft" : "Ollama nicht aktiv"}
                        source="/api/v1/octoboss/nodes"
                      >
                        <span className={ollamaRunning ? "text-status-ok" : "text-fg-subtle"}>
                          {ollamaRunning ? "✓" : "—"}
                        </span>
                      </Tooltip>
                    </td>
                    <td className="px-3 py-2 text-fg-subtle text-xs">
                      <Tooltip
                        title={node.last_heartbeat ?? "kein Heartbeat"}
                        source="/api/v1/octoboss/nodes"
                        updatedAt="alle 10s aktualisiert"
                      >
                        {relTime(node.last_heartbeat)}
                      </Tooltip>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <PageBadge id="octoboss.nodes" />
    </div>
  );
}

export default NodesPage;
