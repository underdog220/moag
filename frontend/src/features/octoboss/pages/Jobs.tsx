// OctoBoss Jobs — Scheduler-Queue mit State-Filter.
// Sub-Route: /octoboss/jobs
// Datenquelle: GET /api/v1/octoboss/jobs

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import { Tooltip } from "../../../components/Tooltip";
import { PageBadge } from "../../../components/PageBadge";
import { LoadingSpinner } from "../../../components/LoadingSpinner";
import type { OctoBossJob } from "../../../lib/types";

const STATE_OPTIONS = [
  { value: "", label: "Alle" },
  { value: "pending", label: "Pending" },
  { value: "running", label: "Running" },
  { value: "done", label: "Done" },
  { value: "failed", label: "Failed" },
];

function stateColor(state: string): string {
  switch (state) {
    case "running": return "text-brand";
    case "done": return "text-status-ok";
    case "failed": return "text-status-error";
    default: return "text-fg-muted";
  }
}

function relTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const s = Math.floor(diff / 1000);
    if (s < 60) return `vor ${s}s`;
    if (s < 3600) return `vor ${Math.floor(s / 60)}min`;
    return `vor ${Math.floor(s / 3600)}h`;
  } catch {
    return iso;
  }
}

export function JobsPage() {
  const [stateFilter, setStateFilter] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["octoboss", "jobs", stateFilter],
    queryFn: () => api.octoboss.getJobs({ state: stateFilter || undefined, limit: 100 }),
    refetchInterval: 8_000,
  });

  const jobs: OctoBossJob[] = (() => {
    if (!data) return [];
    if (Array.isArray(data)) return data as OctoBossJob[];
    const d = data as Record<string, unknown>;
    if (Array.isArray(d.jobs)) return d.jobs as OctoBossJob[];
    return [];
  })();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold text-fg">Jobs</h2>
        <div className="flex items-center gap-2">
          <label className="text-xs text-fg-muted">State:</label>
          <Tooltip title="Filtert die Job-Queue nach Status" source="/api/v1/octoboss/jobs">
            <select
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
              className="rounded border border-white/10 bg-bg-elevated px-2 py-1 text-xs text-fg
                         focus:outline-none focus:ring-1 focus:ring-brand/50"
            >
              {STATE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Tooltip>
        </div>
      </div>

      {isLoading && <LoadingSpinner />}
      {error && (
        <div className="rounded border border-status-error/30 bg-status-error/10 px-3 py-2 text-sm text-status-error">
          Fehler: {(error as Error).message}
        </div>
      )}

      {!isLoading && !error && jobs.length === 0 && (
        <p className="text-sm text-fg-muted">Keine Jobs gefunden.</p>
      )}

      {jobs.length > 0 && (
        <div className="overflow-x-auto rounded border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-bg-panel text-left text-xs text-fg-muted">
                <th className="px-3 py-2">
                  <Tooltip title="Job-ID" source="/api/v1/octoboss/jobs">Job-ID</Tooltip>
                </th>
                <th className="px-3 py-2">
                  <Tooltip title="Aktueller Job-Status" source="/api/v1/octoboss/jobs" thresholds="running=aktiv · done=fertig · failed=fehler · pending=wartend">State</Tooltip>
                </th>
                <th className="px-3 py-2">
                  <Tooltip title="Art des Workloads (z.B. llm_inference)" source="/api/v1/octoboss/jobs">Workload</Tooltip>
                </th>
                <th className="px-3 py-2">
                  <Tooltip title="Ziel-Node-ID (falls gesetzt)" source="/api/v1/octoboss/jobs">Node</Tooltip>
                </th>
                <th className="px-3 py-2">
                  <Tooltip title="Erstellungszeit (relativ)" source="/api/v1/octoboss/jobs" updatedAt="alle 8s">Erstellt</Tooltip>
                </th>
                <th className="px-3 py-2">
                  <Tooltip title="Fehlermeldung bei State=failed" source="/api/v1/octoboss/jobs">Fehler</Tooltip>
                </th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => {
                const id = job.id || job.job_id || "?";
                return (
                  <tr key={id} className="border-b border-white/5 hover:bg-bg-elevated/40">
                    <td className="px-3 py-2 font-mono text-xs text-fg-muted">{id}</td>
                    <td className="px-3 py-2 font-medium">
                      <span className={stateColor(job.state)}>{job.state}</span>
                    </td>
                    <td className="px-3 py-2 text-fg-muted">{job.workload_type ?? "—"}</td>
                    <td className="px-3 py-2 text-fg-subtle text-xs">{job.target_node_id ?? "—"}</td>
                    <td className="px-3 py-2 text-fg-subtle text-xs">{relTime(job.created_at)}</td>
                    <td className="px-3 py-2 text-status-error text-xs">{job.error ?? ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <PageBadge id="octoboss.jobs" />
    </div>
  );
}

export default JobsPage;
