// Routing-Trace: Doctype -> Engine-Liste -> Node, gruppiert pro Seite.
// Statt Sankey: kompakte Pfeil-Liste — performanter, robuster, gut lesbar.

import { useMemo } from "react";
import { formatLatency, formatConfidence } from "../../lib/format";
import type { RoutingTraceEntry } from "../../lib/types";

export interface RoutingTraceProps {
  doctype: string | null;
  trace: RoutingTraceEntry[] | undefined;
}

interface PageGroup {
  page: number;
  entries: RoutingTraceEntry[];
}

export function RoutingTrace({ doctype, trace }: RoutingTraceProps) {
  const groups: PageGroup[] = useMemo(() => {
    if (!trace || trace.length === 0) return [];
    const m = new Map<number, RoutingTraceEntry[]>();
    for (const t of trace) {
      const arr = m.get(t.page) ?? [];
      arr.push(t);
      m.set(t.page, arr);
    }
    return [...m.entries()]
      .map(([page, entries]) => ({ page, entries }))
      .sort((a, b) => a.page - b.page);
  }, [trace]);

  if (groups.length === 0) {
    return (
      <div
        data-testid="routing-trace-empty"
        className="rounded border border-dashed border-white/10 p-4 text-center text-sm text-fg-muted"
      >
        Kein Routing-Trace fuer diesen Job.
      </div>
    );
  }

  return (
    <div data-testid="routing-trace" className="flex flex-col gap-3 text-xs">
      <div className="flex items-center gap-2 text-fg-muted">
        <span className="rounded bg-bg-elevated px-2 py-0.5 font-mono text-fg">
          {doctype ?? "?"}
        </span>
        <span aria-hidden>&rarr;</span>
        <span>{groups.length} Seite{groups.length === 1 ? "" : "n"}</span>
      </div>
      <ul className="flex flex-col gap-2">
        {groups.map((g) => (
          <li
            key={g.page}
            data-testid={`routing-trace-page-${g.page}`}
            className="rounded border border-white/5 bg-bg-elevated p-2"
          >
            <div className="mb-1 text-xxs uppercase text-fg-muted">Seite {g.page}</div>
            <ul className="flex flex-col gap-1">
              {g.entries.map((e, i) => (
                <li
                  key={`${e.engine}-${e.node}-${i}`}
                  className="flex items-center gap-2 font-mono text-xs"
                >
                  <span className="rounded bg-brand/20 px-1.5 py-0.5 text-brand">{e.engine}</span>
                  <span aria-hidden className="text-fg-subtle">&rarr;</span>
                  <span className="rounded bg-status-info/20 px-1.5 py-0.5 text-status-info">
                    {e.node}
                  </span>
                  <span className="ml-auto flex shrink-0 items-center gap-2 text-fg-muted">
                    <span title="Latenz">{formatLatency(e.latency_ms)}</span>
                    <span title="Konfidenz" className="text-fg">
                      {formatConfidence(e.confidence)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default RoutingTrace;
