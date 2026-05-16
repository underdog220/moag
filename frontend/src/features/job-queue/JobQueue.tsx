// JobQueue — Live-Liste der Jobs.
// - Initial-Load via api.listJobs
// - WS-Updates via useWebSocket (jobStore.applyEvent)
// - Resync bei Reconnect: Reload pending+running
// - Filter: all/pending/running/done/failed
// - Empty-State mit Pfeil-Animation

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { useWebSocket } from "../../lib/ws";
import type { JobState } from "../../lib/types";
import { JobRow } from "./JobRow";
import { useJobStore } from "./jobStore";
import { EmptyState } from "../../components/EmptyState";

const FILTERS: { id: "all" | JobState; label: string }[] = [
  { id: "all", label: "Alle" },
  { id: "pending", label: "Wartend" },
  { id: "running", label: "Laeuft" },
  { id: "done", label: "Fertig" },
  { id: "failed", label: "Fehler" },
];

export interface JobQueueProps {
  /** Optionaler Filter beim Initial-Load. */
  initialStatusFilter?: JobState[];
  /** Test-Hook: Override fuer den ersten Fetch. */
  fetchInitial?: () => Promise<{ jobs: ReturnType<typeof Array.of> }>;
  /** Klick-Handler — Default navigiert nach /jobs/:id. */
  onSelectJob?: (jobId: string) => void;
}

export function JobQueue({ initialStatusFilter, onSelectJob }: JobQueueProps) {
  const navigate = useNavigate();
  const filter = useJobStore((s) => s.filter);
  const setFilter = useJobStore((s) => s.setFilter);
  const visible = useJobStore((s) => s.visibleJobs)();
  const loadFromServer = useJobStore((s) => s.loadFromServer);
  const applyEvent = useJobStore((s) => s.applyEvent);

  const initialLoadedRef = useRef(false);

  const fetchAndLoad = useCallback(
    async (statusFilter?: string) => {
      try {
        const params: Record<string, string | number> = { limit: 50 };
        if (statusFilter) params.status = statusFilter;
        const res = await api.listJobs(params);
        loadFromServer(res.jobs);
      } catch {
        // Im Mock-Modus oder Offline: nicht crashen, Empty-State greift
      }
    },
    [loadFromServer],
  );

  // Initial-Load
  useEffect(() => {
    if (initialLoadedRef.current) return;
    initialLoadedRef.current = true;
    const filterStr = initialStatusFilter?.join(",");
    void fetchAndLoad(filterStr);
  }, [fetchAndLoad, initialStatusFilter]);

  // WS-Stream + Reconnect-Resync
  const reconnectSyncRef = useRef(0);
  const ws = useWebSocket({
    onEvent: (ev) => applyEvent(ev),
  });

  useEffect(() => {
    // Bei jedem (Re-)Connect mit attempt > 0: pending+running resyncen
    if (ws.status === "open" && ws.reconnectAttempt !== reconnectSyncRef.current) {
      reconnectSyncRef.current = ws.reconnectAttempt;
      if (ws.reconnectAttempt > 0) {
        void fetchAndLoad("pending,running");
      }
    }
  }, [ws.status, ws.reconnectAttempt, fetchAndLoad]);

  const handleSelect = useCallback(
    (jobId: string) => {
      if (onSelectJob) {
        onSelectJob(jobId);
      } else {
        navigate(`/jobs/${jobId}`);
      }
    },
    [navigate, onSelectJob],
  );

  const emptyHint = useMemo(() => {
    if (filter === "all") {
      return {
        title: "Keine Jobs - Datei reinziehen",
        description: "Drag eine PDF in die Drop-Zone oben oder klicke sie an.",
      };
    }
    return {
      title: `Keine Jobs mit Status "${filter}"`,
      description: "Wechsle den Filter oder lade neue Dateien hoch.",
    };
  }, [filter]);

  return (
    <div className="flex flex-col gap-2" data-testid="job-queue">
      {/* Filter-Bar + WS-Status */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              data-testid={`filter-${f.id}`}
              onClick={() => setFilter(f.id)}
              className={`rounded px-2 py-0.5 text-xxs ${
                filter === f.id
                  ? "bg-brand/20 text-brand"
                  : "bg-white/5 text-fg-muted hover:bg-white/10"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span
          data-testid="ws-status"
          data-status={ws.status}
          className={`text-xxs ${ws.status === "open" || ws.status === "mock" ? "text-status-ok" : "text-status-warn"}`}
        >
          WS: {ws.status}
        </span>
      </div>

      {visible.length === 0 ? (
        <div className="relative">
          <EmptyState
            title={emptyHint.title}
            description={emptyHint.description}
            icon={
              <span
                data-testid="empty-arrow"
                className="inline-block animate-bounce text-fg-subtle"
                aria-hidden
              >
                {String.fromCharCode(0x2191)}
              </span>
            }
          />
        </div>
      ) : (
        <div className="flex flex-col gap-2" data-testid="job-list">
          {visible.map((j) => (
            <JobRow key={j.job_id} job={j} onClick={handleSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

export default JobQueue;
