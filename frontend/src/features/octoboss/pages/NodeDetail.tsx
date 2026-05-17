// OctoBoss Node-Detail — Detailansicht einer einzelnen Node.
// Sub-Route: /octoboss/nodes/:node_id

import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import { api } from "../../../lib/api";
import { Tooltip } from "../../../components/Tooltip";
import { PageBadge } from "../../../components/PageBadge";
import { LoadingSpinner } from "../../../components/LoadingSpinner";
import type { OctoBossNodeDetail } from "../../../lib/types";

function Row({ label, value, tooltip }: { label: string; value: React.ReactNode; tooltip: string }) {
  return (
    <tr className="border-b border-white/5">
      <td className="px-3 py-1.5 text-xs text-fg-muted w-40">{label}</td>
      <td className="px-3 py-1.5 text-sm text-fg">
        <Tooltip title={tooltip} source="/api/v1/octoboss/nodes/{node_id}">{value}</Tooltip>
      </td>
    </tr>
  );
}

export function NodeDetailPage() {
  const { node_id } = useParams<{ node_id: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ["octoboss", "nodes", node_id],
    queryFn: () => api.octoboss.getNode(node_id!),
    enabled: !!node_id,
    refetchInterval: 10_000,
  });

  const node = data as OctoBossNodeDetail | null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link to=".." className="text-brand hover:underline text-sm">← Nodes</Link>
        <span className="text-fg-subtle">/</span>
        <h2 className="text-lg font-semibold text-fg">{node?.hostname ?? node_id}</h2>
      </div>

      {isLoading && <LoadingSpinner />}
      {error && (
        <div className="rounded border border-status-error/30 bg-status-error/10 px-3 py-2 text-sm text-status-error">
          Fehler: {(error as Error).message}
        </div>
      )}

      {node && (
        <div className="overflow-x-auto rounded border border-white/10">
          <table className="w-full">
            <tbody>
              <Row label="Node-ID" value={node.node_id} tooltip="Eindeutige Node-ID" />
              <Row label="Hostname" value={node.hostname} tooltip="Netzwerk-Hostname" />
              <Row
                label="Status"
                value={
                  <span className={node.connected ? "text-status-ok" : "text-status-error"}>
                    {node.connected ? "Verbunden" : "Getrennt"}
                  </span>
                }
                tooltip="Verbindungsstatus zum Hub"
              />
              <Row label="Mode" value={node.mode ?? "—"} tooltip="Betriebsmodus (IDLE/ACTIVE/OFFLINE)" />
              <Row label="Letzte IP" value={node.last_known_ip ?? "—"} tooltip="Zuletzt bekannte IP-Adresse" />
              <Row
                label="Heartbeat"
                value={node.last_heartbeat ?? "—"}
                tooltip="Zeitstempel des letzten Heartbeats"
              />
              {node.hardware && (
                <>
                  <Row label="GPU" value={node.hardware.gpu_name ?? "—"} tooltip="GPU-Modell" />
                  <Row
                    label="GPU-Load"
                    value={node.hardware.gpu_load_percent != null ? `${node.hardware.gpu_load_percent.toFixed(1)} %` : "—"}
                    tooltip="GPU-Auslastung in Prozent"
                  />
                  <Row
                    label="CPU-Load"
                    value={node.hardware.cpu_load_percent != null ? `${node.hardware.cpu_load_percent.toFixed(1)} %` : "—"}
                    tooltip="CPU-Auslastung in Prozent"
                  />
                  <Row
                    label="RAM-Free"
                    value={node.hardware.ram_free_gb != null ? `${node.hardware.ram_free_gb.toFixed(1)} GB` : "—"}
                    tooltip="Freier Arbeitsspeicher"
                  />
                  <Row label="CPU-Modell" value={node.hardware.cpu_model ?? "—"} tooltip="CPU-Modellbezeichnung" />
                </>
              )}
              {node.ollama && (
                <>
                  <Row
                    label="Ollama"
                    value={
                      <span className={node.ollama.running ? "text-status-ok" : "text-fg-muted"}>
                        {node.ollama.running ? "Läuft" : "Gestoppt"}
                      </span>
                    }
                    tooltip="Ollama-Dienst-Status"
                  />
                  <Row
                    label="Ollama-Modelle"
                    value={node.ollama.models?.join(", ") || "—"}
                    tooltip="Geladene Ollama-Modelle"
                  />
                </>
              )}
              <Row
                label="Module"
                value={node.modules?.map((m) => `${m.name} ${m.version}`).join(", ") || "—"}
                tooltip="Registrierte Node-Module"
              />
              <Row
                label="Engines"
                value={node.engines?.join(", ") || "—"}
                tooltip="Verfügbare OCR-Engines"
              />
            </tbody>
          </table>
        </div>
      )}

      <PageBadge id="octoboss.node-detail" />
    </div>
  );
}

export default NodeDetailPage;
