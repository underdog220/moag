// TypeScript-Mirror der moag/backend/models.py Pydantic-Schemas.
// Quelle: ARCHITEKTUR.md §5 + src/mocks/payloads.json
// Bei Backend-Aenderung hier nachziehen.

// ─── MOAG-spezifische Typen ──────────────────────────────────────────────────

export type SystemGroup = "KI-Backbone" | "Infrastruktur" | "Compliance & Test";

/** Status eines einzelnen Sub-Systems (ADR-008 Konvention). */
export interface SystemStatus {
  id: string;
  name: string;
  group: SystemGroup;
  ok: boolean;
  score: number; // 0..100
  summary: string;
  metrics: Record<string, number | string | boolean | null>;
  fetched_at: string; // ISO-8601
  error: string | null;
}

/** Antwort des /api/v1/overview Endpoints. */
export interface OverviewResponse {
  systems: SystemStatus[];
}

// ─── OCRexpert-abgeleitete Typen (aus OCRexpert-GUI-Prototyp) ─────────────────

export type HubId = "vdr" | "nas" | "test" | "nas-test" | string;

export interface HubStatus {
  id: HubId;
  name: string;
  url: string;
  reachable: boolean;
  latency_ms: number | null;
  nodes_total: number;
  nodes_connected: number;
  engines_count: number;
  is_default: boolean;
  last_check: string; // ISO datetime
}

export interface NodeHardware {
  gpu_name: string | null;
  gpu_load_percent: number | null;
  cpu_load_percent: number | null;
  ram_free_gb: number | null;
  vram_free_gb: number | null;
  cpu_model: string | null;
}

export interface ModuleInfo {
  name: string;
  version: string;
}

export interface ClusterNode {
  node_id: string;
  hostname: string;
  connected: boolean;
  last_heartbeat: string;
  hardware: NodeHardware;
  engines: string[];
  modules: ModuleInfo[];
  last_known_ip: string;
  // Komfort-Felder (manche Backends liefern flach statt nested)
  gpu_load_percent?: number | null;
  cpu_load_percent?: number | null;
  ram_free_gb?: number | null;
}

export type EngineAvailability = "ok" | "missing" | "degraded";

export interface EngineMatrix {
  engines: string[];
  nodes: string[];
  available: EngineAvailability[][]; // [engineIndex][nodeIndex]
}

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

export interface EdgeLogEvent {
  ts: string;
  level: LogLevel;
  source: string;
  message: string;
}

export type JobState = "pending" | "running" | "done" | "failed";

export interface JobStatus {
  job_id: string;
  filename: string;
  status: JobState;
  progress_pct: number;
  page_total: number;
  page_done: number;
  started_at: string;
  finished_at: string | null;
  doctype: string | null;
  doctype_confidence: number | null;
  pii_count: number | null;
  consensus_score: number | null;
  engines_used: string[];
  nodes_used: string[];
  error: string | null;
}

export interface PiiFinding {
  type: string;
  count: number;
  examples: string[];
  /** Optionale Sprung-Markierungen (Seite + Bounding-Box im PDF) */
  hits?: Array<{ page: number; bbox?: [number, number, number, number] }>;
}

export interface RoutingTraceEntry {
  page: number;
  engine: string;
  node: string;
  latency_ms: number;
  confidence: number;
}

export interface DoctypeAlternative {
  label: string;
  score: number;
}

export interface JobDetailExtra {
  doctype_text_score?: number;
  doctype_layout_score?: number;
  doctype_alternatives?: DoctypeAlternative[];
  pii_findings?: PiiFinding[];
  engine_consensus_per_page?: Array<Record<string, number | string>>;
  routing_trace?: RoutingTraceEntry[];
  ab_compare_available?: boolean;
}

export type JobDetail = JobStatus & JobDetailExtra;

// Erkannter Text mit Word-Level-Confidence (Endpoint /api/jobs/{id}/text — JSON-Variante)
export interface RecognizedWord {
  text: string;
  /** Wert 0..1 — niedriger = unsicherer */
  confidence: number;
  /** Bounding-Box in PDF-User-Space, [x0,y0,x1,y1] in Punkten */
  bbox?: [number, number, number, number];
}

export interface RecognizedTextPage {
  page: number;
  /** Original-Seitenmasse in Punkten (fuer Heatmap-Skalierung). */
  width?: number;
  height?: number;
  words: RecognizedWord[];
}

export interface RecognizedTextDocument {
  job_id: string;
  pages: RecognizedTextPage[];
  /** Bei Native-PDFs gibts keine OCR-Confidence — Heatmap blendet aus. */
  is_native?: boolean;
}

