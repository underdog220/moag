// OctoBoss Nodes — Mission-Control-Konsolenkarten mit Hardware-Telemetrie.
// Sub-Route: /octoboss/nodes
// Datenquelle: GET /api/v1/octoboss/nodes (Polling 10s)
//
// Darstellung im "For All Mankind"-Konsolenstil: pro Node eine Karte mit
// Segment-Bargraphs (GPU/CPU-Last), RAM-frei, Status-LED und einem
// GPU-Runtime-Badge — letzteres macht sichtbar, WARUM Last-Telemetrie fehlt
// (gpu_runtime_ready=false => kein gpu_load/vram messbar).

import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../../../lib/api";
import { Tooltip } from "../../../components/Tooltip";
import { Sparkline } from "../../../components/Sparkline";
import { PageBadge } from "../../../components/PageBadge";
import { LoadingSpinner } from "../../../components/LoadingSpinner";
import type { OctoBossNodeDetail, HwHistorySample } from "../../../lib/types";

function relTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}min`;
    return `${Math.floor(m / 60)}h`;
  } catch {
    return iso;
  }
}

// ─── Segment-Bargraph (LED-Stil) für Prozent-Lasten ──────────────────────────

function loadColor(v: number): string {
  return v > 90 ? "bg-status-error" : v > 70 ? "bg-status-warn" : "bg-status-ok";
}

function SegBar({ value }: { value: number | null | undefined }) {
  const segs = 12;
  const filled = value == null ? 0 : Math.round((Math.min(Math.max(value, 0), 100) / 100) * segs);
  const color = value == null ? "" : loadColor(value);
  return (
    <span className="inline-flex gap-0.5" aria-hidden="true">
      {Array.from({ length: segs }).map((_, i) => (
        <span
          key={i}
          className={`h-3 w-1 rounded-[1px] ${i < filled ? color : "bg-fg-subtle/15"}`}
        />
      ))}
    </span>
  );
}

// ─── Hilfsfunktion: Quell-Label für Tooltip ──────────────────────────────────

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

// ─── Metrik-Zeile (GPU/CPU-Last) ─────────────────────────────────────────────

function MetricRow({
  label,
  value,
  hint,
  hwSource,
  hwAt,
  samples,
  field,
}: {
  label: string;
  value: number | null | undefined;
  hint?: string;
  hwSource?: "direct" | "heartbeat" | null;
  hwAt?: string | null;
  samples?: HwHistorySample[];
  field?: "gpu" | "cpu";
}) {
  const txt =
    value == null
      ? "text-fg-subtle"
      : value > 90
        ? "text-status-error"
        : value > 70
          ? "text-status-warn"
          : "text-status-ok";
  const srcLabel = hwSourceLabel(hwSource, hwAt);
  const spark =
    field && samples && samples.length > 0 ? (
      <div>
        <p className="mb-0.5 text-xxs text-fg-subtle">Verlauf (~30 min)</p>
        <Sparkline samples={samples} field={field} />
      </div>
    ) : undefined;
  return (
    <Tooltip
      title={`${label}-Auslastung: ${value == null ? "keine Telemetrie" : value.toFixed(1) + " %"}${
        hint ? " (" + hint + ")" : ""
      } · ${srcLabel}`}
      extra={spark}
      source="/api/v1/octoboss/nodes/{id}/history"
      thresholds="<70% ok · 70-90% warn · >90% krit"
      block
    >
      <div className="flex items-center gap-2">
        <span className="w-8 shrink-0 text-fg-subtle">{label}</span>
        <SegBar value={value} />
        <span className={`ml-auto tabular-nums ${txt}`}>
          {value == null ? "n/a" : `${value.toFixed(0)}%`}
        </span>
        {hint && <span className="text-xxs text-fg-subtle">{hint}</span>}
      </div>
    </Tooltip>
  );
}

// ─── GPU-Runtime-Badge ───────────────────────────────────────────────────────

function GpuRuntimeBadge({
  present,
  ready,
}: {
  present: boolean | null | undefined;
  ready: boolean | null | undefined;
}) {
  let label: string;
  let cls: string;
  let title: string;
  if (ready === true) {
    label = "GPU bereit";
    cls = "border-status-ok/40 text-status-ok";
    title = "GPU-Runtime (CUDA/ROCm) ansprechbar — Last-Telemetrie verfügbar.";
  } else if (present === false) {
    label = "CPU-only";
    cls = "border-fg-subtle/30 text-fg-subtle";
    title = "Keine dedizierte GPU erkannt (gpu_present=false).";
  } else if (ready === false) {
    label = "Runtime offline";
    cls = "border-status-warn/40 text-status-warn";
    title =
      "GPU vorhanden, aber Runtime (CUDA/ROCm) nicht ansprechbar — darum keine GPU-Last/VRAM-Telemetrie.";
  } else {
    label = "RT unbekannt";
    cls = "border-fg-subtle/20 text-fg-subtle";
    title = "GPU-Runtime-Status nicht gemeldet (hw-monitor < 1.2 oder kein Feld).";
  }
  return (
    <span
      className={`rounded border px-1.5 py-0.5 text-xxs font-semibold uppercase ${cls}`}
      title={`${title} Quelle: /api/v1/octoboss/nodes`}
    >
      {label}
    </span>
  );
}

// ─── Node-Konsolenkarte ──────────────────────────────────────────────────────

function NodeCard({ node }: { node: OctoBossNodeDetail }) {
  const hw = node.hardware;
  const ollama = node.ollama?.running ?? false;
  const rtHint = hw?.gpu_runtime_ready === false ? "RT offline" : undefined;

  // Kurzer Verlauf (~30 min) für die Hover-Sparkline. Eigene Query je Karte;
  // bei wenigen Nodes unkritisch. Datenquelle: MOAG-interner Ring-Buffer.
  const { data: hist } = useQuery({
    queryKey: ["octoboss", "node-history", node.node_id, 1800],
    queryFn: () => api.octoboss.getNodeHistory(node.node_id, 1800),
    refetchInterval: 30_000,
    staleTime: 25_000,
  });
  const samples = hist?.samples ?? [];

  return (
    // Gesamte Karte ist der Link zum Node-Detail (nicht nur der Name).
    // Innere Elemente sind nur span/div (Tooltips) -> kein verschachteltes <a>.
    <Link
      to={node.node_id}
      className="group block rounded-lg border border-brand/25 bg-bg-panel p-3 font-mono shadow-sm
                 hover:border-brand/50 hover:bg-bg-elevated/40
                 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand
                 transition-colors"
      data-testid={`node-card-${node.node_id}`}
      title={`Node-Detail für ${node.hostname}`}
    >
      {/* Header: Callsign + Status-LED + Mode */}
      <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2">
        <span className="truncate text-sm font-bold uppercase tracking-wide text-brand group-hover:underline">
          {node.hostname}
        </span>
        <div className="flex shrink-0 items-center gap-1.5 text-xxs">
          <Tooltip title={node.connected ? "verbunden" : "getrennt"} source="/api/v1/octoboss/nodes">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                node.connected ? "bg-status-ok" : "bg-status-error"
              }`}
            />
          </Tooltip>
          <span className="uppercase text-fg-muted">{node.mode ?? "—"}</span>
        </div>
      </div>

      {/* GPU-Name + Heartbeat */}
      <div className="flex items-center justify-between gap-2 pt-2 text-xxs text-fg-subtle">
        <span className="truncate" title={hw?.gpu_name ?? "keine GPU"}>
          {hw?.gpu_name ?? "keine GPU"}
        </span>
        <Tooltip
          title={node.last_heartbeat ?? "kein Heartbeat"}
          source="/api/v1/octoboss/nodes"
          updatedAt="alle 10s"
        >
          <span className="shrink-0 text-status-ok">♥ {relTime(node.last_heartbeat)}</span>
        </Tooltip>
      </div>

      {/* Last-Bargraphs: 2-Spalten-Grid — GPU+VRAM links, CPU+RAM rechts */}
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        {/* Linke Spalte: GPU-Last + VRAM frei */}
        <div className="flex flex-col gap-1 min-w-0">
          <MetricRow label="GPU" value={hw?.gpu_load_percent} hint={rtHint}
            hwSource={hw?.hardware_source} hwAt={hw?.hardware_at}
            samples={samples} field="gpu" />
          <Tooltip
            title={`Freier Video-RAM (GPU-Speicher): ${hw?.vram_free_gb != null ? hw.vram_free_gb.toFixed(1) + " GB" : "—"}`}
            source="/api/v1/octoboss/nodes"
            block
          >
            <div className="flex items-center gap-1">
              <span className="w-8 shrink-0 text-fg-subtle">VRAM</span>
              <span className="text-fg-muted text-xxs">frei</span>
              <span className="ml-auto tabular-nums font-semibold text-fg">
                {hw?.vram_free_gb != null ? `${hw.vram_free_gb.toFixed(1)} GB` : "—"}
              </span>
            </div>
          </Tooltip>
        </div>

        {/* Rechte Spalte: CPU-Last + RAM frei */}
        <div className="flex flex-col gap-1 min-w-0">
          <MetricRow label="CPU" value={hw?.cpu_load_percent}
            hwSource={hw?.hardware_source} hwAt={hw?.hardware_at}
            samples={samples} field="cpu" />
          <Tooltip
            title={`Freier System-RAM: ${hw?.ram_free_gb != null ? hw.ram_free_gb.toFixed(1) + " GB" : "—"}`}
            source="/api/v1/octoboss/nodes"
            block
          >
            <div className="flex items-center gap-1">
              <span className="w-8 shrink-0 text-fg-subtle">RAM</span>
              <span className="text-fg-muted text-xxs">frei</span>
              <span className="ml-auto tabular-nums font-semibold text-fg">
                {hw?.ram_free_gb != null ? `${hw.ram_free_gb.toFixed(1)} GB` : "—"}
              </span>
            </div>
          </Tooltip>
        </div>
      </div>

      {/* Footer: Ollama + GPU-Runtime */}
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-white/10 pt-2 text-xxs">
        <Tooltip title={ollama ? "Ollama-Dienst läuft" : "Ollama nicht aktiv"} source="/api/v1/octoboss/nodes">
          <span className={ollama ? "text-status-ok" : "text-fg-subtle"}>
            OLLAMA {ollama ? "✓" : "—"}
          </span>
        </Tooltip>
        <GpuRuntimeBadge present={hw?.gpu_present} ready={hw?.gpu_runtime_ready} />
      </div>
    </Link>
  );
}

