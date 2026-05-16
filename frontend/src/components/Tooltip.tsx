// Tooltip — Pflicht-Komponente (ADR-004).
// Desktop: Hover öffnet Floating-Card.
// Mobile: Long-Press (500ms) öffnet dieselbe Card.
// Jede Zahl, jeder Button, jedes Status-Symbol bekommt diesen Tooltip.

import { useState, useRef, useCallback, type ReactNode } from "react";

export interface TooltipContent {
  /** Klartext-Erklärung, deutsch */
  title: string;
  /** Datenquelle, z.B. "/api/v1/aggregator/health" */
  source?: string;
  /** Relative Aktualisierungszeit, z.B. "vor 3s" */
  updatedAt?: string;
  /** Schwellwert-Legende, z.B. "≥70 ✓ · 40–69 ⚠ · <40 ✗" */
  thresholds?: string;
}

export interface TooltipProps extends TooltipContent {
  children: ReactNode;
  /** Positionierung: "bottom" (default) oder "top" */
  position?: "bottom" | "top";
}

export function Tooltip({
  title,
  source,
  updatedAt,
  thresholds,
  children,
  position = "bottom",
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(() => setVisible(true), []);
  const hide = useCallback(() => setVisible(false), []);

  // Long-Press für Mobile
  const onTouchStart = useCallback(() => {
    longPressTimer.current = setTimeout(() => setVisible(true), 500);
  }, []);
  const onTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    // Tooltip nach 2s automatisch wieder ausblenden (Mobile)
    setTimeout(() => setVisible(false), 2000);
  }, []);

  const positionClass =
    position === "top"
      ? "bottom-full mb-2"
      : "top-full mt-2";

  return (
    <span
      className="relative inline-block"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {children}

      {visible && (
        <div
          role="tooltip"
          className={`absolute ${positionClass} left-0 z-50 min-w-[200px] max-w-xs
                      rounded border border-white/10 bg-bg-elevated px-3 py-2
                      shadow-xl text-xs`}
          data-testid="tooltip-card"
        >
          <p className="font-semibold text-fg">{title}</p>

          {(source || updatedAt || thresholds) && (
            <div className="mt-1.5 space-y-0.5 border-t border-white/10 pt-1.5">
              {source && (
                <p className="font-mono text-xxs text-fg-subtle">
                  <span className="text-fg-muted">Quelle: </span>
                  {source}
                </p>
              )}
              {updatedAt && (
                <p className="text-xxs text-fg-muted">
                  <span className="text-fg-subtle">Aktualisiert: </span>
                  {updatedAt}
                </p>
              )}
              {thresholds && (
                <p className="text-xxs text-fg-muted">
                  <span className="text-fg-subtle">Schwellwerte: </span>
                  {thresholds}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </span>
  );
}

export default Tooltip;