// A/B-Vergleich (Phase-2-Stub — verfuegbar nur wenn ab_compare_available=true)
export interface AbCompareResult {
  available: boolean;
  reason?: string;
  local?: {
    text: string;
    latency_ms: number;
    engines: string[];
  };
  cluster?: {
    text: string;
    latency_ms: number;
    engines: string[];
  };
  diff?: Array<{
    type: "equal" | "local-only" | "cluster-only";
    text: string;
  }>;
}

export interface HubConfig {
  id: HubId;
  name: string;
  url: string;
  token?: string | null;
}

export type VotingStrategy = "consensus" | "best" | "majority";

export interface Settings {
  hubs: HubConfig[];
  default_hub_id: HubId;
  cluster_enabled: boolean;
  voting_engines: string[];
  voting_strategy: VotingStrategy;
  fallback_to_local: boolean;
  api_token: string | null;
  pipeline_log_enabled: boolean;
  doctype_text_gewicht: number;
  doctype_layout_gewicht: number;
  active_env?: Record<string, string>;
  settings_path?: string;
}

export interface HubTestResult {
  ok: boolean;
  latency_ms: number | null;
  status_code: number | null;
  error: string | null;
}

// Charts
export interface ThroughputPoint {
  ts: string;
  docs_per_hour: number;
  avg_latency_ms: number;
}

export interface EnginePerformance {
  name: string;
  p50_ms: number;
  p95_ms: number;
  avg_confidence: number;
}

export interface DoctypeDistribution {
  current: { doctype: string; count: number; pct: number }[];
  trend: Array<Record<string, string | number>>;
}

export interface RoundRobinPoint {
  ts: string;
  [host: string]: string | number;
}

export interface FailureRate {
  trend: { ts: string; rate: number }[];
  top_errors: { type: string; count: number; example: string }[];
}

// WebSocket-Events
export type WsEvent =
  | { type: "hub_status_changed"; hub_id: string; status: string; latency_ms: number }
  | {
      type: "node_health_changed";
      node_id: string;
      hostname: string;
      gpu_load_percent?: number;
      cpu_load_percent?: number;
      ram_free_gb?: number;
    }
  | { type: "job_started"; job_id: string; filename: string }
  | {
      type: "job_progress";
      job_id: string;
      page_done: number;
      page_total: number;
      engine: string;
      node: string;
    }
  | {
      type: "job_engine_done";
      job_id: string;
      page: number;
      engine: string;
      latency_ms: number;
      confidence: number;
    }
  | {
      type: "job_done";
      job_id: string;
      doctype: string;
      doctype_confidence: number;
      pii_count: number;
      consensus_score: number;
    }
  | { type: "job_failed"; job_id: string; error: string }
  | { type: "edge_log"; ts: string; level: LogLevel; source: string; message: string }
  | { type: "settings_changed"; default_hub_id?: string }
  | { type: string; [key: string]: any };

export interface HealthInfo {
  status: "ok" | "degraded" | "error";
  version: string;
  build: string;
  build_ts?: string;
}

// ─── Schwarm-Cluster-Status (Modul H3) ───────────────────────────────────
// Spec: docs/OCTOBOSS_SCHWARM_V2_DEEPDIVE_2026_05_08.md Abschnitt 5

export type ClusterMode = "primary" | "replica" | "proxy" | "standalone";

export interface ElectionInfo {
  timestamp: string | null;
  winner_id: string | null;
  reason: string | null;
  cooldown_remaining_s: number;
}

export interface ClusterStatus {
  instance_id: string;
  hostname: string | null;
  mode: ClusterMode | string;
  epoch: number;
  priority: number;
  primary_id: string | null;
  primary_address: string | null;
  node_count: number;
  compute_score: number;
  operator_priority: number;
  uptime_seconds: number;
  version: string | null;
  site_id: string | null;
  last_election: ElectionInfo | null;
  // Hub 0.9.3 — neue Felder (Welle-3-Audit P3/P4):
  election_eligible?: boolean;
  cooldown_remaining_s?: number;
  load_threshold_percent?: number | null;
  mode_aware_routing_enabled?: boolean | null;
  // Roh-Hub-Response fuer Diagnose-Zwecke (Schema-Drift-Pass-Through):
  raw_hub_response?: Record<string, unknown> | null;
}

export interface ClusterPeer {
  instance_id: string;
  hostname: string | null;
  address: string;
  port: number;
  url: string;
  mode: ClusterMode | string;
  epoch: number;
  last_beacon: string | null;
  online: boolean;
  last_known_mode?: string | null;
  last_known_epoch?: number | null;
}

