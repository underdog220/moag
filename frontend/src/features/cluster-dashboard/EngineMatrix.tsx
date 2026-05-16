// EngineMatrix — Engines x Nodes Grid mit ✓ / – / ✗.
// Daten: GET /api/cluster/engines  -> { matrix: { engines, nodes, available[engine][node] } }
//
// Tolerante Anzeige (Briefing C):
//   - leere Engine-Liste: "—" + Hint-Tooltip "Hub kennt noch keine Engines, ..."
//   - leere Nodes: gleiches Verhalten
//   - missing/degraded farblich abgesetzt

import { useQuery } from "@tanstack/react-query";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { api } from "../../lib/api";
import { qk } from "../../lib/queryKeys";
import type { EngineAvailability } from "../../lib/types";

interface CellSpec {
  symbol: string;
  className: string;
  tooltip: string;
}

const CELL_MAP: Record<EngineAvailability, CellSpec> = {
  ok: {
    symbol: "✓",
    className: "text-status-ok",
    tooltip: "Engine verfuegbar",
  },
  degraded: {
    symbol: "–",
    className: "text-status-warn",
    tooltip: "Engine degraded (Funktion eingeschraenkt)",
  },
  missing: {
    symbol: "✗",
    className: "text-status-error",
    tooltip: "Engine fehlt",
  },
};

export interface EngineMatrixProps {
  refetchIntervalMs?: number;
}

export function EngineMatrix({ refetchIntervalMs = 10_000 }: EngineMatrixProps) {
  const matrixQuery = useQuery({
    queryKey: qk.cluster.engines,
    queryFn: () => api.getEngineMatrix(),
    refetchInterval: refetchIntervalMs,
    refetchIntervalInBackground: false,
    retry: 1,
  });

  if (matrixQuery.isLoading) {
    return (
      <Card title="Engine-Matrix">
        <LoadingSpinner label="Engine-Matrix wird geladen..." />
      </Card>
    );
  }
  if (matrixQuery.isError) {
    return (
      <Card title="Engine-Matrix">
        <EmptyState
          title="Engine-Matrix konnte nicht geladen werden"
          description={(matrixQuery.error as Error).message}
        />
      </Card>
    );
  }

  const matrix = matrixQuery.data?.matrix;
  const engines = matrix?.engines ?? [];
  const nodes = matrix?.nodes ?? [];

  if (engines.length === 0 || nodes.length === 0) {
    return (
      <Card
        title="Engine-Matrix"
        description="Hub kennt noch keine Engines"
      >
        <div data-testid="engine-matrix-empty" className="py-4 text-center">
          <span
            className="text-2xl text-fg-subtle"
            title="Hub kennt noch keine Engines, vermutlich frische DB ohne Discovery"
          >
            —
          </span>
          <p className="mt-2 text-xs text-fg-muted">
            Hub kennt noch keine Engines, vermutlich frische DB ohne Discovery
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card
      title="Engine-Matrix"
      description={`${engines.length} Engines · ${nodes.length} Nodes`}
    >
      <div className="overflow-x-auto" data-testid="engine-matrix">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 text-xs uppercase text-fg-subtle">
              <th className="px-3 py-2 text-left font-medium">Engine \ Node</th>
              {nodes.map((n) => (
                <th key={n} className="px-3 py-2 text-center font-medium">
                  {n}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {engines.map((engine, ei) => (
              <tr key={engine} className="border-b border-white/5 last:border-b-0">
                <td className="px-3 py-2 font-mono text-xs text-fg">{engine}</td>
                {nodes.map((node, ni) => {
                  const cell = (matrix?.available?.[ei]?.[ni] ?? "missing") as EngineAvailability;
                  const spec = CELL_MAP[cell] ?? CELL_MAP.missing;
                  return (
                    <td
                      key={`${engine}-${node}`}
                      className="px-3 py-2 text-center"
                      data-testid={`engine-cell-${engine}-${node}`}
                      data-availability={cell}
                    >
                      <span
                        className={`inline-block text-base font-bold ${spec.className}`}
                        title={`${engine} @ ${node}: ${spec.tooltip}`}
                        aria-label={`${engine} auf ${node}: ${spec.tooltip}`}
                      >
                        {spec.symbol}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default EngineMatrix;
