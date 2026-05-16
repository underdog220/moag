// ClusterDashboard — Container fuer /dashboard.
// Stapelt:
//   1. Hub-Multi-Tabelle (von hub-overview)
//   2. EngineMatrix
//   3. GpuLiveBars
//   4. ModuleVersionsTable
//   5. RoundRobinBar
//   6. EdgeLogTail
//
// Nutzt einen WebSocket-Subscriber, der bei `hub_status_changed`-Events die
// Hub-Query invalidiert (Fallback: 5s Polling in HubMultiTable selbst).

import { useQueryClient } from "@tanstack/react-query";
import { qk } from "../../lib/queryKeys";
import { HubMultiTable } from "../hub-overview/HubMultiTable";
import { EngineMatrix } from "./EngineMatrix";
import { GpuLiveBars } from "./GpuLiveBars";
import { ModuleVersionsTable } from "./ModuleVersionsTable";
import { RoundRobinBar } from "./RoundRobinBar";
import { EdgeLogTail } from "./EdgeLogTail";
import { useWebSocket } from "../../lib/ws";
import type { WsEvent } from "../../lib/types";

export interface ClusterDashboardProps {
  /** Refresh-Intervall fuer alle Karten (kann pro Karte ueberschrieben werden). */
  refetchIntervalMs?: number;
}

export function ClusterDashboard({ refetchIntervalMs }: ClusterDashboardProps = {}) {
  const qc = useQueryClient();

  // WS-Subscriber: invalidert relevante Caches sofort bei Events.
  useWebSocket({
    onEvent: (ev: WsEvent) => {
      switch (ev.type) {
        case "hub_status_changed":
          qc.invalidateQueries({ queryKey: qk.cluster.hubs });
          break;
        case "node_health_changed":
          // GpuLiveBars hat eigenen Patch-State, aber bei strukturellen Aenderungen
          // (Node connect/disconnect) Reload anstossen.
          qc.invalidateQueries({ queryKey: qk.cluster.nodes });
          break;
        case "settings_changed":
          // Default-Hub kann sich aendern -> Hub-Liste neu.
          qc.invalidateQueries({ queryKey: qk.cluster.hubs });
          qc.invalidateQueries({ queryKey: qk.cluster.nodes });
          break;
        default:
          // andere Events ignorieren (Job-Events gehen an Job-Queue-Tab)
          break;
      }
    },
  });

  return (
    <div
      className="space-y-4 p-4"
      data-testid="cluster-dashboard"
    >
      {/* 1. Hub-Multi-Sicht — immer ganz oben */}
      <HubMultiTable refetchIntervalMs={refetchIntervalMs ?? 5_000} />

      {/* 2 + 3: Engine-Matrix nebeneinander mit GPU-Bars */}
      <div className="grid gap-4 xl:grid-cols-2">
        <EngineMatrix refetchIntervalMs={refetchIntervalMs ?? 10_000} />
        <RoundRobinBar refetchIntervalMs={refetchIntervalMs ?? 30_000} />
      </div>

      {/* 4: GPU/CPU/RAM Live-Bars */}
      <GpuLiveBars refetchIntervalMs={refetchIntervalMs ?? 10_000} />

      {/* 5: Modul-Versionen */}
      <ModuleVersionsTable refetchIntervalMs={refetchIntervalMs ?? 30_000} />

      {/* 6: Edge-Log-Tail */}
      <EdgeLogTail refetchIntervalMs={refetchIntervalMs ?? 15_000} />
    </div>
  );
}

export default ClusterDashboard;