export interface ElectionTriggerResponse {
  accepted: boolean;
  election_id: string | null;
  cooldown_remaining_s: number;
  message: string | null;
  // Hub 0.9.3 Pass-Through-Felder
  winner?: string | null;
  i_am_winner?: boolean | null;
  epoch?: number | null;
  peers_asked?: number | null;
  peers_responded?: number | null;
  reason?: string | null;
  detail?: string | null;
}

// ─── Oberon Cockpit-API (Endpoints unter /api/cockpit/*) ─────────────────────
// Mirror der ocrexpert/oberon/cockpit_schemas.py Pydantic-Schemas.
// Felder snake_case (JSON ist snake_case). Alle Top-Level-Models haben
// [key: string]: unknown fuer extra="allow"-Kompatibilitaet mit Oberon.

// Helper: Status-Typ fuer Oberon-Provider-Health.
export type ProviderHealth = "healthy" | "degraded" | "down";

// Helper: Status-Typ fuer Smoke-Sub-Checks.
export type SmokeStatus = "PASS" | "WARN" | "FAIL";

// GET /api/cockpit/providers
export interface CockpitProviderProfiles {
  STANDARD?: string | null;
  MINI?: string | null;
  HEAVY?: string | null;
  VISION?: string | null;
  [key: string]: unknown;
}

export interface CockpitProvider {
  id: string;
  name: string;
  type: string;
  status: ProviderHealth | string;
  base_url: string | null;
  api_key_hint: string | null;
  latency_p50_ms: number | null;
  latency_p95_ms: number | null;
  cost_per_1m_tokens_usd: number | null;
  last_check: string | null; // ISO-8601
  is_default: boolean;
  profiles: CockpitProviderProfiles | null;
  [key: string]: unknown;
}

export interface ProvidersResponse {
  // Oberon liefert JSON-Array — wir wrappen es fuer typsichere Verarbeitung.
  providers: CockpitProvider[];
  [key: string]: unknown;
}

// GET /api/cockpit/calls
export interface CockpitCall {
  id: number | string;
  ts: string; // ISO-8601 UTC
  client_id: string | null;
  profile: string | null;
  model: string | null;
  provider: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  duration_ms: number | null;
  pii_found: boolean | null;
  pii_anonymized: boolean | null;
  status: string | null;
  error: string | null;
  [key: string]: unknown;
}

export interface CallsResponse {
  calls: CockpitCall[];
  next_since: string | null; // ISO-8601 Cursor fuer Pagination
  limit: number;
  returned: number;
  [key: string]: unknown;
}

// GroupBy-Dimension fuer Kostenauswertung (/api/cockpit/cost)
export type CostGroupBy = "client" | "model" | "day" | "provider";

// GET /api/cockpit/cost
// total_cost_usd kann je nach Pydantic-Serialisierung als number ODER
// String kommen (Decimal-Felder werden in 2026-05 als String serialisiert,
// damit Praezision erhalten bleibt). Konsumenten muessen Number(...) anwenden.
export interface CockpitCostBucket {
  key: string;
  calls: number;
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_cost_usd: number | string;
  [key: string]: unknown;
}

export interface CockpitCostTotal {
  calls: number;
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_cost_usd: number | string;
  [key: string]: unknown;
}

export interface CostResponse {
  from: string; // ISO-8601 UTC
  to: string; // ISO-8601 UTC
  group_by: string;
  groups: CockpitCostBucket[];
  total: CockpitCostTotal;
  [key: string]: unknown;
}

// GET /api/cockpit/audit
export interface CockpitAuditFilters {
  pii_type: string | null;
  client_id: string | null;
  [key: string]: unknown;
}

export interface CockpitAuditEvent {
  ts: string; // ISO-8601 UTC
  audit_id: string;
  client_id: string | null;
  event_type: string;
  pii_types: string[];
  anonymized: boolean;
  routing_decision: string | null;
  duration_ms: number;
  domain: string | null;
  [key: string]: unknown;
}

export interface AuditResponse {
  events: CockpitAuditEvent[];
  next_since: string | null; // ISO-8601 Cursor
  limit: number;
  returned: number;
  filters: CockpitAuditFilters;
  [key: string]: unknown;
}

// GET /api/cockpit/smoke
export interface CockpitSmokeCheck {
  name: string;
  status: SmokeStatus | string;
  last_run: string; // ISO-8601 UTC
  latency_ms: number;
  error: string | null;
  [key: string]: unknown;
}

export interface CockpitSmokeSummary {
  pass: number;
  warn: number;
  fail: number;
  total: number;
  verdict: SmokeStatus | string;
  [key: string]: unknown;
}

export interface SmokeResponse {
  suites: CockpitSmokeCheck[];
  summary: CockpitSmokeSummary;
  [key: string]: unknown;
}
