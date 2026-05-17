// DbBroker — Status der via Oberon-Broker provisionierten Datenbanken.
// Datenquelle: GET /api/v1/oberon/db-broker/status

import { useQuery } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import { qk } from "../../../lib/queryKeys";
import { PageBadge } from "../../../components/PageBadge";
import { LoadingSpinner } from "../../../components/LoadingSpinner";
import { EmptyState } from "../../../components/EmptyState";
import { Tooltip } from "../../../components/Tooltip";

export function DbBrokerPage() {
  const { data, isLoading, error, dataUpdatedAt } = useQuery({
    queryKey: qk.oberon.dbBroker,
    queryFn: () => api.oberon.getDbBrokerStatus(),
    refetchInterval: 60_000,
  });

  const updatedAt = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString("de-DE") : "–";
  const isStub = (data as any)?.stub === true;
  const databases: any[] = (data as any)?.databases ?? [];

  return (
    <div className="p-4" data-testid="oberon-db-broker-page">
      <h2 className="mb-4 text-base font-semibold text-fg">DB-Broker Status</h2>

      {isLoading && <LoadingSpinner label="Lade DB-Broker-Status..." />}
      {error && <div className="text-sm text-status-error">Fehler: {(error as Error).message}</div>}

      {!isLoading && !error && (
        <>
          {isStub ? (
            <EmptyState title="Kein Zugriff" description={(data as any).message} />
          ) : databases.length === 0 ? (
            <div className="rounded border border-white/10 bg-bg-panel p-4">
              <p className="text-sm text-fg-muted mb-2">DB-Broker-Rohdaten:</p>
              <pre className="overflow-auto rounded bg-bg-elevated p-3 text-xs text-fg">
                {JSON.stringify(data, null, 2)}
              </pre>
            </div>
          ) : (
            <div className="space-y-2">
              {databases.map((db: any, i: number) => (
                <div
                  key={db.app_name ?? i}
                  className="rounded border border-white/10 bg-bg-panel p-3 text-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <Tooltip
                      title={`Datenbank fuer App: ${db.app_name} — DB-Name: ${db.db_name ?? "–"}`}
                      source="GET /api/v1/oberon/db-broker/status"
                      updatedAt={`Zuletzt: ${updatedAt}`}
                    >
                      <span className="font-medium text-fg">{db.app_name}</span>
                    </Tooltip>
                    <Tooltip
                      title={`Status: ${db.status}${db.error ? ` — ${db.error}` : ""}`}
                      source="GET /api/v1/oberon/db-broker/status"
                      updatedAt={`Zuletzt: ${updatedAt}`}
                      thresholds="ok = verbunden · provisioning = wird eingerichtet · error = Verbindungsfehler"
                    >
                      <span
                        className={`rounded border px-1.5 py-0.5 text-xxs ${
                          db.status === "ok"
                            ? "border-status-ok/30 bg-status-ok/10 text-status-ok"
                            : db.status === "provisioning"
                              ? "border-status-warn/30 bg-status-warn/10 text-status-warn"
                              : "border-status-error/30 bg-status-error/10 text-status-error"
                        }`}
                      >
                        {db.status}
                      </span>
                    </Tooltip>
                  </div>
                  {db.host && (
                    <p className="mt-1 text-xs text-fg-muted">
                      Host: <span className="font-mono text-fg">{db.host}</span>
                    </p>
                  )}
                  {db.error && (
                    <p className="mt-1 text-xs text-status-error">{db.error}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <PageBadge id="oberon.db-broker" />
    </div>
  );
}

export default DbBrokerPage;
