// NasDominator — Container-Seite.
// Quelle: GET /api/v1/nasdominator/containers

import { useQuery } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import { PageBadge } from "../../../components/PageBadge";
import { Tooltip } from "../../../components/Tooltip";
import { StatusDot, type StatusKind } from "../../../components/StatusDot";
import { LoadingSpinner } from "../../../components/LoadingSpinner";
import { EmptyState } from "../../../components/EmptyState";
import type { NasDomContainer } from "../../../lib/types";

const QUERY_KEY = ["nasdominator", "containers"];

function containerStatusKind(status: string): StatusKind {
  return ["running", "up"].includes(status.toLowerCase()) ? "ok" : "error";
}

function ContainerRow({ c }: { c: NasDomContainer }) {
  const kind = containerStatusKind(c.status);
  return (
    <tr className="border-t border-white/5 hover:bg-bg-subtle/30 transition-colors">
      <td className="py-2 px-3 text-sm text-fg font-medium">{c.name}</td>
      <td className="py-2 px-3 text-xs text-fg-muted">{c.image ?? "—"}</td>
      <td className="py-2 px-3">
        <Tooltip
          title={`Container-Status: ${c.status}`}
          source="/api/v1/nasdominator/containers"
          thresholds="running/up = gruen · alles andere = rot"
        >
          <span className="flex items-center gap-1.5">
            <StatusDot status={kind} />
            <span className={`text-xs ${kind === "ok" ? "text-status-ok" : "text-status-error"}`}>
              {c.status}
            </span>
          </span>
        </Tooltip>
      </td>
    </tr>
  );
}

export function ContainerPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => api.nasdominator.getContainers(),
    refetchInterval: 30_000,
    retry: 1,
  });

  const containers = data?.containers ?? [];
  const authRequired = data?.auth_required ?? false;

  return (
    <div className="flex flex-col gap-4 p-4">
      <Tooltip
        title="Container-Liste der QNAP-NAS (via NasDominator Docker-Inventar)"
        source="/api/v1/nasdominator/containers"
      >
        <h2 className="text-base font-semibold text-fg">Container</h2>
      </Tooltip>

      {authRequired && (
        <div className="rounded border border-status-warn/30 bg-status-warn/10 px-3 py-2 text-sm text-status-warn">
          NasDominator erfordert Anmeldung. Container-Daten nicht verfuegbar.
        </div>
      )}

      {isLoading && <LoadingSpinner />}

      {!isLoading && error && (
        <EmptyState
          icon="!"
          title="Fehler beim Laden"
          description={String(error)}
        />
      )}

      {!isLoading && !error && containers.length === 0 && !authRequired && (
        <EmptyState
          icon="~"
          title="Keine Container"
          description="NasDominator liefert keine Container-Daten."
        />
      )}

      {!isLoading && containers.length > 0 && (
        <div className="overflow-x-auto rounded border border-white/10 bg-bg-panel">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10 bg-bg-subtle">
                <th className="py-2 px-3 text-left text-xs font-medium text-fg-muted uppercase tracking-wider">
                  Name
                </th>
                <th className="py-2 px-3 text-left text-xs font-medium text-fg-muted uppercase tracking-wider">
                  Image
                </th>
                <th className="py-2 px-3 text-left text-xs font-medium text-fg-muted uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {containers.map((c, i) => (
                <ContainerRow key={c.name ?? i} c={c} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data?.fetched_at && (
        <p className="text-xxs text-fg-subtle text-right">
          Letzte Abfrage: {new Date(data.fetched_at).toLocaleTimeString("de-DE")}
        </p>
      )}

      <PageBadge id="nasdominator.containers" />
    </div>
  );
}

export default ContainerPage;
