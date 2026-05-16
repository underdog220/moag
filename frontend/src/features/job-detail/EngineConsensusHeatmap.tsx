// Engine-Konsens-Heatmap: Spalten = Seiten, Zeilen = Engines.
// Zellfarbe je nach Konfidenz (gruen->gelb->rot).

import { useMemo } from "react";

export interface EngineConsensusHeatmapProps {
  /** Aus JobDetail.engine_consensus_per_page — pro Seite ein Object {page, engine: score, ...}. */
  data: Array<Record<string, number | string>> | undefined;
  /** Optional: Engines vorgeben (sonst aus Daten extrahiert). */
  engines?: string[];
}

const META_KEYS = new Set(["page", "ts"]);

function colorForScore(score: number): string {
  // 0..1, niedrig = rot, mittel = gelb, hoch = gruen
  const pct = Math.max(0, Math.min(1, score));
  if (pct >= 0.9) return "bg-status-ok/80";
  if (pct >= 0.75) return "bg-status-ok/50";
  if (pct >= 0.6) return "bg-status-warn/50";
  if (pct >= 0.4) return "bg-status-warn/80";
  return "bg-status-error/70";
}

export function EngineConsensusHeatmap({ data, engines }: EngineConsensusHeatmapProps) {
  const { engineList, pages } = useMemo(() => {
    if (!data || data.length === 0) {
      return { engineList: [] as string[], pages: [] as Array<Record<string, number | string>> };
    }
    const sortedPages = [...data].sort((a, b) => Number(a.page) - Number(b.page));
    if (engines && engines.length > 0) {
      return { engineList: engines, pages: sortedPages };
    }
    const set = new Set<string>();
    for (const p of sortedPages) {
      for (const k of Object.keys(p)) {
        if (!META_KEYS.has(k)) set.add(k);
      }
    }
    return { engineList: [...set].sort(), pages: sortedPages };
  }, [data, engines]);

  if (engineList.length === 0 || pages.length === 0) {
    return (
      <div
        data-testid="engine-consensus-empty"
        className="rounded border border-dashed border-white/10 p-4 text-center text-sm text-fg-muted"
      >
        Kein Engine-Konsens fuer diesen Job verfuegbar.
      </div>
    );
  }

  return (
    <div data-testid="engine-consensus-heatmap" className="flex flex-col gap-2 overflow-x-auto">
      <table className="min-w-max border-collapse text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-bg-panel px-2 py-1 text-left font-medium text-fg-muted">
              Engine
            </th>
            {pages.map((p) => (
              <th
                key={String(p.page)}
                className="px-2 py-1 text-center font-mono font-normal text-fg-muted"
              >
                S{p.page}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {engineList.map((engine) => (
            <tr key={engine} data-testid={`engine-row-${engine}`}>
              <td
                className="sticky left-0 z-10 bg-bg-panel px-2 py-1 font-mono text-fg"
                title={engine}
              >
                {engine}
              </td>
              {pages.map((p) => {
                const raw = p[engine];
                const score = typeof raw === "number" ? raw : null;
                if (score == null) {
                  return (
                    <td
                      key={String(p.page)}
                      className="border border-white/5 bg-bg-elevated px-2 py-1 text-center text-fg-subtle"
                    >
                      &mdash;
                    </td>
                  );
                }
                return (
                  <td
                    key={String(p.page)}
                    data-testid={`heatmap-cell-${engine}-${p.page}`}
                    title={`${engine} / Seite ${p.page}: ${(score * 100).toFixed(1)}%`}
                    className={`border border-white/10 px-2 py-1 text-center font-mono text-bg ${colorForScore(score)}`}
                  >
                    {Math.round(score * 100)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default EngineConsensusHeatmap;
