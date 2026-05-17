// ResultPanel — kollabierbares Ergebnis-Panel für eine Upload-Operation.
// Zeigt completed/failed-Zustand mit Summary + Payload + Artifact-Link.

import { useState } from "react";
import type { UploadResult } from "../../lib/types";
import { api } from "../../lib/api";

export interface ResultPanelProps {
  result: UploadResult;
  /** Default: eingeklappt (false) */
  defaultOpen?: boolean;
}

export function ResultPanel({ result, defaultOpen = true }: ResultPanelProps) {
  const [open, setOpen] = useState(defaultOpen);

  const isCompleted = result.status === "completed";
  const isFailed = result.status === "failed";
  const isPending =
    result.status === "queued" || result.status === "processing";

  return (
    <div
      data-testid={`result-panel-${result.upload_id}`}
      className="mt-3 rounded-lg border border-white/10 bg-bg-elevated text-xs"
    >
      {/* Header: Status-Label + Toggle */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2
                   text-left transition-colors hover:bg-white/5
                   focus:outline-none focus:ring-1 focus:ring-brand/40 rounded-lg"
        aria-expanded={open}
      >
        <span
          className={`font-medium ${
            isFailed
              ? "text-status-error"
              : isCompleted
                ? "text-status-ok"
                : "text-fg-muted"
          }`}
        >
          {isPending && (
            <span className="inline-flex items-center gap-1.5">
              <span
                className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white"
                aria-hidden="true"
              />
              {result.status === "queued" ? "Warteschlange…" : "Verarbeitung…"}
            </span>
          )}
          {isCompleted && "Abgeschlossen"}
          {isFailed && "Fehler"}
        </span>
        <span className="flex items-center gap-2 text-fg-subtle">
          {result.duration_ms != null && isCompleted && (
            <span>{result.duration_ms}ms</span>
          )}
          <span aria-hidden="true">{open ? "▲" : "▼"}</span>
        </span>
      </button>

      {/* Body */}
      {open && (
        <div className="border-t border-white/10 px-3 py-3 space-y-2">
          {/* Summary */}
          {result.result_summary && (
            <p className="font-medium text-fg">{result.result_summary}</p>
          )}

          {/* Fehler-Box */}
          {isFailed && result.error && (
            <div
              data-testid={`result-error-${result.upload_id}`}
              className="rounded border border-status-error/30 bg-status-error/10
                         px-3 py-2 text-status-error"
            >
              {result.error}
            </div>
          )}

          {/* Artifact-Download */}
          {isCompleted && result.artifact_url && (
            <a
              href={api.upload.artifactUrl(result.upload_id)}
              download
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10
                         bg-bg-subtle px-3 py-2 text-xs font-medium text-fg
                         hover:border-white/20 hover:bg-bg-elevated transition-colors"
              data-testid={`result-artifact-${result.upload_id}`}
            >
              ↓ Artifact herunterladen
              {result.artifact_mime && (
                <span className="text-fg-muted">({result.artifact_mime})</span>
              )}
            </a>
          )}

          {/* Payload als JSON (nur wenn nicht leer) */}
          {isCompleted &&
            result.result_payload &&
            Object.keys(result.result_payload).length > 0 && (
              <details className="mt-1">
                <summary className="cursor-pointer text-fg-subtle hover:text-fg-muted">
                  Rohdaten anzeigen
                </summary>
                <pre
                  data-testid={`result-payload-${result.upload_id}`}
                  className="mt-2 overflow-x-auto rounded border border-white/5
                             bg-bg-panel p-2 text-xxs text-fg-muted"
                >
                  {JSON.stringify(result.result_payload, null, 2)}
                </pre>
              </details>
            )}
        </div>
      )}
    </div>
  );
}

export default ResultPanel;
