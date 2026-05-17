// OCRexpert Logs-Seite.
// Tail-Anzeige der letzten N Zeilen der OCRexpert-Pipeline-Logs.
// Auto-Refresh alle 5s. Copy-Button (Clipboard-API). Anzahl-Selector.
//
// Datenquelle: GET /api/v1/ocrexpert/logs?n=100

import { useCallback, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageBadge } from "../../../components/PageBadge";
import { Tooltip } from "../../../components/Tooltip";

// ─── Anzahl-Optionen ─────────────────────────────────────────────────────────

const LINE_OPTIONS = [50, 100, 200, 500] as const;
type LineCount = (typeof LINE_OPTIONS)[number];

// ─── Fetch-Funktion ───────────────────────────────────────────────────────────

async function fetchLogs(n: number): Promise<string> {
  const res = await fetch(`/api/v1/ocrexpert/logs?n=${n}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// ─── Logs-Page ────────────────────────────────────────────────────────────────

export function LogsPage() {
  const [lineCount, setLineCount] = useState<LineCount>(100);
  const [copied, setCopied] = useState(false);
  const logRef = useRef<HTMLPreElement>(null);

  const { data, isLoading, isError, error, dataUpdatedAt } = useQuery<string>({
    queryKey: ["ocrexpert", "logs", lineCount],
    queryFn: () => fetchLogs(lineCount),
    refetchInterval: 5_000,
    staleTime: 4_000,
  });

  const handleCopy = useCallback(async () => {
    const text = data ?? "";
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: Selection
      if (logRef.current) {
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(logRef.current);
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
  }, [data]);

  const lines = data?.split("\n").filter(Boolean) ?? [];
  const updatedStr =
    dataUpdatedAt > 0
      ? `vor ${Math.round((Date.now() - dataUpdatedAt) / 1000)}s aktualisiert`
      : "";

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-fg">OCRexpert — Logs</h2>
          {isLoading && (
            <span className="text-xs text-fg-muted">Wird geladen…</span>
          )}
          {!isLoading && updatedStr && (
            <Tooltip
              title="Auto-Refresh alle 5 Sekunden"
              source="/api/v1/ocrexpert/logs"
              updatedAt={updatedStr}
            >
              <span className="text-xs text-fg-subtle">{updatedStr}</span>
            </Tooltip>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Anzahl-Selector */}
          <Tooltip
            title="Anzahl der angezeigten Log-Zeilen (letzte N Zeilen)"
            source="/api/v1/ocrexpert/logs?n=N"
          >
            <label className="flex items-center gap-1.5 text-xs text-fg-muted">
              Zeilen:
              <select
                value={lineCount}
                onChange={(e) => setLineCount(Number(e.target.value) as LineCount)}
                className="rounded border border-white/10 bg-bg-elevated px-2 py-1
                           text-xs text-fg focus:outline-none focus:ring-1 focus:ring-brand/50"
              >
                {LINE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </Tooltip>

          {/* Copy-Button (Clipboard-API Pflicht aus globaler CLAUDE.md) */}
          <Tooltip
            title="Log-Inhalt in die Zwischenablage kopieren (fuer KI-Diagnose)"
            source="/api/v1/ocrexpert/logs"
          >
            <button
              type="button"
              onClick={() => void handleCopy()}
              disabled={!data}
              className="rounded border border-white/10 bg-bg-elevated px-3 py-1.5
                         text-xs text-fg-muted transition-colors hover:text-fg
                         disabled:cursor-not-allowed disabled:opacity-40"
            >
              {copied ? "Kopiert!" : "Kopieren"}
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Fehleranzeige */}
      {isError && (
        <p className="rounded border border-status-error/30 bg-status-error/10 px-3 py-2
                      text-sm text-status-error">
          Fehler beim Laden: {(error as Error).message}
        </p>
      )}

      {/* Log-Anzeige */}
      <div
        className="relative rounded-lg border border-white/10 bg-bg-panel"
      >
        {/* Zeilen-Zaehler oben rechts */}
        <Tooltip
          title={`${lines.length} Log-Zeilen (letzte ${lineCount} angefragt). Auto-Refresh alle 5s.`}
          source="/api/v1/ocrexpert/logs"
          thresholds="Keine Schwellwerte — reine Anzeige"
        >
          <span className="absolute right-2 top-2 rounded border border-white/5
                           bg-bg-elevated px-1.5 py-0.5 font-mono text-xxs text-fg-subtle">
            {lines.length} Zeilen
          </span>
        </Tooltip>

        <pre
          ref={logRef}
          data-testid="ocrexpert-logs-pre"
          className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap break-all
                     p-4 pt-8 font-mono text-xs text-fg-muted leading-relaxed"
        >
          {data
            ? data
            : isLoading
              ? "Wird geladen…"
              : "(keine Logs vorhanden)"}
        </pre>
      </div>

      <PageBadge id="ocrexpert.logs" />
    </div>
  );
}

export default LogsPage;
