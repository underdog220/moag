// Fetch-Wrapper fuer das MOAG-Backend.
// Liefert typisierte Daten, kapselt Fehler in einer ApiError-Klasse.
// Im Mock-Modus wird statt fetch der Mock-Loader genutzt.

import { isMockMode } from "./env";
import { mockGet, setMockDefaultHub } from "../mocks/loader";
import type {
  HubStatus,
  ClusterNode,
  EngineMatrix,
  EdgeLogEvent,
  JobStatus,
  JobDetail,
  RecognizedTextDocument,
  AbCompareResult,
  HubTestResult,
  Settings,
  ThroughputPoint,
  EnginePerformance,
  DoctypeDistribution,
  RoundRobinPoint,
  FailureRate,
  HealthInfo,
  ClusterStatus,
  ClusterPeer,
  ElectionTriggerResponse,
  ProvidersResponse,
  CockpitProvider,
  CallsResponse,
  CostResponse,
  AuditResponse,
  SmokeResponse,
  OverviewResponse,
} from "./types";

const API_BASE = "/api";

export class ApiError extends Error {
  constructor(public status: number, public path: string, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

/**
 * Normalisiert Date-Only-Strings (YYYY-MM-DD, z.B. aus <input type="date">)
 * zu vollstaendigen ISO-Datetime-Strings, die Oberon akzeptiert.
 * ISO-Datetime-Input (enthaelt "T") wird unveraendert durchgereicht.
 *
 * @param d       Eingabe-String — entweder "YYYY-MM-DD" oder "YYYY-MM-DDTHH:MM:SSZ"
 * @param endOfDay  true → 23:59:59Z (fuer "bis"-Grenzen), false → 00:00:00Z (fuer "von"-Grenzen)
 */
function toIsoDatetime(d: string, endOfDay = false): string {
  return d.includes("T") ? d : `${d}T${endOfDay ? "23:59:59" : "00:00:00"}Z`;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  // Mock-Modus: GET-Requests werden vom Mock-Loader bedient
  if (isMockMode() && (opts.method ?? "GET") === "GET") {
    const mocked = mockGet<T>(path);
    if (mocked !== undefined) return mocked;
    // Fall through wenn keine Mock-Daten — Aufrufer kriegt 404-aehnliches Error
  }

  // Mock-Modus: POST/PUT/DELETE werden als No-Op-Success behandelt, damit
  // optimistische Updates in der UI nicht durch Netzwerk-Errors zurueckgerollt
  // werden. (Subagent C / Cluster-Sprint: noetig fuer Hub-Default-Switch.)
  if (isMockMode() && (opts.method ?? "GET") !== "GET") {
    // Default-Hub-Switch: State so updaten, dass nachfolgende GET ihn reflektieren.
    const m = path.match(/^\/cluster\/hubs\/([^/]+)\/default$/);
    if (m) {
      setMockDefaultHub(decodeURIComponent(m[1]));
    }
    // Hub-Test-Proxy: simuliere "ok"-Antwort im Mock-Modus.
    if (path === "/cluster/hubs/test") {
      return { ok: true, latency_ms: 4, status_code: 200, error: null } as unknown as T;
    }
    return { ok: true } as unknown as T;
  }

  const init: RequestInit = {
    method: opts.method ?? "GET",
    headers: {
      Accept: "application/json",
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
      ...(opts.headers ?? {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
    credentials: "same-origin",
  };

  let res: Response;
  try {
    res = await fetch(API_BASE + path, init);
  } catch (e) {
    throw new ApiError(0, path, `Netzwerk-Fehler: ${(e as Error).message}`);
  }

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const data = await res.json();
      // FastAPI verschachtelt `detail` oft als Object (z.B. {status, detail, message}).
      // Wir entpacken stufenweise, sonst landet "[object Object]" in der Error-Message.
      const d = data?.detail;
      if (typeof d === "string") {
        detail = d;
      } else if (d && typeof d === "object") {
        detail = (d.detail as string) || (d.message as string) || JSON.stringify(d);
      } else if (typeof data?.message === "string") {
        detail = data.message;
      } else {
        detail = JSON.stringify(data);
      }
    } catch {
      try {
        detail = await res.text();
      } catch {
        // ignore
      }
    }
    throw new ApiError(res.status, path, detail || `HTTP ${res.status}`);
  }

  if (res.status === 204) return undefined as unknown as T;
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    return (await res.json()) as T;
  }
  return (await res.text()) as unknown as T;
}

// --- High-level API ---

export const api = {
  // Health
  getHealth: () => request<HealthInfo>("/health"),

  // Cluster
  getHubs: () => request<{ hubs: HubStatus[] }>("/cluster/hubs"),
  getHub: (id: string) => request<HubStatus>(`/cluster/hubs/${encodeURIComponent(id)}`),
  setDefaultHub: (id: string) =>
    request<{ ok: boolean }>(`/cluster/hubs/${encodeURIComponent(id)}/default`, {
      method: "POST",
    }),

  getNodes: () => request<{ nodes: ClusterNode[] }>("/cluster/nodes"),
  getNode: (nodeId: string) =>
    request<ClusterNode>(`/cluster/nodes/${encodeURIComponent(nodeId)}`),

  getEngineMatrix: () => request<{ matrix: EngineMatrix }>("/cluster/engines"),
  getEdgeLog: () => request<{ events: EdgeLogEvent[] }>("/cluster/edge-log"),

  // Jobs
  uploadFiles: async (files: File[]): Promise<{ job_ids: string[] }> => {
    if (isMockMode()) {
      // Mock-Pseudo-Antwort
      return {
        job_ids: files.map((_, i) => `ocr-mock-${Date.now()}-${i}`),
      };
    }
    const fd = new FormData();
    for (const f of files) fd.append("files", f, f.name);
    const res = await fetch(API_BASE + "/jobs/upload", {
      method: "POST",
      body: fd,
      credentials: "same-origin",
    });
    if (!res.ok) {
      throw new ApiError(res.status, "/jobs/upload", res.statusText);
    }
    return (await res.json()) as { job_ids: string[] };
  },
  listJobs: (params?: Record<string, string | number>) => {
    const q = params
      ? "?" +
        Object.entries(params)
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
          .join("&")
      : "";
    return request<{ jobs: JobStatus[]; total: number; filtered: number }>(`/jobs${q}`);
  },
  getJob: (id: string) => request<JobDetail>(`/jobs/${encodeURIComponent(id)}`),
  retryJob: (id: string) =>
    request<{ ok: boolean }>(`/jobs/${encodeURIComponent(id)}/retry`, { method: "POST" }),
  /**
   * Word-Level-Text mit Confidence + Bounding-Boxes.
   * Backend-Phase-1 liefert Plain-Text — wir versuchen JSON, fallen sonst
   * auf einen Pseudo-Text-Document mit einer Seite zurueck.
   */
  getJobText: async (id: string): Promise<RecognizedTextDocument> => {
    const path = `/jobs/${encodeURIComponent(id)}/text`;
    if (isMockMode()) {
      const mocked = mockGet<RecognizedTextDocument>(path);
      if (mocked) return mocked;
    }
    const res = await fetch(API_BASE + path, {
      method: "GET",
      headers: { Accept: "application/json, text/plain;q=0.5" },
      credentials: "same-origin",
    });
    if (!res.ok) throw new ApiError(res.status, path, res.statusText);
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      return (await res.json()) as RecognizedTextDocument;
    }
    // Plain-Text-Fallback: eine Pseudo-Seite ohne Confidence-Info
    const text = await res.text();
    const words: { text: string; confidence: number }[] = text
      .split(/\s+/u)
      .filter(Boolean)
      .map((w) => ({ text: w, confidence: 1 }));
    return {
      job_id: id,
      pages: [{ page: 1, words }],
      is_native: true,
    };
  },
  /** URL fuer pdf.js (kein JSON-Wrapper noetig). */
  getJobPdfUrl: (id: string): string =>
    `${API_BASE}/jobs/${encodeURIComponent(id)}/pdf`,
  getJobOutputUrl: (id: string): string =>
    `${API_BASE}/jobs/${encodeURIComponent(id)}/output`,
  getAbCompare: (id: string) =>
    request<AbCompareResult>(`/jobs/${encodeURIComponent(id)}/ab-compare`),

  // Charts
  getThroughput: (range: string = "24h") =>
    request<{ datapoints: ThroughputPoint[] }>(`/charts/throughput?range=${range}`),
  getEnginePerformance: () =>
    request<{ engines: EnginePerformance[] }>(`/charts/engine-performance`),
  getDoctypeDistribution: () => request<DoctypeDistribution>(`/charts/doctype-distribution`),
  getRoundRobin: () =>
    request<{ datapoints: RoundRobinPoint[] }>(`/charts/round-robin`),
  getFailureRate: () => request<FailureRate>(`/charts/failure-rate`),

  // Settings
  getSettings: () => request<Settings>("/settings"),
  updateSettings: (patch: Partial<Settings>) =>
    request<Settings>("/settings", { method: "POST", body: patch }),
  // Backend erwartet die rohe Liste, nicht {hubs: ...} (siehe ocrexpert/gui/api.py)
  updateHubs: (hubs: Settings["hubs"]) =>
    request<Settings>("/settings/hubs", { method: "POST", body: hubs }),

  // Server-side-Hub-Reachability-Probe — umgeht Browser-CORS.
  testHub: (req: { url: string; token?: string }) =>
    request<HubTestResult>("/cluster/hubs/test", { method: "POST", body: req }),

  // Schwarm-Cluster-Status (Modul H3) — proxy zum aktuellen Hub.
  // Bei nicht-erreichbarem Hub liefert das Backend Stub-Daten (kein Fehler).
  getSwarmStatus: () => request<ClusterStatus>("/cluster/status"),
  getSwarmPeers: () => request<{ peers: ClusterPeer[] }>("/cluster/peers"),
  triggerElection: (reason?: string) =>
    request<ElectionTriggerResponse>("/cluster/election/trigger", {
      method: "POST",
      body: { reason: reason ?? null },
    }),

  // Oberon Cockpit-API — alle 5 Endpoints unter /api/cockpit/*.
  // Routen gehen an das OCRexpert-Backend, das sie als Proxy an Oberon weiterleitet.
  // Mock-Modus: mockGet bedient diese wie alle anderen GET-Requests (Schluessel in payloads.json).

  /** GET /api/cockpit/providers — Liste aller konfigurierten LLM-Provider mit Health + Latenz. */
  getCockpitProviders: async (): Promise<ProvidersResponse> => {
    // Oberon liefert ein JSON-Array, kein Wrapper-Objekt.
    // Das Backend-Proxy normalisiert das zu { providers: [...] }.
    const raw = await request<ProvidersResponse | CockpitProvider[]>("/cockpit/providers");
    if (Array.isArray(raw)) {
      return { providers: raw };
    }
    return raw as ProvidersResponse;
  },

  /** GET /api/cockpit/calls — Cursor-paginierter Recent-Calls-Stream.
   *  `since` wird ggf. von Date-Only (YYYY-MM-DD) zu ISO-Datetime normalisiert. */
  getCockpitCalls: (opts?: { since?: string; limit?: number }): Promise<CallsResponse> => {
    const params = new URLSearchParams();
    if (opts?.since) params.set("since", toIsoDatetime(opts.since));
    if (opts?.limit != null) params.set("limit", String(opts.limit));
    const q = params.toString() ? `?${params}` : "";
    return request<CallsResponse>(`/cockpit/calls${q}`);
  },

  /** GET /api/cockpit/cost — Aggregierte Kostendaten im Zeitraum.
   *  Akzeptiert sowohl Date-Only (`2026-05-16` aus <input type="date">) als
   *  auch ISO-Datetime. Oberon verlangt Datetime, also normalisieren wir hier. */
  getCockpitCost: (opts: { from: string; to: string; groupBy: string }): Promise<CostResponse> => {
    const params = new URLSearchParams({
      from: toIsoDatetime(opts.from),
      to: toIsoDatetime(opts.to, true),
      group_by: opts.groupBy,
    });
    return request<CostResponse>(`/cockpit/cost?${params}`);
  },

  /** GET /api/cockpit/audit — DSGVO-Audit-Event-Stream (Cursor-Pagination).
   *  `since` wird ggf. von Date-Only (YYYY-MM-DD) zu ISO-Datetime normalisiert. */
  getCockpitAudit: (opts?: { since?: string; limit?: number }): Promise<AuditResponse> => {
    const params = new URLSearchParams();
    if (opts?.since) params.set("since", toIsoDatetime(opts.since));
    if (opts?.limit != null) params.set("limit", String(opts.limit));
    const q = params.toString() ? `?${params}` : "";
    return request<AuditResponse>(`/cockpit/audit${q}`);
  },

  /** GET /api/cockpit/smoke — Live-Health-Snapshot (6 Sub-Checks parallel, max 3s Timeout). */
  getCockpitSmoke: (): Promise<SmokeResponse> =>
    request<SmokeResponse>("/cockpit/smoke"),

  // ─── MOAG-spezifische Endpoints ──────────────────────────────────────────

  /** GET /api/v1/overview — Status aller 8 Sub-Systeme (Cockpit-Startseite). */
  getOverview: (): Promise<OverviewResponse> =>
    request<OverviewResponse>("/v1/overview"),
};

export type Api = typeof api;
