// DbBroker — Status der via Oberon-Broker provisionierten Datenbanken.
// Datenquelle: GET /api/v1/oberon/db-broker/status

import { useQuery } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import { qk } from "../../../lib/queryKeys";
import { PageBadge } from "../../../components/PageBadge";
import { LoadingSpinner } from "../../../components/LoadingSpinner";
import { EmptyState } from "../../../components/EmptyState";
import { Tooltip } from "../../../components/Tooltip";
import { Panel, KV, StatusBadge, ErrorBanner, relTime } from "../_oberon_ui";

export function DbBrokerPage() {
  const { data, isLoading, error, dataUpdatedAt } = useQuery({
    queryKey: qk.oberon.dbBroker,
    queryFn: () => api.oberon.getDbBrokerStatus(),
    refetchInterval: 60_000,
  });

  const updatedAt = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString("de-DE") : "–";
  const isStub = (data as any)?.stub === true;

  // Oberon liefert camelCase (appName, database, provisionedAt, username),
  // MOAG-Konvention ist snake_case. Frontend toleriert beides.
  const rawDatabases: any[] = (data as any)?.databases ?? [];
  const databases = rawDatabases.map((db: any) => ({
    app_name: db.app_name ?? db.appName ?? "—",
    db_name: db.db_name ?? db.database ?? "—",
    status: db.status ?? (db.provisionedAt ? "ok" : "unknown"),
    host: db.host ?? null,
    username: db.username ?? null,
    provisionedAt: db.provisionedAt ?? null,
    error: db.error ?? null,
  }));

  // Zaehlungen fuer Summary
  const okCount = databases.filter((d) => d.status === "ok" || d.status === "healthy").length;
  const errorCount = databases.filter((d) =>
    d.status === "error" || d.status === "failed" || d.status === "down"
  ).length;

  return (
    <div className="p-4" data-testid="oberon-db-broker-page">
      <h2 className="mb-4 text-base font-semibold text-fg">DB-Broker Status</h2>

      {isLoading && <LoadingSpinner label="Lade DB-Broker-Status..." />}
      {error && <ErrorBanner message={(error as Error).message} />}

      {!isLoading && !error && (
        <>
          {isStub ? (
            <EmptyState title="Kein Zugriff" description={(data as any).message} />
          ) : databases.length === 0 ? (
            // Fallback: Rohdaten anzeigen
            <Panel title="DB-Broker (Rohdaten)">
              <pre className="mt-1 overflow-auto rounded bg-bg-elevated p-3 text-xs text-fg max-h-96">
                {JSON.stringify(data, null, 2)}
              </pre>
            </Panel>
          ) : (
            <>
              {/* Summary-Leiste */}
              {databases.length > 1 && (
                <div className="mb-4 flex items-center gap-4 text-xs text-fg-muted">
                  <Tooltip
                    title={`${databases.length} Datenbanken via Oberon-Broker provisioniert`}
                    source="GET /api/v1/oberon/db-broker/status"
                    updatedAt={`Zuletzt: ${updatedAt}`}
                  >
                    <span>{databases.length} Datenbanken</span>
                  </Tooltip>
                  <span className="text-status-ok">✓ {okCount} OK</span>
                  {errorCount > 0 && (
                    <span className="text-status-error">✗ {errorCount} Fehler</span>
                  )}
                </div>
              )}

              {/* DB-Karten-Grid */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {databases.map((db: any, i: number) => (
                  <Panel
                    key={db.app_name ?? i}
                    title={db.app_name}
                    className={
                      db.error
                        ? "border-status-error/40"
                        : db.status === "ok" || db.status === "healthy"
                          ? "border-status-ok/25"
                          : ""
                    }
                  >
                    {/* Status-Badge prominent */}
                    <div className="flex items-center justify-between gap-2 pb-1">
                      <span className="text-xs text-fg-muted">Status</span>
                      <Tooltip
                        title={`Datenbankstatus: ${db.status}${db.error ? ` — ${db.error}` : ""}`}
                        source="GET /api/v1/oberon/db-broker/status"
                        updatedAt={`Zuletzt: ${updatedAt}`}
                        thresholds="ok = verbunden · provisioning = wird eingerichtet · error = Verbindungsfehler"
                      >
                        <StatusBadge status={db.status} />
                      </Tooltip>
                    </div>

                    <KV
                      label="DB-Name"
                      value={db.db_name}
                      mono
                      tip={`Provisionierter Datenbankname: ${db.db_name}`}
                      source="GET /api/v1/oberon/db-broker/status"
                    />
                    {db.host && (
                      <KV
                        label="Host"
                        value={db.host}
                        mono
                        tip={`Datenbankhost: ${db.host}`}
                        source="GET /api/v1/oberon/db-broker/status"
                      />
                    )}
                    {db.username && (
                      <KV
                        label="User"
                        value={db.username}
                        mono
                      />
                    )}
                    {db.provisionedAt && (
                      <KV
                        label="Provisioniert"
                        value={relTime(db.provisionedAt)}
                        tip={`Provisionierungszeitpunkt: ${db.provisionedAt}`}
                        source="GET /api/v1/oberon/db-broker/status"
                      />
                    )}

                    {/* Fehlertext */}
                    {db.error && (
                      <div className="mt-1.5 rounded border border-status-error/30 bg-status-error/10 px-2 py-1 text-xs text-status-error">
                        {db.error}
                      </div>
                    )}
                  </Panel>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <PageBadge id="oberon.db-broker" />
    </div>
  );
}

export default DbBrokerPage;
