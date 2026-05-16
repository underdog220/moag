// EdgeLogPanel — Hub-Event-Tail (Live-Scroll).
// - Initial-Load via api.getEdgeLog
// - WS-Stream: edge_log-Events ans Ende
// - Filter Level: ALL / DEBUG / INFO / WARN / ERROR
// - Auto-Scroll-Toggle (Default: an)
// - Clipboard-Copy-Button mit Toast (Pflicht aus globaler CLAUDE.md)

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/api";
import { useWebSocket } from "../../lib/ws";
import { toast } from "../../lib/toast";
import type { EdgeLogEvent, LogLevel } from "../../lib/types";
import { formatDateTime } from "../../lib/format";

const LEVELS: ("ALL" | LogLevel)[] = ["ALL", "DEBUG", "INFO", "WARN", "ERROR"];

const LEVEL_COLOR: Record<LogLevel, string> = {
  DEBUG: "text-fg-subtle",
  INFO: "text-fg-muted",
  WARN: "text-status-warn",
  ERROR: "text-status-error",
};

const MAX_BUFFER = 500;

export interface EdgeLogPanelProps {
  /** Test-Hook: vorgespeiste Events. */
  seedEvents?: EdgeLogEvent[];
  /** Auto-Scroll-Default. Default true. */
  autoScrollDefault?: boolean;
  /** Test-Hook: clipboard.writeText. Default navigator.clipboard.writeText. */
  copyImpl?: (text: string) => Promise<void>;
}

export function EdgeLogPanel({
  seedEvents,
  autoScrollDefault = true,
  copyImpl,
}: EdgeLogPanelProps) {
  const [events, setEvents] = useState<EdgeLogEvent[]>(seedEvents ?? []);
  const [filter, setFilter] = useState<"ALL" | LogLevel>("ALL");
  const [autoScroll, setAutoScroll] = useState(autoScrollDefault);
  const scrollRef = useRef<HTMLDivElement>(null);
  const initialLoadedRef = useRef(false);

  // Initial-Load
  useEffect(() => {
    if (seedEvents) return; // Tests speisen direkt
    if (initialLoadedRef.current) return;
    initialLoadedRef.current = true;
    api
      .getEdgeLog()
      .then((res) => {
        setEvents((prev) => mergeEvents(prev, res.events ?? []));
      })
      .catch(() => {
        // Stiller Fail — Live-Stream bleibt
      });
  }, [seedEvents]);

  // Live WS-Stream
  useWebSocket({
    onEvent: (ev) => {
      if ((ev as { type?: string }).type !== "edge_log") return;
      const e = ev as { ts?: string; level?: LogLevel; source?: string; message?: string };
      setEvents((prev) => {
        const next = [
          ...prev,
          {
            ts: e.ts ?? new Date().toISOString(),
            level: (e.level ?? "INFO") as LogLevel,
            source: e.source ?? "?",
            message: e.message ?? "",
          },
        ];
        // FIFO-Cap
        return next.length > MAX_BUFFER ? next.slice(next.length - MAX_BUFFER) : next;
      });
    },
  });

  // Auto-Scroll
  useEffect(() => {
    if (!autoScroll || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [events, autoScroll]);

  const filtered = useMemo(() => {
    if (filter === "ALL") return events;
    return events.filter((e) => e.level === filter);
  }, [events, filter]);

  const handleCopy = useCallback(async () => {
    const lines = filtered.map(
      (e) => `${e.ts} [${e.level}] ${e.source}: ${e.message}`,
    );
    const text = lines.join("\n");
    try {
      const writer = copyImpl ?? navigator.clipboard?.writeText.bind(navigator.clipboard);
      if (!writer) {
        throw new Error("Clipboard-API nicht verfuegbar");
      }
      await writer(text);
      toast.success(`${filtered.length} Zeilen in Zwischenablage kopiert`);
    } catch (err) {
      toast.error(`Kopieren fehlgeschlagen: ${(err as Error).message}`);
    }
  }, [copyImpl, filtered]);

  return (
    <div className="flex h-full flex-col gap-2" data-testid="edge-log-panel">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {LEVELS.map((lv) => (
            <button
              key={lv}
              type="button"
              data-testid={`edge-filter-${lv}`}
              onClick={() => setFilter(lv)}
              className={`rounded px-2 py-0.5 text-xxs ${
                filter === lv
                  ? "bg-brand/20 text-brand"
                  : "bg-white/5 text-fg-muted hover:bg-white/10"
              }`}
            >
              {lv}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-xxs text-fg-muted">
            <input
              type="checkbox"
              data-testid="edge-autoscroll"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
            />
            Auto-Scroll
          </label>
          <button
            type="button"
            data-testid="edge-copy"
            onClick={handleCopy}
            className="rounded border border-white/10 bg-white/5 px-2 py-0.5 text-xxs text-fg hover:bg-white/10"
          >
            Kopieren
          </button>
        </div>
      </div>

      {/* Log-Liste */}
      <div
        ref={scrollRef}
        data-testid="edge-log-list"
        className="min-h-32 max-h-96 flex-1 overflow-y-auto rounded border border-white/5 bg-bg-elevated/40 p-2 font-mono text-xxs"
      >
        {filtered.length === 0 ? (
          <div className="text-fg-subtle">Keine Events.</div>
        ) : (
          filtered.map((e, i) => (
            <div
              key={`${e.ts}-${i}`}
              data-testid="edge-log-row"
              data-level={e.level}
              className="flex gap-2"
            >
              <span className="shrink-0 text-fg-subtle">{formatDateTime(e.ts)}</span>
              <span className={`shrink-0 ${LEVEL_COLOR[e.level] ?? ""}`}>
                [{e.level}]
              </span>
              <span className="shrink-0 text-fg-muted">{e.source}:</span>
              <span className="break-all text-fg">{e.message}</span>
            </div>
          ))
        )}
      </div>

      <div className="text-xxs text-fg-subtle">
        {filtered.length} / {events.length} Events
      </div>
    </div>
  );
}

function mergeEvents(prev: EdgeLogEvent[], incoming: EdgeLogEvent[]): EdgeLogEvent[] {
  // Stupide concat (Server liefert bereits sortiert nach ts), FIFO-Cap
  const next = [...prev, ...incoming];
  return next.length > MAX_BUFFER ? next.slice(next.length - MAX_BUFFER) : next;
}

export default EdgeLogPanel;
