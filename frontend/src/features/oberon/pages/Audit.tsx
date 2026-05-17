// Audit — DSGVO-Audit-Event-Stream mit Pagination + Filter.
// Datenquelle: GET /api/v1/oberon/audit

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import { qk } from "../../../lib/queryKeys";
import { PageBadge } from "../../../components/PageBadge";
import { LoadingSpinner } from "../../../components/LoadingSpinner";
import { EmptyState } from "../../../components/EmptyState";
import { Tooltip } from "../../../components/Tooltip";

export function AuditPage() {
  const [piiType, setPiiType] = useState("");
  const [clientId, setClientId] = useState("");
  const [limit, setLimit] = useState(50);

  const { data, isLoading, error, dataUpdatedAt } = useQuery({
    queryKey: qk.oberon.audit(undefined, piiType || undefined, clientId || undefined),
    queryFn: () => api.oberon.getAudit({ limit, piiType: piiType || undefined, clientId: clientId || undefined }),
    refetchInterval: 30_000,
  });

  const updatedAt = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString("de-DE") : "–";
  const events: any[] = (data as any)?.events ?? [];

  return (
    <div className="p-4" data-testid="oberon-audit-page">
      <h2 className="mb-4 text-base font-semibold text-fg">DSGVO-Audit</h2>

      {/* Filter */}
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <Tooltip
          title="Filter auf PII-Typ (z.B. IBAN, EMAIL)"
          source="GET /api/v1/oberon/audit"
          updatedAt={`Zuletzt: ${updatedAt}`}
        >
          <input
            type="text"
            placeholder="PII-Typ (z.B. IBAN)"
            value={piiType}
            onChange={(e) => setPiiType(e.target.value)}
            className="rounded border border-white/10 bg-bg-elevated px-3 py-2 text-fg
                       min-h-[44px]"
          />
        </Tooltip>
        <Tooltip
          title="Filter auf Client-ID (z.B. ocrexpert)"
          source="GET /api/v1/oberon/audit"
          updatedAt={`Zuletzt: ${updatedAt}`}
        >
          <input
            type="text"
            placeholder="Client-ID"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="rounded border border-white/10 bg-bg-elevated px-3 py-2 text-fg
                       min-h-[44px]"
          />
        </Tooltip>
        <Tooltip
          title="Maximale Anzahl Events"
          source="GET /api/v1/oberon/audit"
          updatedAt={`Zuletzt: ${updatedAt}`}
        >
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="rounded border border-white/10 bg-bg-elevated px-3 py-2 text-fg
                       min-h-[44px]"
          >
            {[25, 50, 100, 200].map((n) => (
              <option key={n} value={n}>{n} Eintraege</option>
            ))}
          </select>
        </Tooltip>
      </div>

      {isLoading && <LoadingSpinner label="Lade Audit-Events..." />}
      {error && <div className="text-sm text-status-error">Fehler: {(error as Error).message}</div>}

      {!isLoading && !error && (
        <>
          <p className="mb-2 text-xs text-fg-muted">
            {events.length} Events {(data as any)?.returned != null ? `(von ${(data as any).returned})` : ""}
          </p>
          {events.length === 0 ? (
            <EmptyState title="Keine Events" description="Kein Admin-Token konfiguriert oder keine DSGVO-Events im Filter." />
          ) : (
            <div className="space-y-1">
              {events.map((ev: any) => (
                <div
                  key={ev.audit_id}
                  className="flex items-start gap-3 rounded border border-white/5 bg-bg-panel px-3 py-2 text-xs"
                >
                  <Tooltip
                    title={`Timestamp: ${ev.ts}`}
                    source="GET /api/v1/oberon/audit"
                    updatedAt={`Zuletzt: ${updatedAt}`}
                  >
                    <span className="shrink-0 tabular-nums text-fg-muted">
                      {new Date(ev.ts).toLocaleTimeString("de-DE")}
                    </span>
                  </Tooltip>
                  <span className="shrink-0 font-mono text-fg-subtle">{ev.event_type}</span>
                  <span className="shrink-0 font-mono text-fg-muted">{ev.client_id ?? "–"}</span>
                  {ev.pii_types.length > 0 && (
                    <Tooltip
                      title={`Erkannte PII-Typen: ${ev.pii_types.join(", ")}`}
                      source="GET /api/v1/oberon/audit"
                      updatedAt={`Zuletzt: ${updatedAt}`}
                    >
                      <span className="rounded border border-status-warn/30 bg-status-warn/10 px-1 text-status-warn">
                        {ev.pii_types.join(", ")}
                      </span>
                    </Tooltip>
                  )}
                  {ev.anonymized && (
                    <span className="text-status-ok">anonymisiert</span>
                  )}
                  <Tooltip
                    title={`Verarbeitungsdauer: ${ev.duration_ms}ms`}
                    source="GET /api/v1/oberon/audit"
                    updatedAt={`Zuletzt: ${updatedAt}`}
                  >
                    <span className="ml-auto tabular-nums text-fg-subtle">{ev.duration_ms}ms</span>
                  </Tooltip>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <PageBadge id="oberon.audit" />
    </div>
  );
}

export default AuditPage;
