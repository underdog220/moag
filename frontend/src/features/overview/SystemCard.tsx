// SystemCard — Karte für ein Sub-System auf der Cockpit-Startseite.
// Zeigt Hero-Gauge + Summary + 2-3 Mini-Indikatoren + "Detail →"-Button.
// Tooltip auf Gauge ist Pflicht (ADR-004).

import { Link } from "react-router-dom";
import { Gauge } from "../../components/Gauge";
import type { SystemStatus } from "../../lib/types";

// System-ID → Frontend-Route
const SYSTEM_ROUTES: Record<string, string> = {
  oberon:       "/oberon",
  octoboss:     "/octoboss",
  sonofseti:    "/sonofseti",
  ocrexpert:    "/ocrexpert",
  nasdominator: "/nasdominator",
  qnapbackup:   "/qnapbackup",
  custos:       "/custos",
  panopticor:   "/panopticor",
};

// Maximal 3 Metriken als Mini-Indikatoren
function MetricList({ metrics }: { metrics: SystemStatus["metrics"] }) {
  const entries = Object.entries(metrics).slice(0, 3);
  if (entries.length === 0) return null;
  return (
    <ul className="mt-2 space-y-1">
      {entries.map(([key, val]) => (
        <li key={key} className="flex items-center justify-between text-xs">
          <span className="text-fg-subtle capitalize">{key.replace(/_/g, " ")}</span>
          <span className="tabular-nums text-fg-muted">{String(val)}</span>
        </li>
      ))}
    </ul>
  );
}

export interface SystemCardProps {
  system: SystemStatus;
}

export function SystemCard({ system }: SystemCardProps) {
  const route = SYSTEM_ROUTES[system.id] ?? `/${system.id}`;
  const isStub = !system.ok && system.score < 60;

  return (
    <div
      className={`flex flex-col rounded-lg border bg-bg-panel p-4 transition-colors
                  hover:border-white/10 ${
                    system.ok ? "border-white/5" : "border-status-error/20"
                  }`}
      data-testid={`system-card-${system.id}`}
    >
      {/* Header: Name + Status-Dot */}
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-fg">{system.name}</h3>
        <span
          className={`h-2 w-2 rounded-full ${
            system.ok ? "bg-status-ok" : "bg-status-error"
          }`}
          title={system.ok ? "OK" : system.error ?? "Fehler"}
        />
      </div>

      {/* Hero-Gauge (zentriert) */}
      <div className="flex justify-center">
        <Gauge
          value={system.score}
          variant="hero"
          label="Score"
          tooltip={{
            title: `${system.name} Gesundheits-Score`,
            source: `/api/v1/overview`,
            updatedAt: `${system.fetched_at.slice(11, 16)} UTC`,
            thresholds: "≥70 OK · 40–69 ⚠ · <40 ✗",
          }}
          testId={`gauge-${system.id}`}
        />
      </div>

      {/* Summary */}
      <p className="mt-2 text-xs text-fg-muted line-clamp-2">
        {isStub ? system.error ?? system.summary : system.summary}
      </p>

      {/* Mini-Metriken */}
      {!isStub && <MetricList metrics={system.metrics} />}

      {/* Detail-Button */}
      <div className="mt-auto pt-3">
        <Link
          to={route}
          className="block rounded bg-bg-elevated px-3 py-1.5 text-center text-xs
                     text-fg-muted hover:bg-bg-subtle hover:text-fg"
          data-testid={`card-detail-${system.id}`}
        >
          {isStub ? "Info" : "Detail →"}
        </Link>
      </div>
    </div>
  );
}

export default SystemCard;
