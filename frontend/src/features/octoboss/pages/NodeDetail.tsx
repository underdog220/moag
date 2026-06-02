// OctoBoss Node-Detail — grosse "Alles-ueber-den-Knoten"-Uebersicht (Panel-Grid).
// Sub-Route: /octoboss/nodes/:node_id
// Datenquelle: GET /api/v1/octoboss/nodes/{node_id} (1:1-Proxy auf den Hub, Polling 10s)

import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import { api } from "../../../lib/api";
import { Tooltip } from "../../../components/Tooltip";
import { PageBadge } from "../../../components/PageBadge";
import { LoadingSpinner } from "../../../components/LoadingSpinner";
import type { OctoBossNodeDetail, OctoBossModuleDetail } from "../../../lib/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function relTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return `vor ${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `vor ${m}min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `vor ${h}h`;
    return `vor ${Math.floor(h / 24)}d`;
  } catch {
    return iso;
  }
}

function isVisionModel(name: string): boolean {
  return /llava|minicpm-v|qwen2\.5vl|bakllava|moondream/i.test(name);
}

// ─── Bausteine ───────────────────────────────────────────────────────────────

function Panel({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-lg border border-white/10 bg-bg-panel p-3 ${className}`}>
      <h3 className="mb-2 border-b border-white/10 pb-1.5 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
        {title}
      </h3>
      {children}
    </section>
  );
}

function KV({
  label,
  value,
  tip,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  tip?: string;
  mono?: boolean;
}) {
  const val = (
    <span className={`text-sm text-fg ${mono ? "font-mono break-all" : ""}`}>{value}</span>
  );
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <span className="shrink-0 text-xs text-fg-muted">{label}</span>
      {tip ? (
        <Tooltip title={tip} source="/api/v1/octoboss/nodes/{id}">
          <span className="text-right">{val}</span>
        </Tooltip>
      ) : (
        <span className="text-right">{val}</span>
      )}
    </div>
  );
}

function SegBar({ value }: { value: number | null | undefined }) {
  const segs = 12;
  const filled = value == null ? 0 : Math.round((Math.min(Math.max(value, 0), 100) / 100) * segs);
  const color =
    value == null ? "" : value > 90 ? "bg-status-error" : value > 70 ? "bg-status-warn" : "bg-status-ok";
  return (
    <span className="inline-flex gap-0.5" aria-hidden="true">
      {Array.from({ length: segs }).map((_, i) => (
        <span key={i} className={`h-3 w-1 rounded-[1px] ${i < filled ? color : "bg-fg-subtle/15"}`} />
      ))}
    </span>
  );
}

// ─── Quell-Label für Hardware-Telemetrie-Tooltip ─────────────────────────────

function hwSourceLabel(
  source: "direct" | "heartbeat" | null | undefined,
  at: string | null | undefined,
): string {
  if (source === "direct") {
    if (at) {
      try {
        const s = Math.floor((Date.now() - new Date(at).getTime()) / 1000);
        const age = s < 60 ? `${s}s` : `${Math.floor(s / 60)}min`;
        return `Direkt-Pull (vor ${age})`;
      } catch {
        return "Direkt-Pull";
      }
    }
    return "Direkt-Pull";
  }
  if (source === "heartbeat") return "Heartbeat (Lasten ggf. null)";
  return "Quelle unbekannt";
}

function LoadRow({
  label,
  value,
  hwSource,
  hwAt,
}: {
  label: string;
  value: number | null | undefined;
  hwSource?: "direct" | "heartbeat" | null;
  hwAt?: string | null;
}) {
  const txt =
    value == null ? "text-fg-subtle" : value > 90 ? "text-status-error" : value > 70 ? "text-status-warn" : "text-status-ok";
  const srcLabel = hwSourceLabel(hwSource, hwAt);
  return (
    <Tooltip
      title={`${label}-Auslastung: ${value == null ? "keine Telemetrie" : value.toFixed(1) + " %"} · ${srcLabel}`}
      source="/api/v1/octoboss/nodes/{id}"
      thresholds="<70% ok · 70-90% warn · >90% krit"
      block
    >
      <div className="flex items-center gap-2 py-1 text-sm">
        <span className="w-12 shrink-0 text-xs text-fg-muted">{label}</span>
        <SegBar value={value} />
        <span className={`ml-auto tabular-nums ${txt}`}>{value == null ? "n/a" : `${value.toFixed(0)}%`}</span>
      </div>
    </Tooltip>
  );
}

function Chip({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "ok" | "warn" | "neutral" | "brand" }) {
  const cls =
    tone === "ok"
      ? "border-status-ok/40 text-status-ok"
      : tone === "warn"
        ? "border-status-warn/40 text-status-warn"
        : tone === "brand"
          ? "border-brand/40 text-brand"
          : "border-fg-subtle/30 text-fg-muted";
  return <span className={`rounded border px-1.5 py-0.5 text-xxs font-semibold uppercase ${cls}`}>{children}</span>;
}

// ─── Seite ───────────────────────────────────────────────────────────────────

export function NodeDetailPage() {
  const { node_id } = useParams<{ node_id: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ["octoboss", "nodes", node_id],
    queryFn: () => api.octoboss.getNode(node_id!),
    enabled: !!node_id,
    refetchInterval: 10_000,
  });

  const node = data as OctoBossNodeDetail | null;
  const hw = node?.hardware;
  const ollama = node?.ollama;
  const mods: OctoBossModuleDetail[] = node?.installed_modules_detail ?? [];
  const models: string[] = ollama?.installed_models ?? ollama?.models ?? [];
  const caps: string[] = node?.capabilities ?? [];
  const alerts = (node?.alerts ?? []) as unknown[];
  const drift = (node?.drift_modules ?? []) as Array<{ name: string; status?: string }>;

  const compute = ollama?.compute_device ?? null;
  const computeTone = compute === "gpu" ? "ok" : compute === "cpu" ? "warn" : "neutral";

  return (
    <div className="flex flex-col gap-4" data-testid="node-detail">
      <div className="flex items-center gap-2 text-sm">
        <Link to=".." className="text-brand hover:underline">← Nodes</Link>
        <span className="text-fg-subtle">/</span>
        <span className="font-semibold text-fg">{node?.hostname ?? node_id}</span>
      </div>

      {isLoading && <LoadingSpinner />}
      {error && (
        <div className="rounded border border-status-error/30 bg-status-error/10 px-3 py-2 text-sm text-status-error">
          Fehler: {(error as Error).message}
        </div>
      )}

      {node && (
        <>
          {/* Header-Panel: Callsign + Status */}
          <div className="rounded-lg border border-brand/30 bg-bg-panel p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-block h-2.5 w-2.5 rounded-full ${node.connected ? "bg-status-ok" : "bg-status-error"}`}
                  title={node.connected ? "verbunden" : "getrennt"}
                />
                <h2 className="text-xl font-bold uppercase tracking-wide text-brand">{node.hostname}</h2>
                {node.mode && <Chip tone="brand">{node.mode}</Chip>}
                {node.node_pool && <Chip>{node.node_pool}</Chip>}
                {node.power_status && <Chip tone={node.power_status === "online" ? "ok" : "neutral"}>{node.power_status}</Chip>}
                {node.vision_capable && <Chip tone="ok">vision</Chip>}
              </div>
              <div className="text-xs text-fg-subtle">
                <span className="text-status-ok">♥ {relTime(node.last_heartbeat)}</span>
                {node.first_seen && <span> · bekannt seit {relTime(node.first_seen)}</span>}
              </div>
            </div>
          </div>

          {/* Panel-Grid */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 3xl:grid-cols-3">
            {/* Identität */}
            <Panel title="Identität">
              <KV label="Node-ID" value={node.node_id} mono />
              <KV label="Hostname" value={node.hostname} />
              <KV label="IP" value={node.last_known_ip ?? "—"} mono />
              <KV
                label="MAC"
                value={node.mac_address || "—"}
                mono
                tip={node.mac_address ? "MAC-Adresse des Nodes" : "Für Wake-on-LAN gedacht — wird vom Node oft nicht gemeldet (leer)."}
              />
              <KV label="Plattform" value={node.platform ?? "—"} />
              <KV label="Core-Version" value={node.agent_version ?? "—"} mono tip="Version des SonOfSETI-Core (agent_version)." />
              <KV
                label="Bootstrapper"
                value="nur Cluster-weit"
                tip="Bootstrapper-Version wird nicht pro Node gemeldet — nur als globaler Cluster-Default (siehe Manifest-Health)."
              />
            </Panel>

            {/* Hardware */}
            <Panel title="Hardware & Auslastung">
              <KV label="GPU" value={hw?.gpu_name ?? "—"} />
              <LoadRow label="GPU" value={hw?.gpu_load_percent}
                hwSource={hw?.hardware_source} hwAt={hw?.hardware_at} />
              <LoadRow label="CPU" value={hw?.cpu_load_percent}
                hwSource={hw?.hardware_source} hwAt={hw?.hardware_at} />
              <KV label="RAM frei" value={hw?.ram_free_gb != null ? `${hw.ram_free_gb.toFixed(1)} GB` : "—"} />
              <KV label="VRAM frei" value={hw?.vram_free_gb != null ? `${hw.vram_free_gb.toFixed(1)} GB` : "—"} />
              <KV label="GPU-Temp" value={hw?.gpu_temp_c != null ? `${hw.gpu_temp_c.toFixed(0)} °C` : "—"} />
              <KV label="CPU-Temp" value={hw?.cpu_temp_c != null ? `${hw.cpu_temp_c.toFixed(0)} °C` : "—"} />
              <KV label="CPU-Modell" value={hw?.cpu_model ?? "—"} mono />
            </Panel>

            {/* GPU / KI-Status */}
            <Panel title="GPU / KI-Status">
              <div className="flex items-center justify-between gap-2 py-1">
                <span className="text-xs text-fg-muted">Compute-Device</span>
                <Tooltip
                  title="Worauf Ollama tatsächlich rechnet. 'cpu' trotz GPU = GPU-Boot-Race (Heilung: Ollama-Neustart). 'unknown' = hw-monitor liefert nichts."
                  source="/api/v1/octoboss/nodes/{id}"
                >
                  <Chip tone={computeTone}>{compute ?? "unbekannt"}</Chip>
                </Tooltip>
              </div>
              <div className="flex items-center justify-between gap-2 py-1">
                <span className="text-xs text-fg-muted">GPU-Runtime</span>
                <Chip tone={hw?.gpu_runtime_ready ? "ok" : hw?.gpu_present === false ? "neutral" : "warn"}>
                  {hw?.gpu_runtime_ready ? "bereit" : hw?.gpu_present === false ? "keine GPU" : "offline"}
                </Chip>
              </div>
              <div className="flex items-center justify-between gap-2 py-1">
                <span className="text-xs text-fg-muted">GPU-Fallback</span>
                <Tooltip
                  title="True = GPU vorhanden + Runtime ok, aber Ollama läuft trotzdem auf CPU (Boot-Race). Heilung: Ollama-Neustart."
                  source="/api/v1/octoboss/nodes/{id}"
                >
                  <Chip tone={node.gpu_fallback_detected ? "warn" : "ok"}>
                    {node.gpu_fallback_detected ? "erkannt ⚠" : "nein"}
                  </Chip>
                </Tooltip>
              </div>
              <KV label="Vision-fähig" value={node.vision_capable ? "ja" : "nein"} tip="Mindestens ein Vision-Modell installiert (llava, minicpm-v, qwen2.5vl …)." />
            </Panel>

            {/* Ollama + Modell-Liste */}
            <Panel title={`Ollama (${models.length} Modelle)`}>
              <KV
                label="Status"
                value={
                  <span className={ollama?.running ? "text-status-ok" : "text-fg-muted"}>
                    {ollama?.running ? "läuft" : "gestoppt"}
                  </span>
                }
              />
              <KV label="Endpoint" value={ollama ? `${ollama.bind_host ?? "?"}:${ollama.port ?? "?"}` : "—"} mono />
              <KV label="Aktives Modell" value={ollama?.active_model ?? "—"} mono />
              <div className="mt-2 max-h-48 space-y-1 overflow-y-auto pr-1">
                {models.length === 0 && <p className="text-xs text-fg-subtle">keine Modelle installiert</p>}
                {models.map((m) => (
                  <div key={m} className="flex items-center justify-between gap-2 rounded bg-bg-elevated/40 px-2 py-1 text-xs">
                    <span className="truncate font-mono text-fg">{m}</span>
                    {isVisionModel(m) && <span title="Vision-Modell">👁</span>}
                  </div>
                ))}
              </div>
            </Panel>

            {/* Module-Liste (scrollbar) — breiter */}
            <Panel title={`Module (${mods.length})`} className="lg:col-span-2 3xl:col-span-1">
              <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
                {mods.length === 0 && <p className="text-xs text-fg-subtle">keine Module installiert</p>}
                {mods.map((m) => (
                  <div key={m.name} className="rounded border border-white/10 bg-bg-elevated/30 px-2 py-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-sm font-semibold text-brand">{m.name}</span>
                      <span className="font-mono text-xs text-fg-muted">v{m.version}</span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xxs text-fg-subtle">
                      <span className={m.status === "running" ? "text-status-ok" : "text-fg-muted"}>
                        ● {m.status ?? "?"}
                      </span>
                      {(m.direct_port ?? m.port) != null && <span>Port {m.direct_port ?? m.port}</span>}
                      {m.pid != null && <span>PID {m.pid}</span>}
                      {m.min_core_version && <span>min-core {m.min_core_version}</span>}
                      {m.installed_at && <span title={m.installed_at}>seit {relTime(m.installed_at)}</span>}
                    </div>
                  </div>
                ))}
                {drift.length > 0 && (
                  <div className="mt-1 rounded border border-status-warn/30 bg-status-warn/10 px-2 py-1 text-xxs text-status-warn">
                    {drift.length} Modul(e) im Drift (awaiting_reattach): {drift.map((d) => d.name).join(", ")}
                  </div>
                )}
              </div>
            </Panel>

            {/* Capabilities */}
            <Panel title={`Capabilities (${caps.length})`}>
              <div className="flex flex-wrap gap-1.5">
                {caps.length === 0 && <p className="text-xs text-fg-subtle">keine</p>}
                {caps.map((c) => (
                  <Chip key={c} tone="brand">{c}</Chip>
                ))}
              </div>
            </Panel>

            {/* Lifecycle */}
            <Panel title="Lifecycle">
              <KV label="Bekannt seit" value={node.first_seen ? relTime(node.first_seen) : "—"} tip={node.first_seen ?? undefined} />
              <KV label="Letzter Heartbeat" value={node.last_heartbeat ? relTime(node.last_heartbeat) : "—"} tip={node.last_heartbeat ?? undefined} />
              <KV label="Zuletzt aktiv" value={node.last_active_at ? relTime(node.last_active_at) : "—"} tip={node.last_active_at ?? undefined} />
              <KV label="Session-ID" value={node.session_id || "—"} mono />
            </Panel>

            {/* Node-Alerts (nur wenn vorhanden) */}
            {alerts.length > 0 && (
              <Panel title={`Node-Alerts (${alerts.length})`} className="border-status-error/40">
                <div className="max-h-40 space-y-1 overflow-y-auto pr-1 text-xs text-status-error">
                  {alerts.map((a, i) => (
                    <div key={i} className="rounded bg-status-error/10 px-2 py-1 font-mono">
                      {typeof a === "string" ? a : JSON.stringify(a)}
                    </div>
                  ))}
                </div>
              </Panel>
            )}
          </div>
        </>
      )}

      <PageBadge id="octoboss.node-detail" />
    </div>
  );
}

export default NodeDetailPage;
