// SystemCard — Mission-Control-Konsolenkarte für ein Sub-System.
// Stil-Vorbild: features/octoboss/pages/Nodes.tsx (SegBar, Status-LED, Chips).
// Tooltip-Pflicht ADR-004: Score, Status und alle Metriken haben Tooltips.
// Datenquelle: /api/v1/overview (Polling 30s).

import { Link } from "react-router-dom";
import { Tooltip } from "../../components/Tooltip";
import type { SystemStatus } from "../../lib/types";

// System-ID → Frontend-Route.
const SYSTEM_ROUTES: Record<string, string> = {
  oberon:       "/oberon",
  octoboss:     "/octoboss",
  ocrexpert:    "/ocrexpert",
  nasdominator: "/nasdominator",
  qnapbackup:   "/qnapbackup",
  custos:       "/custos",
  panopticor:   "/panopticor",
};

// ─── Zeitformatierung ──────────────────────────────────────────────────────────

function relTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}min`;
    return `${Math.floor(m / 60)}h`;
  } catch {
    return iso ?? "—";
  }
}

// ─── Segment-Bargraph (lokal, LED-Stil — wie in Nodes.tsx) ───────────────────
// Lokal kopiert um Kopplung zu features/octoboss zu vermeiden.

type SegColor = "bg-status-ok" | "bg-status-warn" | "bg-status-error" | "bg-fg-subtle/15";

function scoreColor(v: number): SegColor {
  return v >= 70 ? "bg-status-ok" : v >= 40 ? "bg-status-warn" : "bg-status-error";
}

function SegBar({ value }: { value: number }) {
  const segs = 10;
  const filled = Math.round((Math.min(Math.max(value, 0), 100) / 100) * segs);
  const color = scoreColor(value);
  return (
    <span className="inline-flex gap-0.5" aria-hidden="true">
      {Array.from({ length: segs }).map((_, i) => (
        <span
          key={i}
          className={`h-2.5 w-1.5 rounded-[1px] ${i < filled ? color : "bg-fg-subtle/15"}`}
        />
      ))}
    </span>
  );
}

// ─── Status-LED + Zustandstext ─────────────────────────────────────────────────

type LedState = "ok" | "degraded" | "down";

function ledState(system: SystemStatus): LedState {
  if (!system.ok) return "down";
  if (system.score < 70) return "degraded";
  return "ok";
}

const LED_CLASSES: Record<LedState, string> = {
  ok:       "bg-status-ok",
  degraded: "bg-status-warn",
  down:     "bg-status-error animate-pulse",
};

const LED_LABELS: Record<LedState, string> = {
  ok:       "OK",
  degraded: "Beeinträchtigt",
  down:     "Ausgefallen",
};

// ─── Metrik-Formatierung ───────────────────────────────────────────────────────

function formatMetricValue(val: string | number | boolean | null): string {
  if (val === null || val === undefined) return "—";
  if (typeof val === "boolean") return val ? "ja" : "nein";
  if (typeof val === "number") {
    // Millisekunden: ab 1000 als Sekunden
    if (Math.abs(val) >= 1000 && Number.isInteger(val)) return `${(val / 1000).toFixed(1)}s`;
    // Prozent-ähnliche Werte (0..100 ganze Zahl)
    if (Number.isInteger(val) && val >= 0 && val <= 100) return String(val);
    if (!Number.isInteger(val)) return val.toFixed(1);
    return String(val);
  }
  return String(val);
}

function humanKey(key: string): string {
  return key.replace(/_/g, " ");
}

// ─── Metriken-Block ────────────────────────────────────────────────────────────
// Zeigt skalare metrics als Key-Value-Chips, maximal 5.

function MetricsBlock({
  metrics,
  fetchedAt,
}: {
  metrics: SystemStatus["metrics"];
  fetchedAt: string;
}) {
  const entries = Object.entries(metrics)
    .filter(([, v]) => v !== null && v !== undefined)
    .slice(0, 5);

  if (entries.length === 0) return null;

  return (
    <div className="mt-2 space-y-1">
      {entries.map(([key, val]) => (
        <Tooltip
          key={key}
          title={`${humanKey(key)}: ${formatMetricValue(val)}`}
          source="/api/v1/overview"
          updatedAt={`vor ${relTime(fetchedAt)}`}
          block
        >
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="truncate text-fg-subtle capitalize">{humanKey(key)}</span>
            <span
              className={`shrink-0 tabular-nums font-semibold ${
                typeof val === "boolean"
                  ? val
                    ? "text-status-ok"
                    : "text-status-error"
                  : "text-fg-muted"
              }`}
            >
              {formatMetricValue(val)}
            </span>
          </div>
        </Tooltip>
      ))}
    </div>
  );
}

// ─── Haupt-Karte ───────────────────────────────────────────────────────────────

export interface SystemCardProps {
  system: SystemStatus;
}

export function SystemCard({ system }: SystemCardProps) {
  const route = SYSTEM_ROUTES[system.id] ?? `/${system.id}`;
  const state = ledState(system);
  const updatedAgo = `vor ${relTime(system.fetched_at)}`;

  return (
    // Gesamte Karte ist Link (wie NodeCard in Nodes.tsx).
    // Innere Elemente nur span/div (Tooltips) — kein verschachteltes <a>.
    <Link
      to={route}
      data-testid={`system-card-${system.id}`}
      aria-label={`${system.name}-Detail öffnen`}
      className="group block rounded-lg border border-brand/25 bg-bg-panel p-3 font-mono shadow-sm
                 hover:border-brand/50 hover:bg-bg-elevated/40
                 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand
                 transition-colors"
    >
      {/* Header: System-Name + Status-LED */}
      <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2">
        <span className="truncate text-sm font-bold uppercase tracking-wide text-brand group-hover:underline">
          {system.name}
        </span>
        <Tooltip
          title={`Status: ${LED_LABELS[state]}`}
          source="/api/v1/overview"
          updatedAt={updatedAgo}
          thresholds="OK ≥70 · Beeinträchtigt 40–69 · Ausgefallen <40 oder ok=false"
        >
          <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${LED_CLASSES[state]}`} />
        </Tooltip>
      </div>

      {/* Score-Zeile: SegBar + Zahl */}
      <div className="flex items-center gap-2 pt-2">
        <Tooltip
          title={`Gesundheits-Score: ${system.score} / 100`}
          source="/api/v1/overview"
          updatedAt={updatedAgo}
          thresholds="≥70 OK (grün) · 40–69 Beeinträchtigt (gold) · <40 Kritisch (rot)"
        >
          <div className="flex items-center gap-1.5">
            <SegBar value={system.score} />
            <span
              className={`ml-1 tabular-nums text-xs font-semibold ${
                system.score >= 70
                  ? "text-status-ok"
                  : system.score >= 40
                    ? "text-status-warn"
                    : "text-status-error"
              }`}
              data-testid={`gauge-${system.id}`}
            >
              {system.score}
            </span>
          </div>
        </Tooltip>
        <span className="ml-auto shrink-0 text-xxs text-fg-subtle">{updatedAgo}</span>
      </div>

      {/* Summary */}
      <p className="mt-2 text-xs text-fg-muted line-clamp-2 font-sans">
        {system.summary}
      </p>

      {/* Fehler-Anzeige (dezent, nur wenn vorhanden) */}
      {system.error && (
        <p className="mt-1 truncate text-xxs text-status-error font-sans" title={system.error}>
          {system.error}
        </p>
      )}

      {/* Metriken-Block */}
      <MetricsBlock metrics={system.metrics} fetchedAt={system.fetched_at} />

      {/* Footer: Detail-Hinweis (optisch, kein eigener Link) */}
      <div
        className="mt-3 border-t border-white/10 pt-2 text-xxs text-fg-subtle group-hover:text-brand font-sans"
        aria-hidden="true"
        data-testid={`card-detail-${system.id}`}
      >
        Detail →
      </div>
    </Link>
  );
}

export default SystemCard;
