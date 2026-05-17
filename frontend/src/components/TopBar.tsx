// TopBar — MOAG-Gesamtübersicht: Logo, Health-Score, Gruppen-Indikatoren, Alert-Counter.
// Sticky auf allen Routen (ADR-003, ADR-004).
// Datenquelle: /api/v1/aggregator/health (Polling 10s).

import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useUiStore } from "../lib/store";

// ─── Typen ────────────────────────────────────────────────────────────────────

export interface GroupHealth {
  name: string;
  score: number;
  systems: { name: string; score: number; ok: boolean }[];
}

export interface AggregatorHealth {
  overall_score: number;
  alert_count: number;
  groups: GroupHealth[];
}

// ─── Mini-Balken (10 Segmente) ────────────────────────────────────────────────

function ScoreBar({ score }: { score: number }) {
  const filled = Math.round(score / 10);
  return (
    <span className="inline-flex gap-0.5" aria-hidden="true">
      {Array.from({ length: 10 }).map((_, i) => (
        <span
          key={i}
          className={`h-2 w-1.5 rounded-sm ${
            i < filled
              ? score >= 70
                ? "bg-status-ok"
                : score >= 40
                  ? "bg-status-warn"
                  : "bg-status-error"
              : "bg-white/10"
          }`}
        />
      ))}
    </span>
  );
}

// ─── Gruppen-Indikator mit Hover-Popover ─────────────────────────────────────

