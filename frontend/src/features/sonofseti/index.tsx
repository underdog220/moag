// SonOfSETI-Feature — Node-Liste mit Drilldown.
// V1: zeigt Liste der Nodes (aus OctoBoss-Proxy). Tiefe-3-Ansicht kommt Phase 2.

import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { qk } from "../../lib/queryKeys";
import { PageBadge } from "../../components/PageBadge";
import { Breadcrumb } from "../../components/Breadcrumb";
import { LoadingSpinner } from "../../components/LoadingSpinner";

export function SonOfSetiFeature() {
  const { data, isLoading, error } = useQuery({
    queryKey: qk.cluster.nodes,
    queryFn: () => api.getNodes(),
    refetchInterval: 15_000,
  });

  const nodes = data?.nodes ?? [];

  return (
    <div className="flex flex-col" data-testid="sonofseti">
      <Breadcrumb />
      <div className="p-4">
        <h1 className="mb-2 text-lg font-semibold text-fg">SonOfSETI — Nodes</h1>
        <p className="mb-4 text-sm text-fg-muted">
          Aktive Compute-Nodes aus dem OctoBoss-Hub. Drilldown-Details kommen in Phase 2.
        </p>

        {isLoading && <LoadingSpinner label="Lade Nodes..." />}
        {error && (
          <p className="text-sm text-status-error">
            Fehler: {(error as Error).message}
          </p>
        )}

        <div className="space-y-2">
          {nodes.map((node) => (
            <div
              key={node.node_id}
              className="flex items-center gap-3 rounded border border-white/5 bg-bg-panel px-3 py-2"
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  node.connected ? "bg-status-ok" : "bg-status-error"
                }`}
                title={node.connected ? "verbunden" : "nicht verbunden"}
              />
              <span className="flex-1 text-sm font-semibold text-fg">{node.hostname}</span>
              <span className="text-xs text-fg-muted">{node.last_known_ip}</span>
              {node.hardware.gpu_name && (
                <span className="text-xxs text-fg-subtle">{node.hardware.gpu_name}</span>
              )}
            </div>
          ))}
          {!isLoading && nodes.length === 0 && (
            <p className="text-sm text-fg-muted">Keine Nodes erreichbar.</p>
          )}
        </div>
      </div>
      <PageBadge id="sonofseti" />
    </div>
  );
}

export default SonOfSetiFeature;
