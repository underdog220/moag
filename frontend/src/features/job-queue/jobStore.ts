// Job-Store: kombiniert initialen Fetch ueber API + Live-Updates aus WS-Events.
// Resync bei WS-Reconnect: Reload /api/jobs?status=pending,running.
//
// Datenmodell:
//   jobs: Map<job_id, JobRowState>
//   filter: 'all' | JobState
//   wsStatus: WsStatus (zur UI-Anzeige)
//
// Live-Update-Reducer:
//   job_started      -> upsert pending->running, setze filename
//   job_progress     -> page_done/page_total, engines_active, progress_pct
//   job_engine_done  -> Engine-Status pro Seite
//   job_done         -> done, doctype, consensus
//   job_failed       -> failed, error
//
// Optimistic-Update beim Drop: createPendingJob(filename) legt sofort einen Job mit status=pending an.

import { create } from "zustand";
import type { JobState, JobStatus, WsEvent } from "../../lib/types";

/** Engine-Status pro Seite/Engine (live aufgesammelt aus job_engine_done). */
export type EngineStatus = "pending" | "running" | "done" | "failed";

export interface PerEngine {
  engine: string;
  status: EngineStatus;
  latency_ms?: number;
  confidence?: number;
}

/** Aufgewerteter Job-State mit Live-Engine-Tracking + Native-PDF-Hint. */
export interface JobRowState extends JobStatus {
  /** Engines, die aktuell laufen (aus job_progress). */
  engines_active?: string[];
  /** Engine-Status fuer die aktuelle/letzte Seite. */
  engine_status?: PerEngine[];
  /** Gesetzt wenn Pipeline meldet engine=native_text_layer (kein OCR noetig). */
  native_text_layer?: boolean;
  /** Optimistic-Update-Flag (Datei lokal hinzugefuegt, noch keine Server-Antwort). */
  optimistic?: boolean;
}

interface JobStoreState {
  jobs: Map<string, JobRowState>;
  filter: "all" | JobState;
  setFilter: (f: "all" | JobState) => void;

  /** Liste der Jobs gemaess Filter, neueste zuerst. */
  visibleJobs: () => JobRowState[];

  /** Initial-Load oder Resync. Ueberschreibt vorhandene Jobs aus dem Server-Snapshot. */
  loadFromServer: (jobs: JobStatus[]) => void;

  /** WS-Event applizieren. */
  applyEvent: (ev: WsEvent) => void;

  /** Lokal sofort einen pending-Job einfuegen (Optimistic-Update beim Drop). */
  addOptimistic: (filename: string, jobId: string) => void;

  /** Job-ID umbennen (nach Upload-Antwort: job_id von Server -> echter Wert). */
  renameOptimistic: (oldId: string, newId: string) => void;

  /** Failed-Retry: Job zurueck auf pending. */
  markRetry: (jobId: string) => void;

  /** Nur fuer Tests: Reset. */
  _reset: () => void;
}

function nowIso(): string {
  return new Date().toISOString();
}

function withUpsert(
  state: Pick<JobStoreState, "jobs">,
  jobId: string,
  patch: (prev: JobRowState) => JobRowState,
  fallback?: () => JobRowState,
): Map<string, JobRowState> {
  const next = new Map(state.jobs);
  const prev = next.get(jobId);
  if (prev) {
    next.set(jobId, patch(prev));
  } else if (fallback) {
    next.set(jobId, fallback());
  }
  return next;
}

function emptyJob(jobId: string, filename = "(unbenannt)"): JobRowState {
  return {
    job_id: jobId,
    filename,
    status: "pending",
    progress_pct: 0,
    page_total: 0,
    page_done: 0,
    started_at: nowIso(),
    finished_at: null,
    doctype: null,
    doctype_confidence: null,
    pii_count: null,
    consensus_score: null,
    engines_used: [],
    nodes_used: [],
    error: null,
  };
}

