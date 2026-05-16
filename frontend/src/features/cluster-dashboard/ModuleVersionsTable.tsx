// ModuleVersionsTable — Tabelle Node x Modul x Version.
// Drift-Highlight: wenn pro Modul nicht alle Nodes die gleiche Version haben,
// werden die abweichenden Zellen gelb-orange markiert.
// [Update]-Button: Stub fuer kuenftigen Plugin-Distributor (Briefing C: out-of-scope fuer jetzt).

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { api } from "../../lib/api";
import { qk } from "../../lib/queryKeys";
import type { ClusterNode } from "../../lib/types";

export interface ModuleVersionsTableProps {
  refetchIntervalMs?: number;
}

interface ModuleEntry {
  moduleName: string;
  /** Map hostname -> Version-String. */
  versionsByHost: Record<string, string | null>;
  /** Set aller einzigartigen Versionen — Drift wenn size > 1. */
  uniqueVersions: Set<string>;
  /** Mehrheits-Version (wird als "Soll" interpretiert). */
  majorityVersion: string | null;
}

function buildModuleEntries(nodes: ClusterNode[]): {
  rows: ModuleEntry[];
  hostnames: string[];
} {
  const hostnames = nodes.map((n) => n.hostname);
  const moduleNames = new Set<string>();
  for (const n of nodes) {
    for (const m of n.modules ?? []) moduleNames.add(m.name);
  }

  const rows: ModuleEntry[] = [];
  for (const moduleName of Array.from(moduleNames).sort()) {
    const versionsByHost: Record<string, string | null> = {};
    const versionCounts = new Map<string, number>();
    for (const n of nodes) {
      const found = (n.modules ?? []).find((m) => m.name === moduleName);
      const v = found?.version ?? null;
      versionsByHost[n.hostname] = v;
      if (v != null) {
        versionCounts.set(v, (versionCounts.get(v) ?? 0) + 1);
      }
    }
    const uniqueVersions = new Set<string>(
      Object.values(versionsByHost).filter((v): v is string => v != null)
    );
    let majorityVersion: string | null = null;
    let topCount = 0;
    for (const [v, c] of versionCounts.entries()) {
      if (c > topCount) {
        topCount = c;
        majorityVersion = v;
      }
    }
    rows.push({ moduleName, versionsByHost, uniqueVersions, majorityVersion });
  }
  return { rows, hostnames };
}

export function ModuleVersionsTable({
  refetchIntervalMs = 30_000,
}: ModuleVersionsTableProps) {
  const nodesQuery = useQuery({
    queryKey: qk.cluster.nodes,
    queryFn: () => api.getNodes(),
    refetchInterval: refetchIntervalMs,
    refetchIntervalInBackground: false,
    retry: 1,
  });

  // Nur fuer Update-Button-Stub: lokaler Toast.
  const [pendingNode, setPendingNode] = useState<string | null>(null);

  const { rows, hostnames } = useMemo(
    () => buildModuleEntries(nodesQuery.data?.nodes ?? []),
    [nodesQuery.data]
  );

  if (nodesQuery.isLoading) {
    return (
      <Card title="Modul-Versionen">
        <LoadingSpinner label="Modul-Versionen werden geladen..." />
      </Card>
    );
  }
  if (nodesQuery.isError) {
    return (
      <Card title="Modul-Versionen">
        <EmptyState
          title="Modul-Versionen konnten nicht geladen werden"
          description={(nodesQuery.error as Error).message}
        />
      </Card>
    );
  }
  if (rows.length === 0 || hostnames.length === 0) {
    return (
      <Card title="Modul-Versionen">
        <EmptyState
          title="Keine Modul-Daten"
          description="Hub kennt noch keine Module pro Node."
        />
      </Card>
    );
  }

  const driftCount = rows.filter((r) => r.uniqueVersions.size > 1).length;

  return (
    <Card
      title="Modul-Versionen"
      description={
        driftCount === 0
          ? `${rows.length} Module · alle Versionen uniform`
          : `${rows.length} Module · ${driftCount} mit Versions-Drift`
      }
    >
      <div className="overflow-x-auto" data-testid="module-versions-table">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-white/5 text-xs uppercase text-fg-subtle">
            <tr>
              <th className="px-3 py-2 font-medium">Modul</th>
              {hostnames.map((h) => (
                <th key={h} className="px-3 py-2 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const drift = row.uniqueVersions.size > 1;
              return (
                <tr
                  key={row.moduleName}
                  className="border-b border-white/5 last:border-b-0"
                  data-testid={`module-row-${row.moduleName}`}
                  data-drift={drift ? "true" : "false"}
                >
                  <td className="px-3 py-2 font-mono text-xs font-semibold text-fg">
                    {row.moduleName}
                    {drift && (
                      <span
                        className="ml-2 rounded border border-status-warn/40 bg-status-warn/10
                                   px-1.5 py-0.5 text-xxs font-mono uppercase text-status-warn"
                        title={`Versions-Drift: ${Array.from(row.uniqueVersions).join(", ")}`}
                      >
                        Drift
                      </span>
                    )}
                  </td>
                  {hostnames.map((host) => {
                    const version = row.versionsByHost[host] ?? null;
                    const isDriftCell =
                      drift && version != null && version !== row.majorityVersion;
                    const isMissing = version == null;
                    const cls = isMissing
                      ? "text-fg-subtle"
                      : isDriftCell
                      ? "text-status-warn font-semibold"
                      : "text-fg";
                    return (
                      <td
                        key={`${row.moduleName}-${host}`}
                        className={`px-3 py-2 font-mono text-xs ${cls}`}
                        data-testid={`module-cell-${row.moduleName}-${host}`}
                        data-drift-cell={isDriftCell ? "true" : "false"}
                        title={
                          isMissing
                            ? `Modul ${row.moduleName} nicht installiert auf ${host}`
                            : isDriftCell
                            ? `Drift: ${version} (Mehrheit: ${row.majorityVersion ?? "?"})`
                            : `${row.moduleName} ${version} auf ${host}`
                        }
                      >
                        <span className="inline-flex items-center gap-1">
                          {version ?? "—"}
                          {(isDriftCell || isMissing) && (
                            <button
                              type="button"
                              disabled={pendingNode === host}
                              onClick={() => {
                                // Stub: Backend-Endpoint /api/cluster/nodes/{id}/install ist OUT-of-Scope
                                // fuer Phase 2. Hier nur Click-Feedback fuer kuenftigen Distributor.
                                setPendingNode(host);
                                window.setTimeout(() => setPendingNode(null), 1_500);
                              }}
                              className="rounded border border-white/10 bg-bg-panel px-1.5
                                         text-xxs text-fg-muted hover:border-brand/40
                                         hover:text-brand disabled:opacity-50"
                              data-testid={`module-update-${row.moduleName}-${host}`}
                              title="Update anstossen (Phase-3-Stub)"
                            >
                              {pendingNode === host ? "..." : "Update"}
                            </button>
                          )}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-3 text-xxs text-fg-subtle">
          Update-Button ist Phase-3-Stub: Plugin-Distributor folgt mit Backend-Endpoint
          POST /api/cluster/nodes/&#123;id&#125;/install
        </p>
      </div>
    </Card>
  );
}

export default ModuleVersionsTable;