export function NodesPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["octoboss", "nodes"],
    queryFn: () => api.octoboss.getNodes(),
    refetchInterval: 10_000,
  });

  const nodes: OctoBossNodeDetail[] = (() => {
    if (!data) return [];
    if (Array.isArray(data)) return data as OctoBossNodeDetail[];
    const d = data as Record<string, unknown>;
    if (Array.isArray(d.nodes)) return d.nodes as OctoBossNodeDetail[];
    return [];
  })();

  return (
    <div className="flex flex-col gap-4" data-testid="nodes-page">
      <h2 className="text-lg font-semibold text-fg">Nodes</h2>

      {isLoading && <LoadingSpinner />}
      {error && (
        <div className="rounded border border-status-error/30 bg-status-error/10 px-3 py-2 text-sm text-status-error">
          Fehler: {(error as Error).message}
        </div>
      )}

      {!isLoading && !error && nodes.length === 0 && (
        <p className="text-sm text-fg-muted">Keine Nodes registriert.</p>
      )}

      {nodes.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 3xl:grid-cols-4">
          {nodes.map((node) => (
            <NodeCard key={node.node_id} node={node} />
          ))}
        </div>
      )}

      <PageBadge id="octoboss.nodes" />
    </div>
  );
}

export default NodesPage;
