// Contract — Oberon API-Kontrakt und Capabilities.
// Datenquelle: GET /api/v1/oberon/contract/capabilities

import { useQuery } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import { qk } from "../../../lib/queryKeys";
import { PageBadge } from "../../../components/PageBadge";
import { LoadingSpinner } from "../../../components/LoadingSpinner";
import { EmptyState } from "../../../components/EmptyState";
import { Tooltip } from "../../../components/Tooltip";

export function ContractPage() {
  const { data, isLoading, error, dataUpdatedAt } = useQuery({
    queryKey: qk.oberon.contract,
    queryFn: () => api.oberon.getContractCapabilities(),
    refetchInterval: 120_000,
  });

  const updatedAt = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString("de-DE") : "–";
  const isStub = (data as any)?.stub === true;

  // Capabilities koennen als Array oder Objekt mit capabilities-Feld kommen
  const capabilities: any[] = Array.isArray(data)
    ? data
    : Array.isArray((data as any)?.capabilities)
      ? (data as any).capabilities
      : [];

  return (
    <div className="p-4" data-testid="oberon-contract-page">
      <h2 className="mb-4 text-base font-semibold text-fg">API-Kontrakt</h2>

      {isLoading && <LoadingSpinner label="Lade Kontrakt-Daten..." />}
      {error && <div className="text-sm text-status-error">Fehler: {(error as Error).message}</div>}

      {!isLoading && !error && (
        <>
          {isStub ? (
            <EmptyState title="Kein Zugriff" description={(data as any).message} />
          ) : capabilities.length === 0 ? (
            <div className="rounded border border-white/10 bg-bg-panel p-4">
              <p className="text-sm text-fg-muted mb-2">Kontrakt-Rohdaten:</p>
              <pre className="overflow-auto rounded bg-bg-elevated p-3 text-xs text-fg">
                {JSON.stringify(data, null, 2)}
              </pre>
            </div>
          ) : (
            <div className="space-y-1">
              {capabilities.map((cap: any, i: number) => (
                <div
                  key={cap.name ?? cap.path ?? i}
                  className="flex items-center gap-3 rounded border border-white/5 bg-bg-panel px-3 py-2 text-xs"
                >
                  <Tooltip
                    title={cap.description ?? cap.name ?? cap.path}
                    source="GET /api/v1/oberon/contract/capabilities"
                    updatedAt={`Zuletzt: ${updatedAt}`}
                  >
                    <span className="shrink-0 rounded border border-white/10 bg-bg-elevated px-1 py-0.5 font-mono text-fg-muted">
                      {cap.method ?? "GET"}
                    </span>
                  </Tooltip>
                  <span className="flex-1 font-mono text-fg">{cap.path ?? cap.name}</span>
                  {cap.requires_auth && (
                    <Tooltip
                      title="Dieser Endpoint erfordert Authentifizierung (Bearer Token)"
                      source="GET /api/v1/oberon/contract/capabilities"
                      updatedAt={`Zuletzt: ${updatedAt}`}
                    >
                      <span className="text-fg-subtle">Auth</span>
                    </Tooltip>
                  )}
                  {cap.version && (
                    <span className="tabular-nums text-fg-subtle">v{cap.version}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <PageBadge id="oberon.contract" />
    </div>
  );
}

export default ContractPage;