export const useJobStore = create<JobStoreState>((set, get) => ({
  jobs: new Map(),
  filter: "all",
  setFilter: (f) => set({ filter: f }),

  visibleJobs: () => {
    const { jobs, filter } = get();
    const list = Array.from(jobs.values());
    const filtered = filter === "all" ? list : list.filter((j) => j.status === filter);
    // Neueste zuerst (started_at desc)
    filtered.sort((a, b) => {
      const ta = a.started_at ? new Date(a.started_at).getTime() : 0;
      const tb = b.started_at ? new Date(b.started_at).getTime() : 0;
      return tb - ta;
    });
    return filtered;
  },

  loadFromServer: (jobs) => {
    set((state) => {
      const next = new Map(state.jobs);
      for (const j of jobs) {
        // Bei vorhandenem Eintrag: Server-Daten gewinnen, aber Engine-Status (live) bleibt
        const prev = next.get(j.job_id);
        next.set(j.job_id, {
          ...j,
          engines_active: prev?.engines_active,
          engine_status: prev?.engine_status,
          native_text_layer: prev?.native_text_layer,
        } as JobRowState);
      }
      return { jobs: next };
    });
  },

  applyEvent: (ev) => {
    if (!ev || typeof ev !== "object") return;
    const t = (ev as { type?: string }).type;

    switch (t) {
      case "job_started": {
        const e = ev as Extract<WsEvent, { type: "job_started" }>;
        set((state) => ({
          jobs: withUpsert(
            state,
            e.job_id,
            (prev) => ({
              ...prev,
              status: "running",
              filename: e.filename || prev.filename,
              started_at: prev.started_at || nowIso(),
              optimistic: false,
            }),
            () => ({
              ...emptyJob(e.job_id, e.filename),
              status: "running",
            }),
          ),
        }));
        break;
      }
      case "job_progress": {
        const e = ev as Extract<WsEvent, { type: "job_progress" }> & {
          engine?: string;
          engines?: string[];
          phase?: string;
        };
        const isNative = e.engine === "native_text_layer";
        set((state) => ({
          jobs: withUpsert(
            state,
            e.job_id,
            (prev) => {
              const pageTotal = e.page_total ?? prev.page_total;
              const pageDone = e.page_done ?? prev.page_done;
              const pct =
                pageTotal > 0 ? Math.min(100, Math.round((pageDone / pageTotal) * 100)) : prev.progress_pct;
              const enginesActive = e.engines && e.engines.length > 0
                ? e.engines
                : e.engine
                  ? [e.engine]
                  : prev.engines_active;
              return {
                ...prev,
                status: "running",
                page_total: pageTotal,
                page_done: pageDone,
                progress_pct: pct,
                engines_active: enginesActive,
                native_text_layer: isNative ? true : prev.native_text_layer,
              };
            },
            () => ({
              ...emptyJob(e.job_id),
              status: "running",
              page_total: e.page_total ?? 0,
              page_done: e.page_done ?? 0,
              progress_pct: e.page_total
                ? Math.round(((e.page_done ?? 0) / e.page_total) * 100)
                : 0,
              engines_active: e.engines ?? (e.engine ? [e.engine] : []),
              native_text_layer: isNative,
            }),
          ),
        }));
        break;
      }
      case "job_engine_done": {
        const e = ev as Extract<WsEvent, { type: "job_engine_done" }>;
        set((state) => ({
          jobs: withUpsert(
            state,
            e.job_id,
            (prev) => {
              const engineStatus: PerEngine[] = (prev.engine_status ?? []).filter(
                (s) => s.engine !== e.engine,
              );
              engineStatus.push({
                engine: e.engine,
                status: "done",
                latency_ms: e.latency_ms,
                confidence: e.confidence,
              });
              const usedSet = new Set(prev.engines_used);
              usedSet.add(e.engine);
              return {
                ...prev,
                engine_status: engineStatus,
                engines_used: Array.from(usedSet),
              };
            },
            () => ({
              ...emptyJob(e.job_id),
              status: "running",
              engine_status: [
                {
                  engine: e.engine,
                  status: "done",
                  latency_ms: e.latency_ms,
                  confidence: e.confidence,
                },
              ],
              engines_used: [e.engine],
            }),
          ),
        }));
        break;
      }
      case "job_done": {
        const e = ev as Extract<WsEvent, { type: "job_done" }> & {
          page_total?: number;
          engines_used?: string[];
        };
        set((state) => ({
          jobs: withUpsert(
            state,
            e.job_id,
            (prev) => ({
              ...prev,
              status: "done",
              progress_pct: 100,
              page_total: e.page_total ?? prev.page_total,
              page_done: e.page_total ?? prev.page_total,
              finished_at: nowIso(),
              doctype: e.doctype ?? prev.doctype,
              doctype_confidence: e.doctype_confidence ?? prev.doctype_confidence,
              pii_count: e.pii_count ?? prev.pii_count,
              consensus_score: e.consensus_score ?? prev.consensus_score,
              engines_used: e.engines_used ?? prev.engines_used,
              error: null,
            }),
            () => ({
              ...emptyJob(e.job_id),
              status: "done",
              progress_pct: 100,
              page_total: e.page_total ?? 0,
              page_done: e.page_total ?? 0,
              finished_at: nowIso(),
              doctype: e.doctype,
              doctype_confidence: e.doctype_confidence,
              pii_count: e.pii_count,
              consensus_score: e.consensus_score,
              engines_used: e.engines_used ?? [],
            }),
          ),
        }));
        break;
      }
      case "job_failed": {
        const e = ev as Extract<WsEvent, { type: "job_failed" }>;
        set((state) => ({
          jobs: withUpsert(
            state,
            e.job_id,
            (prev) => ({
              ...prev,
              status: "failed",
              finished_at: nowIso(),
              error: e.error,
            }),
            () => ({
              ...emptyJob(e.job_id),
              status: "failed",
              finished_at: nowIso(),
              error: e.error,
            }),
          ),
        }));
        break;
      }
      default:
        // Andere Event-Typen ignorieren (z.B. hub_status_changed, edge_log)
        break;
    }
  },

  addOptimistic: (filename, jobId) => {
    set((state) => {
      const next = new Map(state.jobs);
      next.set(jobId, {
        ...emptyJob(jobId, filename),
        optimistic: true,
      });
      return { jobs: next };
    });
  },

  renameOptimistic: (oldId, newId) => {
    set((state) => {
      const next = new Map(state.jobs);
      const prev = next.get(oldId);
      if (!prev) return { jobs: state.jobs };
      next.delete(oldId);
      next.set(newId, { ...prev, job_id: newId });
      return { jobs: next };
    });
  },

  markRetry: (jobId) => {
    set((state) => ({
      jobs: withUpsert(state, jobId, (prev) => ({
        ...prev,
        status: "pending",
        progress_pct: 0,
        page_done: 0,
        error: null,
        finished_at: null,
        engine_status: undefined,
      })),
    }));
  },

  _reset: () => set({ jobs: new Map(), filter: "all" }),
}));
