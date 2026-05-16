// AbCompareView: Lokal vs. Cluster Vergleich.
// Side-by-side Text + Diff-Highlight (rot=lokal-only, gruen=cluster-only).
// Latenz- und Engine-Vergleich oben.
// Backend-Stub liefert haeufig {"available": false, "reason": "..."} — dann zeigen wir
// einen freundlichen Hinweis statt eines leeren Panels.

import { formatLatency } from "../../lib/format";
import type { AbCompareResult } from "../../lib/types";

export interface AbCompareViewProps {
  data: AbCompareResult | undefined;
  loading?: boolean;
  error?: string | null;
}

function diffColor(t: "equal" | "local-only" | "cluster-only"): string {
  if (t === "local-only") return "bg-status-error/15 text-status-error border-status-error/40";
  if (t === "cluster-only") return "bg-status-ok/15 text-status-ok border-status-ok/40";
  return "border-white/5 text-fg";
}

function diffPrefix(t: "equal" | "local-only" | "cluster-only"): string {
  if (t === "local-only") return "-";
  if (t === "cluster-only") return "+";
  return " ";
}

export function AbCompareView({ data, loading, error }: AbCompareViewProps) {
  if (loading) {
    return (
      <div
        data-testid="ab-compare-loading"
        className="rounded border border-dashed border-white/10 p-4 text-center text-sm text-fg-muted"
      >
        A/B-Vergleich wird geladen ...
      </div>
    );
  }

  if (error) {
    return (
      <div
        data-testid="ab-compare-error"
        role="alert"
        className="rounded border border-status-error/40 bg-status-error/10 p-3 text-xs text-status-error"
      >
        {error}
      </div>
    );
  }

  if (!data || data.available === false) {
    return (
      <div
        data-testid="ab-compare-unavailable"
        className="rounded border border-dashed border-white/10 p-6 text-center text-sm text-fg-muted"
      >
        <div className="mb-1 font-semibold text-fg">A/B-Vergleich nicht verfuegbar</div>
        <div>{data?.reason ?? "Dieser Job wurde ohne --ab-compare ausgefuehrt."}</div>
      </div>
    );
  }

  const { local, cluster, diff } = data;

  return (
    <div data-testid="ab-compare" className="flex flex-col gap-3">
      {/* Latenz / Engines Vergleich */}
      <div className="grid gap-2 sm:grid-cols-2">
        <div
          data-testid="ab-compare-local-meta"
          className="rounded border border-white/5 bg-bg-elevated p-3"
        >
          <div className="text-xxs uppercase tracking-wide text-fg-muted">Lokal</div>
          <div className="mt-1 flex items-baseline justify-between gap-2 text-xs">
            <span className="text-fg-muted">Latenz</span>
            <span className="font-mono text-fg">{formatLatency(local?.latency_ms)}</span>
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-2 text-xs">
            <span className="text-fg-muted">Engines</span>
            <span className="font-mono text-fg">
              {local?.engines?.join(", ") || "-"}
            </span>
          </div>
        </div>
        <div
          data-testid="ab-compare-cluster-meta"
          className="rounded border border-white/5 bg-bg-elevated p-3"
        >
          <div className="text-xxs uppercase tracking-wide text-fg-muted">Cluster</div>
          <div className="mt-1 flex items-baseline justify-between gap-2 text-xs">
            <span className="text-fg-muted">Latenz</span>
            <span className="font-mono text-fg">{formatLatency(cluster?.latency_ms)}</span>
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-2 text-xs">
            <span className="text-fg-muted">Engines</span>
            <span className="font-mono text-fg">
              {cluster?.engines?.join(", ") || "-"}
            </span>
          </div>
        </div>
      </div>

      {/* Diff-Liste — wenn vorhanden, sonst Side-by-side */}
      {diff && diff.length > 0 ? (
        <div data-testid="ab-compare-diff" className="overflow-hidden rounded border border-white/5">
          <div className="border-b border-white/5 bg-bg-panel px-3 py-1 text-xxs uppercase tracking-wide text-fg-muted">
            Diff (rot=nur lokal, gruen=nur cluster)
          </div>
          <ul className="divide-y divide-white/5">
            {diff.map((line, idx) => (
              <li
                key={`${line.type}-${idx}`}
                data-testid={`ab-compare-diff-line-${line.type}`}
                className={`flex items-start gap-2 border-l-4 px-3 py-1 font-mono text-xs ${diffColor(line.type)}`}
              >
                <span className="w-3 shrink-0 select-none text-fg-subtle">
                  {diffPrefix(line.type)}
                </span>
                <span className="break-words">{line.text}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div data-testid="ab-compare-side-by-side" className="grid gap-2 sm:grid-cols-2">
          <pre
            data-testid="ab-compare-local-text"
            className="max-h-96 overflow-auto whitespace-pre-wrap rounded border border-white/5 bg-bg-elevated p-3 font-mono text-xs text-fg"
          >
            {local?.text ?? "(kein Text)"}
          </pre>
          <pre
            data-testid="ab-compare-cluster-text"
            className="max-h-96 overflow-auto whitespace-pre-wrap rounded border border-white/5 bg-bg-elevated p-3 font-mono text-xs text-fg"
          >
            {cluster?.text ?? "(kein Text)"}
          </pre>
        </div>
      )}
    </div>
  );
}

export default AbCompareView;
