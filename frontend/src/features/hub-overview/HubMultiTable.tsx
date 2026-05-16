// HubMultiTable — Tabelle aller bekannten Hubs aus /api/cluster/hubs.
// Zeigt: Name, URL, Status-Dot, Latenz, Nodes (connected/total), Engines, Default-Switch.
// Live-Update via React-Query-Polling (5s) — WS-Hub-Status-Events koennen die
// Cache-Invalidierung triggern (siehe ClusterDashboard-Container).

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { api } from "../../lib/api";
import { qk } from "../../lib/queryKeys";
import { formatLatency, formatRelative } from "../../lib/format";
import type { HubStatus } from "../../lib/types";
import { HubHealthDot } from "./HubHealthDot";

export interface HubMultiTableProps {
  /** Optionaler Auto-Refresh-Intervall (ms). Default 5000. */
  refetchIntervalMs?: number;
  /** Optionaler Klassen-Hook. */
  className?: string;
}

export function HubMultiTable({
  refetchIntervalMs = 5_000,
  className = "",
}: HubMultiTableProps) {
  const qc = useQueryClient();

  const hubsQuery = useQuery({
    queryKey: qk.cluster.hubs,
    queryFn: () => api.getHubs(),
    refetchInterval: refetchIntervalMs,
    refetchIntervalInBackground: false,
    retry: 1,
  });

  const setDefault = useMutation({
    mutationFn: (id: string) => api.setDefaultHub(id),
    onMutate: async (newDefaultId) => {
      // Optimistic Update: sofort in der UI als Default markieren
      await qc.cancelQueries({ queryKey: qk.cluster.hubs });
      const previous = qc.getQueryData<{ hubs: HubStatus[] }>(qk.cluster.hubs);
      if (previous) {
        qc.setQueryData<{ hubs: HubStatus[] }>(qk.cluster.hubs, {
          hubs: previous.hubs.map((h) => ({ ...h, is_default: h.id === newDefaultId })),
        });
      }
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      // Rollback bei Fehler
      if (ctx?.previous) {
        qc.setQueryData(qk.cluster.hubs, ctx.previous);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.cluster.hubs });
    },
  });

  if (hubsQuery.isLoading) {
    return (
      <Card title="Hub-Multi-Sicht" className={className}>
        <LoadingSpinner label="Hubs werden geladen..." />
      </Card>
    );
  }

  if (hubsQuery.isError) {
    return (
      <Card title="Hub-Multi-Sicht" className={className}>
        <EmptyState
          title="Hubs konnten nicht geladen werden"
          description={(hubsQuery.error as Error).message}
        />
      </Card>
    );
  }

  const hubs = hubsQuery.data?.hubs ?? [];

  if (hubs.length === 0) {
    return (
      <Card title="Hub-Multi-Sicht" className={className}>
        <EmptyState
          title="Keine Hubs konfiguriert"
          description="Trage in den Einstellungen mindestens einen Hub ein."
          action={
            <Link
              to="/settings"
              className="rounded border border-brand bg-brand/10 px-3 py-1 text-xs
                         font-semibold text-brand hover:bg-brand/20"
            >
              Zu Einstellungen
            </Link>
          }
        />
      </Card>
    );
  }

  return (
    <Card
      title="Hub-Multi-Sicht"
      description={`${hubs.length} konfigurierte Hubs · Auto-Refresh ${
        refetchIntervalMs / 1000
      }s`}
      className={className}
    >
      <div className="overflow-x-auto" data-testid="hub-multi-table">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-white/5 text-xs uppercase text-fg-subtle">
            <tr>
              <th className="px-2 py-2 font-medium">Status</th>
              <th className="px-2 py-2 font-medium">Name</th>
              <th className="px-2 py-2 font-medium">URL</th>
              <th className="px-2 py-2 font-medium">Latenz</th>
              <th className="px-2 py-2 font-medium">Nodes</th>
              <th className="px-2 py-2 font-medium">Engines</th>
              <th className="px-2 py-2 font-medium">Letzte Pruefung</th>
              <th className="px-2 py-2 font-medium">Default</th>
            </tr>
          </thead>
          <tbody>
            {hubs.map((hub) => (
              <HubRow
                key={hub.id}
                hub={hub}
                isPending={setDefault.isPending && setDefault.variables === hub.id}
                onSetDefault={() => setDefault.mutate(hub.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

interface HubRowProps {
  hub: HubStatus;
  isPending: boolean;
  onSetDefault: () => void;
}

function HubRow({ hub, isPending, onSetDefault }: HubRowProps) {
  const nodesLabel =
    hub.nodes_total === 0
      ? "—"
      : `${hub.nodes_connected}/${hub.nodes_total}`;
  const enginesLabel = hub.engines_count === 0 ? "—" : String(hub.engines_count);
  const enginesTooltip =
    hub.engines_count === 0
      ? "Hub kennt noch keine Engines, vermutlich frische DB ohne Discovery"
      : `${hub.engines_count} Engines verfuegbar`;

  return (
    <tr
      className="border-b border-white/5 last:border-b-0 hover:bg-bg-subtle/50"
      data-hub-id={hub.id}
      data-testid={`hub-row-${hub.id}`}
    >
      <td className="px-2 py-2">
        <HubHealthDot
          reachable={hub.reachable}
          latencyMs={hub.latency_ms}
          pulse
        />
      </td>
      <td className="px-2 py-2 font-semibold text-fg">{hub.name}</td>
      <td className="px-2 py-2 font-mono text-xs text-fg-muted">{hub.url}</td>
      <td className="px-2 py-2 tabular-nums">
        {hub.reachable ? formatLatency(hub.latency_ms) : "-"}
      </td>
      <td className="px-2 py-2 tabular-nums">{nodesLabel}</td>
      <td
        className="px-2 py-2 tabular-nums"
        title={enginesTooltip}
      >
        {enginesLabel}
      </td>
      <td className="px-2 py-2 text-xs text-fg-muted">
        {formatRelative(hub.last_check)}
      </td>
      <td className="px-2 py-2">
        {hub.is_default ? (
          <span
            className="rounded border border-brand/40 bg-brand/10 px-2 py-0.5
                       text-xxs font-mono uppercase text-brand"
            data-testid={`hub-default-${hub.id}`}
          >
            Default
          </span>
        ) : (
          <button
            type="button"
            onClick={onSetDefault}
            disabled={isPending || !hub.reachable}
            data-testid={`hub-set-default-${hub.id}`}
            className="rounded border border-white/10 bg-bg-panel px-2 py-0.5 text-xxs
                       text-fg-muted hover:border-brand/40 hover:text-brand
                       disabled:cursor-not-allowed disabled:opacity-50"
            title={
              hub.reachable
                ? "Diesen Hub als Default markieren"
                : "Nicht erreichbarer Hub kann nicht Default werden"
            }
          >
            {isPending ? "..." : "Setzen"}
          </button>
        )}
      </td>
    </tr>
  );
}

export default HubMultiTable;
