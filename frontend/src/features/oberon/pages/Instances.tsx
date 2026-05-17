// Instances — Aktive Oberon-Chat/DevLoop-Instanzen.
// Datenquelle: GET /api/v1/oberon/instances

import { useQuery } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import { qk } from "../../../lib/queryKeys";
import { PageBadge } from "../../../components/PageBadge";
import { LoadingSpinner } from "../../../components/LoadingSpinner";
import { EmptyState } from "../../../components/EmptyState";
import { Tooltip } from "../../../components/Tooltip";

export function InstancesPage() {
  const { data, isLoading, error, dataUpdatedAt } = useQuery({
    queryKey: qk.oberon.instances,
    queryFn: () => api.oberon.getInstances(),
    refetchInterval: 30_000,
  });

  const updatedAt = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString("de-DE") : "–";

  // Daten-Normalisierung: Liste oder Stub-Objekt
  const isStub = (data as any)?.stub === true;
  const instances: any[] = Array.isArray(data) ? data : (data as any)?.instances ?? [];

  return (
    <div className="p-4" data-testid="oberon-instances-page">
      <h2 className="mb-4 text-base font-semibold text-fg">Aktive Instanzen</h2>

      {isLoading && <LoadingSpinner label="Lade Instanzen..." />}
      {error && <div className="text-sm text-status-error">Fehler: {(error as Error).message}</div>}

      {!isLoading && !error && (
        <>
          {isStub ? (
            <EmptyState title="Kein Zugriff" description={(data as any).message} />
          ) : instances.length === 0 ? (
            <EmptyState title="Keine aktiven Instanzen" description="Aktuell laufen keine DevLoop/Chat-Sessions auf Oberon." />
          ) : (
            <div className="space-y-2">
              {instances.map((inst: any, i: number) => (
                <div
                  key={inst.id ?? i}
                  className="rounded border border-white/10 bg-bg-panel p-3 text-sm"
                >
                  <div className="flex items-center justify-between">
                    <Tooltip
                      title={`Instanz-ID: ${inst.id ?? "unbekannt"}`}
                      source="GET /api/v1/oberon/instances"
                      updatedAt={`Zuletzt: ${updatedAt}`}
                    >
                      <span className="font-mono text-fg">{inst.id ?? "–"}</span>
                    </Tooltip>
                    <span className="text-xs text-fg-muted">{inst.mode ?? "–"}</span>
                  </div>
                  {inst.context_size != null && (
                    <Tooltip
                      title={`Kontext-Groesse: ${inst.context_size.toLocaleString("de-DE")} Tokens`}
                      source="GET /api/v1/oberon/instances"
                      updatedAt={`Zuletzt: ${updatedAt}`}
                    >
                      <p className="mt-1 text-xs text-fg-muted">
                        Kontext: <span className="tabular-nums text-fg">{inst.context_size.toLocaleString("de-DE")}</span> Tokens
                      </p>
                    </Tooltip>
                  )}
                  {inst.client_id && (
                    <p className="mt-0.5 text-xs text-fg-muted">
                      Client: <span className="text-fg">{inst.client_id}</span>
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <PageBadge id="oberon.instances" />
    </div>
  );
}

export default InstancesPage;
