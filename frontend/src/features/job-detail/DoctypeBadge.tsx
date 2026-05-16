// Doctype-Badge mit Two-Stage-Konfidenz (Text + Layout) und Top-3-Alternativen.
// Quelle: ocrexpert/identify/two_stage.py — Voting aus Text-/Layout-Pipeline.

import { useState } from "react";
import { formatConfidence } from "../../lib/format";
import type { DoctypeAlternative } from "../../lib/types";

export interface DoctypeBadgeProps {
  doctype: string | null;
  confidence: number | null;
  textScore?: number;
  layoutScore?: number;
  alternatives?: DoctypeAlternative[];
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100);
  // Farbskala — gruen ab 80%, gelb 60-80, rot < 60
  const color = pct >= 80 ? "bg-status-ok" : pct >= 60 ? "bg-status-warn" : "bg-status-error";
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-16 shrink-0 text-fg-muted">{label}</span>
      <div className="relative h-2 flex-1 overflow-hidden rounded bg-bg-elevated">
        <div
          data-testid={`doctype-bar-${label.toLowerCase()}`}
          className={`h-full ${color} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-12 shrink-0 text-right font-mono text-fg">{pct}%</span>
    </div>
  );
}

export function DoctypeBadge({
  doctype,
  confidence,
  textScore,
  layoutScore,
  alternatives,
}: DoctypeBadgeProps) {
  const [tooltipOpen, setTooltipOpen] = useState(false);

  if (!doctype) {
    return (
      <div data-testid="doctype-badge-empty" className="text-sm text-fg-muted">
        Doctype: noch nicht klassifiziert
      </div>
    );
  }

  return (
    <div
      data-testid="doctype-badge"
      className="flex flex-col gap-2 rounded-lg border border-white/5 bg-bg-elevated p-3"
    >
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div className="text-xxs uppercase tracking-wide text-fg-muted">Doctype</div>
          <div className="text-base font-semibold text-fg">{doctype}</div>
        </div>
        <div
          className="relative cursor-help text-right"
          onMouseEnter={() => setTooltipOpen(true)}
          onMouseLeave={() => setTooltipOpen(false)}
          onFocus={() => setTooltipOpen(true)}
          onBlur={() => setTooltipOpen(false)}
          tabIndex={0}
        >
          <div className="text-xxs uppercase tracking-wide text-fg-muted">Konfidenz</div>
          <div className="text-base font-mono font-semibold text-status-ok">
            {formatConfidence(confidence)}
          </div>
          {tooltipOpen && alternatives && alternatives.length > 0 && (
            <div
              data-testid="doctype-alternatives-tooltip"
              role="tooltip"
              className="absolute right-0 top-full z-20 mt-1 w-56 rounded border border-white/10
                         bg-bg-panel p-2 text-left text-xs text-fg shadow-lg"
            >
              <div className="mb-1 text-xxs uppercase tracking-wide text-fg-muted">
                Top-Alternativen
              </div>
              <ul className="space-y-1">
                {alternatives.slice(0, 3).map((alt) => (
                  <li
                    key={alt.label}
                    className="flex items-center justify-between gap-2 font-mono"
                  >
                    <span className="truncate">{alt.label}</span>
                    <span className="text-fg-muted">{formatConfidence(alt.score)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
      {(textScore != null || layoutScore != null) && (
        <div className="flex flex-col gap-1">
          {textScore != null && <ScoreBar label="Text" value={textScore} />}
          {layoutScore != null && <ScoreBar label="Layout" value={layoutScore} />}
        </div>
      )}
    </div>
  );
}

export default DoctypeBadge;
