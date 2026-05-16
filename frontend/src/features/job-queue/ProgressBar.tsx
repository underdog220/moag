// ProgressBar — wiederverwendbare zweistufige Fortschrittsanzeige.
// Outer: Prozent / Seite X/Y
// Optional: kleine Engine-Sub-Step-Punkte (engine done/running)

import type { PerEngine } from "./jobStore";

export interface ProgressBarProps {
  /** Prozent 0..100 */
  pct: number;
  /** Aktuelle Seite (1-basiert) — wenn nicht gesetzt, kein Seitentext. */
  pageDone?: number;
  pageTotal?: number;
  /** Optional: Engine-Sub-Steps fuer die aktuelle Seite. */
  engineStatus?: PerEngine[];
  /** Wenn true: rote Bar (failed). */
  failed?: boolean;
  /** Wenn true: gruene Bar (done). */
  done?: boolean;
  /** Wenn true: Native-Text-Layer-Hint statt Engine-Liste anzeigen. */
  nativeTextLayer?: boolean;
  /** Aktuell aktive Engines (laufend). */
  enginesActive?: string[];
}

const ENGINE_SYMBOL: Record<string, string> = {
  pending: "...",
  running: "...",
  done: "OK",
  failed: "X",
};

export function ProgressBar({
  pct,
  pageDone,
  pageTotal,
  engineStatus,
  failed,
  done,
  nativeTextLayer,
  enginesActive,
}: ProgressBarProps) {
  const safePct = Math.max(0, Math.min(100, Math.round(pct)));
  const barColor = failed
    ? "bg-status-error"
    : done
      ? "bg-status-ok"
      : "bg-brand";

  return (
    <div className="flex flex-col gap-1" data-testid="progress-bar">
      <div className="h-2 w-full overflow-hidden rounded bg-white/5">
        <div
          data-testid="progress-bar-fill"
          className={`h-full transition-all ${barColor}`}
          style={{ width: `${safePct}%` }}
          role="progressbar"
          aria-valuenow={safePct}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
      <div className="flex items-center justify-between text-xxs text-fg-muted">
        <span>
          {pageTotal && pageTotal > 0
            ? `Seite ${pageDone ?? 0}/${pageTotal}`
            : `${safePct} %`}
        </span>
        {nativeTextLayer ? (
          <span data-testid="native-pdf-hint" className="italic text-fg-muted">
            Text-Layer aus PDF, kein OCR
          </span>
        ) : engineStatus && engineStatus.length > 0 ? (
          <span className="flex flex-wrap gap-1" data-testid="engine-status">
            {engineStatus.map((s) => (
              <span
                key={s.engine}
                title={`${s.engine}: ${s.status}${s.confidence ? ` (${(s.confidence * 100).toFixed(0)}%)` : ""}`}
                className={
                  s.status === "done"
                    ? "text-status-ok"
                    : s.status === "failed"
                      ? "text-status-error"
                      : "text-fg-muted"
                }
              >
                {s.engine} {ENGINE_SYMBOL[s.status] ?? "?"}
              </span>
            ))}
          </span>
        ) : enginesActive && enginesActive.length > 0 ? (
          <span className="text-fg-muted" data-testid="engines-active">
            {enginesActive.join(" + ")} ...
          </span>
        ) : null}
      </div>
    </div>
  );
}

export default ProgressBar;
