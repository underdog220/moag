// EdgeLogTail — Tail der letzten 50 Hub-Edge-Log-Events.
// Pflicht aus globaler CLAUDE.md (UI-Sichtbarkeit + Pipeline-Logging-Compliance):
//   - monospace-Font fuer Log-Stil
//   - Clipboard-Copy-Button mit Toast-Feedback ("Kopiert" 2s)
//   - Auto-Scroll-To-Bottom-Toggle (Briefing C UX-Punkt)
//   - Live-Update via WS "edge_log"-Events
//   - Tolerante Anzeige (leeres Log -> "Noch keine Events")

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { api } from "../../lib/api";
import { qk } from "../../lib/queryKeys";
import { useWebSocket } from "../../lib/ws";
import type { EdgeLogEvent, LogLevel, WsEvent } from "../../lib/types";

export interface EdgeLogTailProps {
  /** Maximal anzuzeigende Events (Default 50, Briefing C). */
  limit?: number;
  /** Polling-Fallback wenn WS nicht laeuft. */
  refetchIntervalMs?: number;
}

const LEVEL_COLOR: Record<LogLevel, string> = {
  DEBUG: "text-fg-subtle",
  INFO: "text-fg-muted",
  WARN: "text-status-warn",
  ERROR: "text-status-error",
};

function formatTs(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toISOString().slice(11, 19); // HH:MM:SS UTC
  } catch {
    return iso;
  }
}

function formatLogLine(ev: EdgeLogEvent): string {
  return `[${ev.ts}] ${ev.level.padEnd(5)} ${ev.source}: ${ev.message}`;
}

export function EdgeLogTail({ limit = 50, refetchIntervalMs = 15_000 }: EdgeLogTailProps) {
  const logQuery = useQuery({
    queryKey: qk.cluster.edgeLog,
    queryFn: () => api.getEdgeLog(),
    refetchInterval: refetchIntervalMs,
    refetchIntervalInBackground: false,
    retry: 1,
  });

  // Live-Patches aus WS — werden vorne angehaengt, nach `limit` getrimmt.
  const [liveEvents, setLiveEvents] = useState<EdgeLogEvent[]>([]);

  useWebSocket({
    onEvent: (ev: WsEvent) => {
      if (ev.type !== "edge_log") return;
      const e = ev as Extract<WsEvent, { type: "edge_log" }>;
      const next: EdgeLogEvent = {
        ts: e.ts ?? new Date().toISOString(),
        level: (e.level ?? "INFO") as LogLevel,
        source: e.source ?? "?",
        message: e.message ?? "",
      };
      setLiveEvents((prev) => [next, ...prev].slice(0, limit));
    },
  });

  // Merge Server-Liste + Live-Events; dedupe per (ts, source, message).
  const merged = useMemo<EdgeLogEvent[]>(() => {
    const fromServer = logQuery.data?.events ?? [];
    const seen = new Set<string>();
    const out: EdgeLogEvent[] = [];
    for (const ev of [...liveEvents, ...fromServer]) {
      const key = `${ev.ts}|${ev.source}|${ev.message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(ev);
      if (out.length >= limit) break;
    }
    return out;
  }, [liveEvents, logQuery.data, limit]);

  // Auto-Scroll-To-Bottom (Briefing C UX-Punkt: oben rechts kleine Checkbox).
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!autoScroll) return;
    const el = scrollRef.current;
    if (!el) return;
    // Server-Reihenfolge ist neueste zuerst -> "bottom" ist hier "top" in der DOM-Liste.
    // Wir scrollen nach unten in der Anzeige (= zu den juengsten Events).
    el.scrollTop = 0;
  }, [merged, autoScroll]);

  // Clipboard-Copy mit Toast.
  const [toast, setToast] = useState<string | null>(null);
  const handleCopy = useCallback(async () => {
    const text = merged.map(formatLogLine).join("\n");
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback fuer Inkognito / alte Browser
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        try {
          document.execCommand("copy");
        } finally {
          document.body.removeChild(ta);
        }
      }
      setToast("Kopiert");
    } catch (e) {
      setToast(`Fehler: ${(e as Error).message}`);
    }
    window.setTimeout(() => setToast(null), 2_000);
  }, [merged]);

  if (logQuery.isLoading) {
    return (
      <Card title="Edge-Log">
        <LoadingSpinner label="Edge-Log wird geladen..." />
      </Card>
    );
  }

  if (logQuery.isError) {
    return (
      <Card title="Edge-Log">
        <EmptyState
          title="Edge-Log konnte nicht geladen werden"
          description={(logQuery.error as Error).message}
        />
      </Card>
    );
  }

  if (merged.length === 0) {
    return (
      <Card title="Edge-Log">
        <EmptyState
          title="Noch keine Events"
          description="Der Hub hat noch keine Edge-Log-Eintraege geliefert."
        />
      </Card>
    );
  }

  return (
    <Card
      title="Edge-Log"
      description={`${merged.length} Events · letzte ${limit} · Live via WS`}
      actions={
        <div className="flex items-center gap-2">
          <label
            className="flex cursor-pointer items-center gap-1 text-xxs text-fg-muted"
            data-testid="edge-log-autoscroll-label"
          >
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="h-3 w-3 accent-brand"
              data-testid="edge-log-autoscroll-toggle"
            />
            Auto-Scroll
          </label>
          <button
            type="button"
            onClick={handleCopy}
            className="rounded border border-white/10 bg-bg-panel px-2 py-0.5 text-xxs
                       text-fg-muted hover:border-brand/40 hover:text-brand"
            data-testid="edge-log-copy"
            title="Alle Events in die Zwischenablage kopieren"
          >
            Kopieren
          </button>
          {toast && (
            <span
              role="status"
              className="rounded border border-brand/40 bg-brand/10 px-2 py-0.5
                         text-xxs font-mono uppercase text-brand"
              data-testid="edge-log-toast"
            >
              {toast}
            </span>
          )}
        </div>
      }
    >
      <div
        ref={scrollRef}
        className="max-h-72 overflow-y-auto rounded border border-white/5 bg-bg-elevated/40
                   p-2 font-mono text-xxs"
        data-testid="edge-log-tail"
      >
        <ul className="space-y-0.5">
          {merged.map((ev, idx) => (
            <li
              key={`${ev.ts}-${idx}`}
              className="flex items-start gap-2"
              data-testid={`edge-log-line-${idx}`}
              data-level={ev.level}
            >
              <span className="shrink-0 tabular-nums text-fg-subtle">{formatTs(ev.ts)}</span>
              <span
                className={`shrink-0 w-12 font-semibold uppercase ${
                  LEVEL_COLOR[ev.level] ?? "text-fg-muted"
                }`}
              >
                {ev.level}
              </span>
              <span className="shrink-0 w-32 truncate text-fg-muted" title={ev.source}>
                {ev.source}
              </span>
              <span className="break-all text-fg">{ev.message}</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

export default EdgeLogTail;
