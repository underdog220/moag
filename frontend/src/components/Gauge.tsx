// Gauge — Cockpit-Gauge-Komponente (hero + mini).
// Hero: ~80px Kreis mit Zahl in der Mitte, Farbring.
// Mini: kleiner Halbbogen oder Balken.
// Alle Gauges haben Tooltip-Pflicht (ADR-004).

import { Tooltip, type TooltipContent } from "./Tooltip";

export interface GaugeProps {
  /** 0..100 */
  value: number;
  /** hero ≈ 80px, mini ≈ 24px */
  variant: "hero" | "mini";
  label?: string;
  /** Pflicht — Gauges sind Zahlen, brauchen Tooltip */
  tooltip?: TooltipContent;
  thresholds?: { warn: number; bad: number };
  /** data-testid für Tests */
  testId?: string;
}

const DEFAULT_THRESHOLDS = { warn: 70, bad: 40 };

function getColor(value: number, thresholds: { warn: number; bad: number }): string {
  if (value >= thresholds.warn) return "#22c55e"; // status-ok grün
  if (value >= thresholds.bad) return "#eab308";  // status-warn gelb
  return "#ef4444";                                // status-error rot
}

// ─── Hero-Gauge (SVG-Kreis) ───────────────────────────────────────────────────

function HeroGauge({ value, label, thresholds = DEFAULT_THRESHOLDS, testId }: GaugeProps) {
  const color = getColor(value, thresholds);
  const size = 80;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const arc = circumference * (value / 100);

  return (
    <div
      className="flex flex-col items-center gap-1"
      data-testid={testId ?? "gauge-hero"}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-label={`${label ?? "Score"}: ${value}%`}
        role="img"
      >
        {/* Hintergrund-Ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={stroke}
        />
        {/* Wert-Ring (Uhrzeigersinn von oben) */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${arc} ${circumference - arc}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dasharray 0.5s ease" }}
        />
        {/* Zahl */}
        <text
          x={size / 2}
          y={size / 2 + 5}
          textAnchor="middle"
          fill={color}
          fontSize="16"
          fontWeight="700"
          fontFamily="JetBrains Mono, Consolas, monospace"
        >
          {value}
        </text>
      </svg>
      {label && (
        <span className="text-xxs text-fg-muted">{label}</span>
      )}
    </div>
  );
}

// ─── Mini-Gauge (Balken) ──────────────────────────────────────────────────────

function MiniGauge({ value, label, thresholds = DEFAULT_THRESHOLDS, testId }: GaugeProps) {
  const color = getColor(value, thresholds);
  const colorClass =
    value >= thresholds.warn ? "bg-status-ok" : value >= thresholds.bad ? "bg-status-warn" : "bg-status-error";

  return (
    <div
      className="flex items-center gap-1.5"
      data-testid={testId ?? "gauge-mini"}
      aria-label={`${label ?? "Score"}: ${value}%`}
    >
      {label && <span className="text-xxs text-fg-subtle">{label}</span>}
      <div className="h-1.5 w-16 rounded-full bg-white/10">
        <div
          className={`h-1.5 rounded-full ${colorClass}`}
          style={{ width: `${value}%`, transition: "width 0.4s ease" }}
        />
      </div>
      <span
        className="tabular-nums text-xxs font-semibold"
        style={{ color }}
      >
        {value}%
      </span>
    </div>
  );
}

// ─── Wrapper mit optionalem Tooltip ──────────────────────────────────────────

export function Gauge(props: GaugeProps) {
  const inner = props.variant === "hero"
    ? <HeroGauge {...props} />
    : <MiniGauge {...props} />;

  if (props.tooltip) {
    return <Tooltip {...props.tooltip}>{inner}</Tooltip>;
  }
  return inner;
}

export default Gauge;