function GroupIndicator({ group }: { group: GroupHealth }) {
  const [open, setOpen] = useState(false);
  const color =
    group.score >= 70 ? "text-status-ok" : group.score >= 40 ? "text-status-warn" : "text-status-error";

  return (
    <div className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        className={`flex items-center gap-1 rounded border border-white/10 bg-bg-panel
                    px-2 py-1 text-xs hover:bg-bg-subtle hover:border-white/20`}
        title={`${group.name}: ${group.score}%`}
      >
        <span className="text-fg-subtle">{group.name}</span>
        <span className={`font-semibold tabular-nums ${color}`}>{group.score}%</span>
      </button>

      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-1 min-w-[180px] rounded border border-white/10
                     bg-bg-elevated p-2 shadow-lg"
        >
          <p className="mb-1.5 text-xxs font-semibold uppercase text-fg-subtle">{group.name}</p>
          <ul className="space-y-1">
            {group.systems.map((s) => (
              <li key={s.name} className="flex items-center justify-between gap-4 text-sm">
                <span className={s.ok ? "text-fg" : "text-fg-muted"}>{s.name}</span>
                <span
                  className={`tabular-nums ${
                    s.score >= 70 ? "text-status-ok" : s.score >= 40 ? "text-status-warn" : "text-status-error"
                  }`}
                >
                  {s.score}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Mock-Fallback wenn Backend noch nicht antwortet ─────────────────────────

function mockHealth(): AggregatorHealth {
  return {
    overall_score: 72,
    alert_count: 2,
    groups: [
      {
        name: "KI",
        score: 80,
        systems: [
          { name: "Oberon", score: 85, ok: true },
          { name: "OctoBoss", score: 78, ok: true },
          { name: "SonOfSETI", score: 90, ok: true },
          { name: "OCRexpert", score: 67, ok: true },
        ],
      },
      {
        name: "Infra",
        score: 70,
        systems: [
          { name: "NasDominator", score: 80, ok: true },
          { name: "qnapbackup", score: 60, ok: false },
        ],
      },
      {
        name: "Compl+Test",
        score: 55,
        systems: [
          { name: "Custos", score: 55, ok: false },
          { name: "Panopticor", score: 55, ok: false },
        ],
      },
    ],
  };
}

// ─── TopBar-Komponente ────────────────────────────────────────────────────────

export interface TopBarProps {
  // keine Props — Daten kommen aus React-Query
}

export function TopBar(_props: TopBarProps) {
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const mockMode = useUiStore((s) => s.mockMode);

  const { data } = useQuery<AggregatorHealth>({
    queryKey: ["aggregator", "health"],
    queryFn: async () => {
      const res = await fetch("/api/v1/aggregator/health");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as AggregatorHealth;
    },
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
    retry: 1,
    // Wenn Backend nicht antwortet: Mock-Daten zeigen (Phase 1 — Backend kommt separat)
    placeholderData: mockHealth(),
  });

  const health = data ?? mockHealth();

  const scoreColor =
    health.overall_score >= 70
      ? "text-status-ok"
      : health.overall_score >= 40
        ? "text-status-warn"
        : "text-status-error";

  return (
    <header
      className="sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between
                 border-b border-white/10 bg-bg-elevated/90 px-4 backdrop-blur-md"
      data-testid="topbar"
    >
      {/* Links: Logo */}
      <div className="flex items-center gap-3">
        <Link
          to="/"
          className="flex items-center gap-2 text-sm font-semibold text-fg hover:text-brand"
          aria-label="MOAG Startseite"
        >
          <span className="inline-block h-6 w-6 rounded bg-gradient-to-br from-brand to-status-ok" />
          <span>MOAG</span>
        </Link>

        {mockMode && (
          <span
            className="rounded border border-status-warn/40 bg-status-warn/10 px-1.5 py-0.5
                       text-xxs font-mono uppercase text-status-warn"
            title="Mock-Modus aktiv (?mock=true oder VITE_USE_MOCKS)"
          >
            MOCK
          </span>
        )}
      </div>

      {/* Mitte: Gesamt-Score + Gruppen-Indikatoren (Desktop) */}
      <div className="hidden items-center gap-3 sm:flex">
        {/* Gesamt-Health-Score */}
        <div
          className="flex items-center gap-2 rounded border border-white/10 bg-bg-panel
                     px-3 py-1 text-xs"
          data-testid="overall-score"
          title="Gewichteter Gesamt-Health-Score über alle 8 Sub-Systeme"
        >
          <span className={`text-sm font-bold tabular-nums ${scoreColor}`}>
            {health.overall_score}%
          </span>
          <ScoreBar score={health.overall_score} />
        </div>

        {/* Gruppen-Indikatoren */}
        {health.groups.map((g) => (
          <GroupIndicator key={g.name} group={g} />
        ))}
      </div>

      {/* Mobile: kompaktes Label */}
      <div className="flex items-center gap-2 sm:hidden">
        <span className={`text-sm font-bold tabular-nums ${scoreColor}`}>
          MOAG · {health.overall_score}%
        </span>
      </div>

      {/* Rechts: Alert-Counter + Theme + Settings */}
      <div className="flex items-center gap-2">
        {/* Alert-Counter */}
        {health.alert_count > 0 && (
          <Link
            to="/"
            className="relative rounded border border-status-error/40 bg-status-error/10
                       px-2 py-1 text-xs text-status-error hover:bg-status-error/20"
            title={`${health.alert_count} aktive Alerts`}
            data-testid="alert-counter"
          >
            {health.alert_count} Alert{health.alert_count !== 1 ? "s" : ""}
          </Link>
        )}

        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Light-Mode aktivieren" : "Dark-Mode aktivieren"}
          title={theme === "dark" ? "Light-Mode" : "Dark-Mode"}
          className="rounded border border-white/10 bg-bg-panel px-2 py-1 text-xs text-fg
                     hover:bg-bg-subtle hover:border-white/20"
        >
          {theme === "dark" ? "Hell" : "Dunkel"}
        </button>

        <Link
          to="/settings"
          aria-label="Einstellungen"
          title="Einstellungen"
          className="rounded border border-white/10 bg-bg-panel px-2 py-1 text-xs text-fg
                     hover:bg-bg-subtle hover:border-white/20"
        >
          Settings
        </Link>
      </div>
    </header>
  );
}

export default TopBar;
