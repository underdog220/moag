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

// ─── Alert-Center (/api/v1/alerts) ───────────────────────────────────────────

export type AlertSeverity = "critical" | "warning";

/** Ein einzelner aktiver Alert (abgeleitet aus SystemStatus). */
export interface Alert {
  key: string;
  system_id: string;
  system_name: string;
  group: SystemGroup;
  severity: AlertSeverity;
  summary: string;
  error: string | null;
  score: number;
  fetched_at: string; // ISO-8601
  acknowledged: boolean;
  acknowledged_at: string | null;
}

/** Antwort des /api/v1/alerts Endpoints. */
export interface AlertsResponse {
  alerts: Alert[];
  critical_count: number;
  warning_count: number;
  acknowledged_count: number;
  unacknowledged_count: number;
  computed_at: string;
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
  // Temperaturen (optional) + GPU-Health (hw-monitor >= 1.2)
  gpu_temp_c?: number | null;
  cpu_temp_c?: number | null;
  gpu_present?: boolean | null;
  gpu_runtime_ready?: boolean | null;
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

// ─── MOAG Aktionen-API (Endpoints unter /api/v1/actions) ─────────────────────
// Mirror der docs/ACTIONS_SCHEMA.md Pydantic-Schemas.
// Verbindlich — keine eigenen Felder erfinden, nur Schema-konforme Typen.

export interface Action {
  action_id: string;
  system_id:
    | "oberon"
    | "octoboss"
    | "ocrexpert"
    | "nasdominator"
    | "qnapbackup"
    | "custos"
    | "panopticor";
  name: string;
  description: string;
  category: "diagnose" | "config" | "operation";
  sub_area: string | null;
  requires_confirm: boolean;
  is_destructive: boolean;
  estimated_duration_s: number | null;
  implemented: boolean;
}

export interface ActionsResponse {
  actions: Action[];
  fetched_at: string;
}

export interface ActionTriggerResponse {
  action_id: string;
  triggered_at: string;
  status: "started" | "completed" | "failed" | "not_implemented";
  result_summary: string | null;
  payload: Record<string, unknown>;
  duration_ms: number | null;
  error: string | null;
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

// ─── Oberon Plattform-API-Typen (neue /api/v1/oberon/* Endpoints) ────────────

/** Eine aktive Oberon-Instanz (DevLoop/Chat-Session). */
export interface OberonInstance {
  id: string;
  mode: string;           // z.B. "devloop", "chat"
  context_size: number;
  created_at: string | null; // ISO-8601
  client_id: string | null;
  [key: string]: unknown;
}

/** Eintrag in der PII-Tuning-Konfiguration. */
export interface OberonPiiTuningEntry {
  entity_type: string;   // z.B. "IBAN", "EMAIL"
  enabled: boolean;
  threshold: number | null;
  description: string | null;
  [key: string]: unknown;
}

/** Status einer via Oberon-Broker provisionierten Datenbank. */
export interface OberonDbBrokerStatus {
  databases: Array<{
    app_name: string;
    db_name: string;
    status: string;      // "ok" | "error" | "provisioning"
    host: string | null;
    error: string | null;
    [key: string]: unknown;
  }>;
  total: number;
  [key: string]: unknown;
}

/** Eine API-Fähigkeit aus dem Oberon-Kontrakt. */
export interface OberonContractCapability {
  name: string;
  version: string | null;
  path: string;
  method: string;        // "GET" | "POST" | ...
  requires_auth: boolean;
  description: string | null;
  [key: string]: unknown;
}

// ─── OctoBoss Drilldown-Typen (neue /api/v1/octoboss/* Endpoints) ────────────

/** Detaillierter Node-Status vom OctoBoss-Hub (/seti/nodes/{node_id}). */
export interface OctoBossNodeDetail {
  node_id: string;
  hostname: string;
  connected: boolean;
  mode: string | null;          // "IDLE" | "ACTIVE" | "OFFLINE" | ...
  last_heartbeat: string | null; // ISO-8601
  last_known_ip: string | null;
  hardware: {
    gpu_name: string | null;
    gpu_load_percent: number | null;
    cpu_load_percent: number | null;
    cpu_model: string | null;
    ram_free_gb: number | null;
    vram_free_gb: number | null;
    gpu_temp_c?: number | null;
    cpu_temp_c?: number | null;
    gpu_present?: boolean | null;
    gpu_runtime_ready?: boolean | null;
    [key: string]: unknown;
  } | null;
  ollama: {
    running: boolean;
    models: string[];
    version: string | null;
    [key: string]: unknown;
  } | null;
  modules: Array<{ name: string; version: string }>;
  engines: string[];
  [key: string]: unknown;
}

/** Job aus dem OctoBoss-Scheduler (/jobs). */
export interface OctoBossJob {
  id: string;
  job_id?: string;    // manche Hubs nutzen "job_id" statt "id"
  state: string;      // "pending" | "running" | "done" | "failed"
  workload_type: string | null;
  target_node_id: string | null;
  created_at: string | null;  // ISO-8601
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
  [key: string]: unknown;
}

/** Asset aus dem OctoBoss-Inventar (/api/v1/assets). */
export interface OctoBossAsset {
  name: string;
  type: string;       // "model" | "script" | ...
  size_bytes: number | null;
  node_id: string | null;
  path: string | null;
  created_at: string | null;
  [key: string]: unknown;
}

/** Cluster-Status-Alias fuer OctoBoss-Drilldown (basiert auf ClusterStatus). */
export type OctoBossClusterStatus = ClusterStatus;

/** Peer-Eintrag aus /api/v1/mesh/peers. */
export interface OctoBossPeer {
  id: string;
  instance_id?: string;
  hostname: string | null;
  address: string;
  port: number;
  url: string;
  mode: string;
  online: boolean;
  last_seen: string | null;
  [key: string]: unknown;
}

/** Ollama-Modell-Eintrag aus /v1/models (OpenAI-kompatibel). */
export interface OctoBossLlmModel {
  id: string;          // z.B. "llama3.2:3b"
  object: string;      // "model"
  created: number | null; // Unix-Timestamp
  owned_by: string | null;
  [key: string]: unknown;
}

// ─── Custos-API-Typen (/api/v1/custos/*) ─────────────────────────────────────
// Mirror der Custos-Pydantic-Schemas (custos/schemas/finding.py + regel.py).

export type CustosSchwere = "INFO" | "WARN" | "CRIT";
export type CustosStatus = "OFFEN" | "IN_ARBEIT" | "GELOEST" | "IRRELEVANT";
export type CustosUserFeedback = "RELEVANT" | "FEHLALARM" | "IRRELEVANT";
export type CustosKategorie =
  | "DOKUMENTATION"
  | "FINANZIELL"
  | "ZEITLICH"
  | "KONSISTENZ"
  | "CHANCE";

/** GET /api/v1/custos/findings — ein einzelnes Compliance-Finding. */
export interface CustosFinding {
  id: string;
  entdeckt_am: string;          // ISO-8601
  regel_id: string;
  quelle_app: string;
  schwere: CustosSchwere;
  entitaet_typ: string;
  entitaet_id: string | null;
  titel: string;
  beschreibung: string;
  ki_kontext: Record<string, unknown> | null;
  prioritaet_score: string | number;
  status: CustosStatus;
  user_feedback: CustosUserFeedback | null;
  zugewiesen_an: string | null;
  geloest_am: string | null;
  erstellt_am: string;
  geaendert_am: string;
}

/** GET /api/v1/custos/findings — Antwort (Liste). */
export type CustosFindings = CustosFinding[];

/** GET /api/v1/custos/rules — eine Compliance-Regel. */
export interface CustosRegel {
  id: string;
  quelle_app: string;
  titel: string;
  beschreibung: string;
  kategorie: CustosKategorie;
  schwere_default: CustosSchwere;
  sql_query: string;
  aktiv: boolean;
  laufintervall_minuten: number;
  letzter_lauf: string | null;
  erstellt_am: string;
}

/** GET /api/v1/custos/audit — ein Eintrag im Engine-Status (pro Regel). */
export interface CustosAuditEintrag {
  regel_id: string;
  aktiv: boolean;
  laufintervall_minuten: number;
  letzter_lauf: string | null;
}

/** GET /api/v1/custos/audit — Antwort des Engine-Status-Endpoints. */
export interface CustosEngineStatus {
  regeln: CustosAuditEintrag[];
  count_aktiv: number;
  count_gesamt: number;
}

/** GET /api/v1/custos/health — Liveness-Check. */
export interface CustosHealth {
  status: string;
  service: string;
  version: string;
}

// ─── NasDominator-Typen (Endpoints unter /api/v1/nasdominator/*) ──────────────

/** Antwort von GET /api/v1/nasdominator/services */
export interface NasDomService {
  name: string;
  status: string;
  /** z.B. "up" | "down" | "running" | "ok" | "healthy" */
  [key: string]: unknown;
}

export interface NasDomServicesResponse {
  services: NasDomService[];
  auth_required: boolean;
  error?: string | null;
  fetched_at: string;
}

/** Antwort von GET /api/v1/nasdominator/metrics */
export interface NasDomMetrics {
  cpu_percent?: number | null;
  ram_percent?: number | null;
  storage_percent?: number | null;
  cpu_usage?: number | null;
  ram_usage?: number | null;
  [key: string]: unknown;
}

export interface NasDomMetricsResponse {
  metrics: NasDomMetrics;
  auth_required: boolean;
  error?: string | null;
  fetched_at: string;
}

/** Antwort von GET /api/v1/nasdominator/containers */
export interface NasDomContainer {
  name: string;
  status: string;
  image?: string | null;
  [key: string]: unknown;
}

export interface NasDomContainersResponse {
  containers: NasDomContainer[];
  auth_required: boolean;
  error?: string | null;
  fetched_at: string;
}

// ─── OCRexpert-spezifische Typen (Namespace ocrexpert) ───────────────────────
// Quelle: backend/moag/routes_ocrexpert.py (GET /api/v1/ocrexpert/*)

/** GET /api/v1/ocrexpert/capabilities — Capability-Snapshot. */
export interface OcrexpertCapabilities {
  status: string;
  version: string;
  engines_local: string[];
  engines_octoboss: string[];
  octoboss_reachable: boolean;
  libreoffice_available: boolean;
  shadow_writable: boolean;
  /** Vollstaendige URL die abgefragt wurde. */
  source_url: string;
}

/** GET /api/v1/ocrexpert/logs — Plain-Text Tail der Pipeline-Logs (n Zeilen). */
export type OcrexpertLogTail = string;

/** Einzelner Endpoint-Eintrag in der OpenAPI-Summary. */
export interface OcrexpertOpenApiEndpoint {
  path: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  summary: string;
  tags: string[];
}

/** GET /api/v1/ocrexpert/openapi-summary — Reduzierte Endpoint-Liste. */
export interface OcrexpertOpenApiSummary {
  title: string;
  version: string;
  endpoints: OcrexpertOpenApiEndpoint[];
  source_url: string;
}

/** POST /api/v1/ocrexpert/process — Synchroner OCR-Lauf. Response-Felder. */
export interface OcrexpertProcessResponse {
  /** Linux-Pfad der verarbeiteten Datei (aus dem Request). */
  pfad: string;
  /** Anzahl erkannter Zeichen im gesamten Dokument. */
  n_chars: number;
  /** Proxy-Quell-URL (fuer Tooltip). */
  source_url: string;
  /** Erkannter Dokumenttyp (falls vom Service geliefert). */
  doctype?: string;
  /** Vollstaendiger OCR-Text (falls vom Service geliefert). */
  text?: string;
  /** Wort-Level-Ergebnisse (falls vom Service geliefert). */
  words?: unknown[];
  /** PII-Funde (falls vom Service geliefert). */
  pii?: unknown;
  /** Dauer des OCR-Laufs laut Service (ms). */
  duration_ms?: number;
  /** Rohe Response wenn kein JSON-Parse moeglich war. */
  raw_response?: string;
  /** Alle weiteren service-spezifischen Felder. */
  [key: string]: unknown;
}

// ─── Upload-Hub-Typen (Endpoints unter /api/v1/upload*) ──────────────────────
// Mirror der docs/UPLOAD_SCHEMA.md Pydantic-Schemas (verbindlich).

/** Metadaten-Eintrag eines Uploads (nach POST /api/v1/upload oder GET /api/v1/uploads/{id}). */
export interface Upload {
  upload_id: string;                         // ULID (26 chars)
  operation: string;                         // operation_id aus UPLOAD_SCHEMA.md
  filename: string;                          // Original-Filename vom Client
  size_bytes: number;
  mime: string;                              // erkanntes MIME (Magic-Bytes + Endung)
  uploaded_at: string;                       // ISO-8601 UTC
  status: "queued" | "processing" | "completed" | "failed";
  params: Record<string, unknown>;           // operation-spezifische Parameter
}

/** Ergebnis nach Operation-Abschluss (GET /api/v1/uploads/{id}/result). */
export interface UploadResult {
  upload_id: string;
  status: "queued" | "processing" | "completed" | "failed";
  operation: string;
  completed_at: string | null;               // ISO-8601 UTC
  duration_ms: number | null;
  result_summary: string | null;             // 1-Satz-Zusammenfassung (deutsch)
  result_payload: Record<string, unknown>;   // adapter-spezifische strukturierte Ergebnisdaten
  artifact_url: string | null;              // /api/v1/uploads/{id}/artifact wenn Output-Datei existiert
  artifact_mime: string | null;
  error: string | null;                      // bei status=failed
}

/** Antwort von GET /api/v1/uploads (Liste mit Filter). */
export interface UploadListResponse {
  uploads: Upload[];
  total: number;
  limit: number;
  offset: number;
}
