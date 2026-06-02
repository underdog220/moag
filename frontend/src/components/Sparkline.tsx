// Sparkline + Lastverlauf-Chart für die Hardware-Historie.
//
// WICHTIG: gerendert wird auf einer ECHTEN Zeitachse (x = Timestamp), nicht über
// den Punkt-Index. Damit sind unregelmäßige Abstände — wie sie bei
// lastabhängig getakteten Heartbeats entstehen — korrekt dargestellt.
// null-Werte (keine Telemetrie, z.B. AMD-GPU-Last) unterbrechen die Linie.

import type { HwHistorySample } from "../lib/types";

type LoadField = "gpu" | "cpu";

interface Pt {
  t: number; // epoch ms
  v: number | null;
}

// Baut SVG-Pfad-Segmente; bricht bei null in mehrere Teilpfade auf.
function buildSegments(
  pts: Pt[],
  w: number,
  h: number,
  yMin: number,
  yMax: number,
): string[] {
  if (pts.length === 0) return [];
  const tMin = pts[0].t;
  const tMax = pts[pts.length - 1].t;
  const tSpan = tMax - tMin || 1;
  const ySpan = yMax - yMin || 1;
  const x = (t: number) => ((t - tMin) / tSpan) * w;
  const y = (v: number) =>
    h - ((Math.min(Math.max(v, yMin), yMax) - yMin) / ySpan) * h;

  const segs: string[] = [];
  let cur: string[] = [];
  for (const p of pts) {
    if (p.v == null) {
      if (cur.length > 1) segs.push(cur.join(" "));
      cur = [];
      continue;
    }
    cur.push(`${cur.length ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`);
  }
  if (cur.length > 1) segs.push(cur.join(" "));
  return segs;
}

function toPts(samples: HwHistorySample[], field: LoadField): Pt[] {
  return samples
    .map((s) => ({ t: Date.parse(s.at), v: s[field] }))
    .filter((p) => !Number.isNaN(p.t));
}

function loadColorHex(v: number | null | undefined): string {
  if (v == null) return "#64748b";
  if (v > 90) return "#f87171"; // status-error
  if (v > 70) return "#fbbf24"; // status-warn
  return "#34d399"; // status-ok
}

// ─── Mini-Sparkline (Tooltip) ─────────────────────────────────────────────────

export function Sparkline({
  samples,
  field,
  width = 132,
  height = 30,
}: {
  samples: HwHistorySample[];
  field: LoadField;
  width?: number;
  height?: number;
}) {
  const pts = toPts(samples, field);
  const hasData = pts.some((p) => p.v != null);
  if (pts.length < 2 || !hasData) {
    return <span className="text-xxs text-fg-subtle">zu wenig Verlauf</span>;
  }
  const yMin = 0;
  const yMax = 100;
  const segs = buildSegments(pts, width, height, yMin, yMax);
  const last = [...pts].reverse().find((p) => p.v != null)!;
  const color = loadColorHex(last.v);
  const tMin = pts[0].t;
  const tSpan = pts[pts.length - 1].t - tMin || 1;
  const lx = ((last.t - tMin) / tSpan) * width;
  const ly = height - (Math.min(Math.max(last.v ?? 0, 0), 100) / 100) * height;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <line x1={0} y1={height} x2={width} y2={height} stroke="#ffffff20" strokeWidth={0.5} />
      {segs.map((d, i) => (
        <path key={i} d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
      ))}
      <circle cx={lx} cy={ly} r={1.8} fill={color} />
    </svg>
  );
}

// ─── Großes Chart (Node-Detail) ───────────────────────────────────────────────

function clockLabel(epochMs: number): string {
  try {
    return new Date(epochMs).toLocaleTimeString("de-DE", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

const SERIES: { field: LoadField; label: string; color: string }[] = [
  { field: "gpu", label: "GPU", color: "#38bdf8" },
  { field: "cpu", label: "CPU", color: "#c084fc" },
];

export function LoadHistoryChart({ samples }: { samples: HwHistorySample[] }) {
  const W = 480;
  const H = 140;
  const padL = 26;
  const padR = 6;
  const padT = 8;
  const padB = 18;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const gpuPts = toPts(samples, "gpu");
  const anyData = SERIES.some((s) => toPts(samples, s.field).some((p) => p.v != null));

  if (gpuPts.length < 2 || !anyData) {
    return (
      <p className="text-sm text-fg-subtle">
        Noch kein Verlauf gesammelt — Daten erscheinen nach einigen Mess-Intervallen.
      </p>
    );
  }

  const allT = gpuPts.map((p) => p.t);
  const tMin = Math.min(...allT);
  const tMax = Math.max(...allT);

  const yOf = (v: number) => padT + (1 - Math.min(Math.max(v, 0), 100) / 100) * plotH;

  const gridY = [0, 25, 50, 75, 100];

  return (
    <div className="font-mono">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="GPU- und CPU-Auslastungsverlauf"
      >
        {/* y-Gitter + Beschriftung */}
        {gridY.map((g) => (
          <g key={g}>
            <line
              x1={padL}
              y1={yOf(g)}
              x2={W - padR}
              y2={yOf(g)}
              stroke="#ffffff14"
              strokeWidth={0.5}
            />
            <text x={padL - 4} y={yOf(g) + 3} textAnchor="end" className="fill-fg-subtle" fontSize={8}>
              {g}
            </text>
          </g>
        ))}
        {/* x-Achse: Start/Ende-Zeit */}
        <text x={padL} y={H - 5} textAnchor="start" className="fill-fg-subtle" fontSize={8}>
          {clockLabel(tMin)}
        </text>
        <text x={W - padR} y={H - 5} textAnchor="end" className="fill-fg-subtle" fontSize={8}>
          {clockLabel(tMax)}
        </text>
        {/* Serien */}
        {SERIES.map((s) => {
          const pts = toPts(samples, s.field);
          const segs = buildSegments(
            pts.map((p) => ({ t: p.t, v: p.v })),
            plotW,
            plotH,
            0,
            100,
          );
          // Segmente sind in lokalen Plot-Koordinaten (0..plotW / 0..plotH) →
          // per transform an die Achsen-Position schieben.
          return (
            <g key={s.field} transform={`translate(${padL}, ${padT})`}>
              {segs.map((d, i) => (
                <path key={i} d={d} fill="none" stroke={s.color} strokeWidth={1.5} strokeLinejoin="round" />
              ))}
            </g>
          );
        })}
      </svg>
      {/* Legende */}
      <div className="mt-1 flex items-center gap-4 text-xxs text-fg-muted">
        {SERIES.map((s) => {
          const pts = toPts(samples, s.field);
          const last = [...pts].reverse().find((p) => p.v != null);
          return (
            <span key={s.field} className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-3 rounded-[1px]" style={{ background: s.color }} />
              {s.label}
              <span className="tabular-nums text-fg">
                {last?.v != null ? `${last.v.toFixed(0)}%` : "n/a"}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
