// OctoBoss Cluster — Cluster-Modus, Primary/Replica, Peers + ActionCard.
// Sub-Route: /octoboss/cluster
// Datenquellen: GET /api/v1/octoboss/cluster/status, /cluster/peers
// Aktion: octoboss.cluster.status

import { useQuery } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import { Tooltip } from "../../../components/Tooltip";
import { PageBadge } from "../../../components/PageBadge";
import { LoadingSpinner } from "../../../components/LoadingSpinner";
import { ActionCard } from "../../aktionen/ActionCard";
import type { Action, OctoBossClusterStatus, OctoBossPeer } from "../../../lib/types";

// Fallback-Action-Metadaten falls Registry nicht verfügbar
const ACTION_CLUSTER_STATUS: Action = {
  action_id: "octoboss.cluster.status",
  system_id: "octoboss",
  name: "Cluster-Status prüfen",
  description:
    "Fragt den OctoBoss-Hub nach dem aktuellen Cluster-Status: Modus, " +
    "Primary/Replica-Rollen, Peer-Liste und Verbindungszustand.",
  category: "diagnose",
  sub_area: "cluster",
  requires_confirm: false,
  is_destructive: false,
  estimated_duration_s: 5,
  implemented: true,
};

function ModeBadge({ mode }: { mode: string | null | undefined }) {
  if (!mode) return <span className="text-fg-subtle">—</span>;
  const color =
    mode === "primary"
      ? "bg-brand/15 text-brand border-brand/30"
      : mode === "replica"
        ? "bg-fg-subtle/15 text-fg-muted border-fg-subtle/30"
        : "bg-status-warn/15 text-status-warn border-status-warn/30";
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 text-xs font-medium ${color}`}>
      {mode}
    </span>
  );
}

export function ClusterPage() {
  const { data: statusData, isLoading: statusLoading, error: statusError } = useQuery({
    queryKey: ["octoboss", "cluster", "status"],
    queryFn: () => api.octoboss.getClusterStatus(),
    refetchInterval: 15_000,
  });

  const { data: peersData, isLoading: peersLoading, error: peersError } = useQuery({
    queryKey: ["octoboss", "cluster", "peers"],
    queryFn: () => api.octoboss.getClusterPeers(),
    refetchInterval: 15_000,
  });

  // Action aus Registry laden
  const { data: actionsData } = useQuery({
    queryKey: ["actions"],
    queryFn: api.getActions,
    staleTime: 60_000,
  });
  const registryActions = actionsData?.actions ?? [];
  const clusterStatusAction =
    registryActions.find((a) => a.action_id === "octoboss.cluster.status") ?? ACTION_CLUSTER_STATUS;

  const status = statusData as OctoBossClusterStatus | null | undefined;
  const peers: OctoBossPeer[] = (() => {
    if (!peersData) return [];
    if (Array.isArray(peersData)) return peersData as OctoBossPeer[];
    const d = peersData as Record<string, unknown>;
    if (Array.isArray(d.peers)) return d.peers as OctoBossPeer[];
    return [];
  })();

  const isLoading = statusLoading || peersLoading;
  const error = statusError || peersError;

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold text-fg">Cluster</h2>

      {isLoading && <LoadingSpinner />}
      {error && (
        <div className="rounded border border-status-error/30 bg-status-error/10 px-3 py-2 text-sm text-status-error">
          Fehler: {(error as Error).message}
        </div>
      )}

      {/* Cluster-Status-Panel */}
      {status && (
        <div className="rounded border border-white/10 bg-bg-panel">
          <div className="border-b border-white/10 px-4 py-3">
            <h3 className="text-sm font-semibold text-fg">Cluster-Status</h3>
          </div>
          <div className="grid grid-cols-2 gap-0 sm:grid-cols-3">
            {[
              {
                label: "Modus",
                tooltip: "Aktueller Cluster-Betriebsmodus (primary/replica/standalone)",
                value: <ModeBadge mode={(status as Record<string, unknown>).mode as string} />,
              },
              {
                label: "Cluster-ID",
                tooltip: "Eindeutige Cluster-ID",
                value: (
                  <span className="font-mono text-xs text-fg-muted">
                    {((status as Record<string, unknown>).cluster_id as string) ?? "—"}
                  </span>
                ),
              },
              {
                label: "Peers",
                tooltip: "Anzahl bekannter Cluster-Peers",
                value: (
                  <span className="text-fg tabular-nums">
                    {((status as Record<string, unknown>).peer_count as number) ?? peers.length}
                  </span>
                ),
              },
            ].map(({ label, tooltip, value }) => (
              <div key={label} className="border-b border-white/5 px-4 py-3 last:border-0 sm:border-r sm:last:border-r-0">
                <Tooltip title={tooltip} source="/api/v1/octoboss/cluster/status">
                  <p className="mb-1 text-xs text-fg-muted">{label}</p>
                </Tooltip>
                <div>{value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Peers-Tabelle */}
      {peers.length > 0 && (
        <div className="overflow-x-auto rounded border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-bg-panel text-left text-xs text-fg-muted">
                <th className="px-3 py-2">
                  <Tooltip title="Peer-Hostname" source="/api/v1/octoboss/cluster/peers">Hostname</Tooltip>
                </th>
                <th className="px-3 py-2">
                  <Tooltip title="Peer-Adresse + Port" source="/api/v1/octoboss/cluster/peers">Adresse</Tooltip>
                </th>
                <th className="px-3 py-2">
                  <Tooltip title="Betriebsmodus des Peers" source="/api/v1/octoboss/cluster/peers">Mode</Tooltip>
                </th>
                <th className="px-3 py-2">
                  <Tooltip
                    title="Online-Status des Peers"
                    source="/api/v1/octoboss/cluster/peers"
                    thresholds="online=verbunden · offline=nicht erreichbar"
                  >
                    Online
                  </Tooltip>
                </th>
                <th className="px-3 py-2">
                  <Tooltip title="Peer-ID" source="/api/v1/octoboss/cluster/peers">ID</Tooltip>
                </th>
              </tr>
            </thead>
            <tbody>
              {peers.map((peer) => {
                const peerId = peer.id || peer.instance_id || "?";
                const address = peer.url || (peer.address && peer.port ? `${peer.address}:${peer.port}` : peer.address ?? "—");
                return (
                  <tr key={peerId} className="border-b border-white/5 hover:bg-bg-elevated/40">
                    <td className="px-3 py-2 font-medium text-fg">{peer.hostname ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs text-fg-muted">{address}</td>
                    <td className="px-3 py-2">
                      <ModeBadge mode={peer.mode} />
                    </td>
                    <td className="px-3 py-2">
                      <Tooltip
                        title={peer.online ? "Peer ist online" : "Peer nicht erreichbar"}
                        source="/api/v1/octoboss/cluster/peers"
                      >
                        <span className={peer.online ? "text-status-ok" : "text-status-error"}>
                          {peer.online ? "✓" : "✗"}
                        </span>
                      </Tooltip>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-fg-subtle">{peerId}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && !error && !status && peers.length === 0 && (
        <p className="text-sm text-fg-muted">Keine Cluster-Daten verfügbar.</p>
      )}

      {/* Action */}
      <div>
        <h3 className="mb-3 text-sm font-medium text-fg-muted">Aktionen</h3>
        <div className="max-w-sm">
          <ActionCard action={clusterStatusAction} />
        </div>
      </div>

      <PageBadge id="octoboss.cluster" />
    </div>
  );
}

export default ClusterPage;
