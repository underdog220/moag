// SmokeIndicator — kompakter Header-Badge fuer den Oberon-Live-Health-Snapshot.
//
// Zeigt Ergebnis von GET /api/cockpit/smoke als farbiges Pill:
//   PASS    → "● Oberon OK"           — gruenes Pill
//   WARN    → "● Oberon DEGRADED 5/6" — gelbes Pill
//   FAIL    → "● Oberon DOWN 3/6"     — rotes Pill
//   loading → "● Oberon ???"          — neutrales Pill
//   error   → "● Oberon ???"          — neutrales Pill
//
// Klick/Hover: Title-Attribut listet alle Sub-Checks auf.
// Refresh: alle 30 Sekunden (konfigurierbar per refetchInterval).

import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { qk } from "../lib/queryKeys";
import type { CockpitSmokeCheck, SmokeResponse } from "../lib/types";

// ── Hilfsfunktionen ─────────────────────────────────────────────────────────

function buildTooltip(suites: CockpitSmokeCheck[]): string {
  return suites
    .map((s) => {
      const icon = s.status === "PASS" ? "+" : s.status === "WARN" ? "~" : "!";
      const err = s.error ? ` — ${s.error}` : "";
      return `[${icon}] ${s.name}${err}`;
    })
    .join("\n");
}

interface PillConfig {
  /** Tailwind-Klassen fuer das Pill */
  className: string;
  /** Angezeigter Text */
  label: string;
}

function buildPill(data: SmokeResponse | undefined, isLoading: boolean): PillConfig {
  if (isLoading || !data) {
    return {
      className:
        "border border-white/10 bg-bg-panel text-fg-muted",
      label: "● Oberon ???",
    };
  }

  const { verdict, pass, total } = data.summary;

  if (verdict === "PASS") {
    return {
      className:
        "border border-status-ok/30 bg-status-ok/10 text-status-ok",
      label: "● Oberon OK",
    };
  }

  if (verdict === "WARN") {
    return {
      className:
        "border border-status-warn/30 bg-status-warn/10 text-status-warn",
      label: `● Oberon DEGRADED ${pass}/${total}`,
    };
  }

  // FAIL oder unbekannter Verdict
  return {
    className:
      "border border-status-error/30 bg-status-error/10 text-status-error",
    label: `● Oberon DOWN ${pass}/${total}`,
  };
}

// ── Komponente ───────────────────────────────────────────────────────────────

export interface SmokeIndicatorProps {
  /** Polling-Intervall in ms (default: 30 000). */
  refetchInterval?: number;
}

export function SmokeIndicator({ refetchInterval = 30_000 }: SmokeIndicatorProps) {
  const { data, isLoading } = useQuery({
    queryKey: qk.cockpit.smoke,
    queryFn: () => api.getCockpitSmoke(),
    refetchInterval,
    refetchIntervalInBackground: false,
    retry: 1,
    // Kein suspense — wir rendern immer, auch im Loading-Zustand.
  });

  const pill = buildPill(data, isLoading);
  const tooltip = data?.suites ? buildTooltip(data.suites) : "Oberon Smoke-Status wird geladen …";

  return (
    <span
      data-testid="smoke-indicator"
      title={tooltip}
      className={`inline-flex cursor-default select-none items-center rounded
                  px-2 py-0.5 text-xs font-medium transition-colors
                  ${pill.className}`}
    >
      {pill.label}
    </span>
  );
}

export default SmokeIndicator;
