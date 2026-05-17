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
  ActionsResponse,
  ActionTriggerResponse,
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

  // ─── Aktionen-API ────────────────────────────────────────────────────────────

  /** GET /api/v1/actions — Komplette Aktions-Registry (alle Sub-Systeme). */
  getActions: (): Promise<ActionsResponse> =>
    request<ActionsResponse>("/v1/actions"),

  /** POST /api/v1/actions/{action_id}/trigger — Aktion ausfuehren.
   *  Body optional: adapter-spezifische Parameter (z.B. {node_id: "..."}). */
  triggerAction: (
    action_id: string,
    body?: Record<string, unknown>,
  ): Promise<ActionTriggerResponse> =>
    request<ActionTriggerResponse>(
      `/v1/actions/${encodeURIComponent(action_id)}/trigger`,
      { method: "POST", body: body ?? {} },
    ),

  // ─── Oberon Drilldown-API (neue /api/v1/oberon/* Routen) ────────────────────
  // Separate Routen von /api/cockpit/* (Admin-Cockpit) — gleiche Daten, neuer Pfad.

  oberon: {
    /** GET /api/v1/oberon/providers — Provider-Liste mit Health + Latenz. */
    getProviders: (): Promise<ProvidersResponse> =>
      request<ProvidersResponse>("/v1/oberon/providers"),

    /** GET /api/v1/oberon/calls — Cursor-paginierter Recent-Calls-Stream. */
    getCalls: (opts?: { since?: string; limit?: number; clientId?: string }): Promise<CallsResponse> => {
      const params = new URLSearchParams();
      if (opts?.since) params.set("since", toIsoDatetime(opts.since));
      if (opts?.limit != null) params.set("limit", String(opts.limit));
      if (opts?.clientId) params.set("client_id", opts.clientId);
      const q = params.toString() ? `?${params}` : "";
      return request<CallsResponse>(`/v1/oberon/calls${q}`);
    },

    /** GET /api/v1/oberon/cost — Aggregierte Kostendaten. */
    getCost: (opts: { from: string; to: string; groupBy: string }): Promise<CostResponse> => {
      const params = new URLSearchParams({
        from: toIsoDatetime(opts.from),
        to: toIsoDatetime(opts.to, true),
        group_by: opts.groupBy,
      });
      return request<CostResponse>(`/v1/oberon/cost?${params}`);
    },

    /** GET /api/v1/oberon/audit — DSGVO-Audit-Event-Stream. */
    getAudit: (opts?: { since?: string; limit?: number; piiType?: string; clientId?: string }): Promise<AuditResponse> => {
      const params = new URLSearchParams();
      if (opts?.since) params.set("since", toIsoDatetime(opts.since));
      if (opts?.limit != null) params.set("limit", String(opts.limit));
      if (opts?.piiType) params.set("pii_type", opts.piiType);
      if (opts?.clientId) params.set("client_id", opts.clientId);
      const q = params.toString() ? `?${params}` : "";
      return request<AuditResponse>(`/v1/oberon/audit${q}`);
    },

    /** GET /api/v1/oberon/smoke — Live-Health-Snapshot. */
    getSmoke: (): Promise<SmokeResponse> =>
      request<SmokeResponse>("/v1/oberon/smoke"),

    /** GET /api/v1/oberon/instances — Aktive Oberon-Instanzen. */
    getInstances: (): Promise<unknown> =>
      request<unknown>("/v1/oberon/instances"),

    /** GET /api/v1/oberon/pii-tuning — PII-Tuning-Konfiguration. */
    getPiiTuning: (): Promise<unknown> =>
      request<unknown>("/v1/oberon/pii-tuning"),

    /** GET /api/v1/oberon/db-broker/status — DB-Broker-Status. */
    getDbBrokerStatus: (): Promise<unknown> =>
      request<unknown>("/v1/oberon/db-broker/status"),

    /** GET /api/v1/oberon/contract/capabilities — API-Kontrakt. */
    getContractCapabilities: (): Promise<unknown> =>
      request<unknown>("/v1/oberon/contract/capabilities"),

    /** GET /api/v1/oberon/platform/status — Plattform-Status. */
    getPlatformStatus: (): Promise<unknown> =>
      request<unknown>("/v1/oberon/platform/status"),
  },

  // ─── OctoBoss Drilldown-API (neue /api/v1/octoboss/* Routen) ─────────────────

  octoboss: {
    /** GET /api/v1/octoboss/nodes — Node-Liste mit Hardware/Ollama/Mode/Modules. */
    getNodes: (): Promise<unknown> =>
      request<unknown>("/v1/octoboss/nodes"),

    /** GET /api/v1/octoboss/nodes/{node_id} — Node-Detail. */
    getNode: (nodeId: string): Promise<unknown> =>
      request<unknown>(`/v1/octoboss/nodes/${encodeURIComponent(nodeId)}`),

    /** GET /api/v1/octoboss/overview — Capability-Summary. */
    getOverview: (): Promise<unknown> =>
      request<unknown>("/v1/octoboss/overview"),

    /** GET /api/v1/octoboss/jobs — Scheduler-Queue.
     *  Optionale Filter: state (pending|running|done|failed), limit. */
    getJobs: (opts?: { state?: string; limit?: number }): Promise<unknown> => {
      const params = new URLSearchParams();
      if (opts?.state) params.set("state", opts.state);
      if (opts?.limit != null) params.set("limit", String(opts.limit));
      const q = params.toString() ? `?${params}` : "";
      return request<unknown>(`/v1/octoboss/jobs${q}`);
    },

    /** GET /api/v1/octoboss/assets — Asset-Inventar.
     *  Optionale Filter: type (model|script|...), name (Teilname). */
    getAssets: (opts?: { type?: string; name?: string }): Promise<unknown> => {
      const params = new URLSearchParams();
      if (opts?.type) params.set("type", opts.type);
      if (opts?.name) params.set("name", opts.name);
      const q = params.toString() ? `?${params}` : "";
      return request<unknown>(`/v1/octoboss/assets${q}`);
    },

    /** GET /api/v1/octoboss/cluster/status — Cluster-Modus/Primary/Replica. */
    getClusterStatus: (): Promise<unknown> =>
      request<unknown>("/v1/octoboss/cluster/status"),

    /** GET /api/v1/octoboss/cluster/peers — Mesh-Peers. */
    getClusterPeers: (): Promise<unknown> =>
      request<unknown>("/v1/octoboss/cluster/peers"),

    /** GET /api/v1/octoboss/ocr/status — OCR-Gateway-Status. */
    getOcrStatus: (): Promise<unknown> =>
      request<unknown>("/v1/octoboss/ocr/status"),

    /** GET /api/v1/octoboss/llm/models — OpenAI-kompatible Model-Liste. */
    getLlmModels: (): Promise<unknown> =>
      request<unknown>("/v1/octoboss/llm/models"),
  },

  // ─── Custos (/api/v1/custos/*) ─────────────────────────────────────────────

  custos: {
    /** GET /api/v1/custos/health — Liveness-Check. */
    getHealth: (): Promise<import("./types").CustosHealth> =>
      request<import("./types").CustosHealth>("/v1/custos/health"),

    /** GET /api/v1/custos/findings — Compliance-Findings (gefiltert). */
    getFindings: (opts?: {
      severity?: string;
      status?: string;
      limit?: number;
      offset?: number;
    }): Promise<import("./types").CustosFindings> => {
      const params = new URLSearchParams();
      if (opts?.severity) params.set("severity", opts.severity);
      if (opts?.status) params.set("status", opts.status);
      if (opts?.limit !== undefined) params.set("limit", String(opts.limit));
      if (opts?.offset !== undefined) params.set("offset", String(opts.offset));
      const qs = params.toString();
      return request<import("./types").CustosFindings>(`/v1/custos/findings${qs ? `?${qs}` : ""}`);
    },

    /** GET /api/v1/custos/rules — Liste aller Compliance-Regeln. */
    getRules: (): Promise<import("./types").CustosRegel[]> =>
      request<import("./types").CustosRegel[]>("/v1/custos/rules"),

    /** GET /api/v1/custos/rules/{id}/last-run — Regel-Detail inkl. letzter_lauf. */
    getRuleLastRun: (ruleId: string): Promise<import("./types").CustosRegel> =>
      request<import("./types").CustosRegel>(
        `/v1/custos/rules/${encodeURIComponent(ruleId)}/last-run`,
      ),

    /** GET /api/v1/custos/audit — Engine-Status aller Regeln. */
    getAudit: (opts?: { limit?: number }): Promise<import("./types").CustosEngineStatus> => {
      const params = new URLSearchParams();
      if (opts?.limit !== undefined) params.set("limit", String(opts.limit));
      const qs = params.toString();
      return request<import("./types").CustosEngineStatus>(
        `/v1/custos/audit${qs ? `?${qs}` : ""}`,
      );
    },
  },

  // ─── NasDominator-Drilldown-API (/api/v1/nasdominator/*) ─────────────────────

  nasdominator: {
    /** GET /api/v1/nasdominator/health — NasDominator SystemStatus */
    getHealth: () =>
      request<import("./types").SystemStatus>("/v1/nasdominator/health"),

    /** GET /api/v1/nasdominator/services — Critical-Services-Liste */
    getServices: () =>
      request<import("./types").NasDomServicesResponse>("/v1/nasdominator/services"),

    /** GET /api/v1/nasdominator/metrics — CPU/RAM/Storage-Snapshot */
    getMetrics: () =>
      request<import("./types").NasDomMetricsResponse>("/v1/nasdominator/metrics"),

    /** GET /api/v1/nasdominator/containers — Container-Liste */
    getContainers: () =>
      request<import("./types").NasDomContainersResponse>("/v1/nasdominator/containers"),
  },

  // ─── OCRexpert-Drilldown-API (/api/v1/ocrexpert/*) ───────────────────────────

  ocrexpert: {
    /** GET /api/v1/ocrexpert/capabilities — Capability-Snapshot.
     *  Wrappt GET {OCREXPERT_BASE_URL}/api/v1/health. */
    getCapabilities: (): Promise<import("./types").OcrexpertCapabilities> =>
      request<import("./types").OcrexpertCapabilities>("/v1/ocrexpert/capabilities"),

    /** GET /api/v1/ocrexpert/logs — Plain-Text Tail der Pipeline-Logs.
     *  `n` = Anzahl der letzten Zeilen (Default 100, max 1000). */
    getLogs: (n = 100): Promise<import("./types").OcrexpertLogTail> =>
      request<import("./types").OcrexpertLogTail>(`/v1/ocrexpert/logs?n=${n}`),

    /** GET /api/v1/ocrexpert/openapi-summary — Reduzierte Endpoint-Liste. */
    getOpenApiSummary: (): Promise<import("./types").OcrexpertOpenApiSummary> =>
      request<import("./types").OcrexpertOpenApiSummary>("/v1/ocrexpert/openapi-summary"),
  },
};

export type Api = typeof api;
