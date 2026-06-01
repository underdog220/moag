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
import { Panel, Chip, ErrorBanner, relTime } from "../_oberon_ui";

// Faerbt event_type-Chip nach Kategorie
function eventTone(evType: string): "ok" | "warn" | "error" | "neutral" | "brand" {
  if (!evType) return "neutral";
  if (evType.includes("block") || evType.includes("deny")) return "error";
  if (evType.includes("anonymi") || evType.includes("redact")) return "warn";
  if (evType.includes("pass") || evType.includes("allow")) return "ok";
  return "neutral";
}

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

      {/* Filter-Panel */}
      <Panel title="Filter" className="mb-4">
        <div className="flex flex-wrap gap-2 pt-1 text-sm">
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
              className="rounded border border-white/10 bg-bg-elevated px-3 py-2 text-fg min-h-[44px]"
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
              className="rounded border border-white/10 bg-bg-elevated px-3 py-2 text-fg min-h-[44px]"
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
              className="rounded border border-white/10 bg-bg-elevated px-3 py-2 text-fg min-h-[44px]"
            >
              {[25, 50, 100, 200].map((n) => (
                <option key={n} value={n}>{n} Eintraege</option>
              ))}
            </select>
          </Tooltip>
        </div>
      </Panel>

      {isLoading && <LoadingSpinner label="Lade Audit-Events..." />}
      {error && <ErrorBanner message={(error as Error).message} />}

      {!isLoading && !error && (
        <Panel title={`Events (${events.length}${(data as any)?.returned != null ? ` von ${(data as any).returned}` : ""})`}>
          {events.length === 0 ? (
            <EmptyState title="Keine Events" description="Kein Admin-Token konfiguriert oder keine DSGVO-Events im Filter." />
          ) : (
            <div className="max-h-[28rem] overflow-y-auto pr-1 space-y-1.5">
              {events.map((ev: any) => (
                <div
                  key={ev.audit_id}
                  className="rounded border border-white/5 bg-bg-elevated/30 px-3 py-2"
                >
                  {/* Zeile 1: Timestamp · event_type · client_id · Dauer */}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Tooltip
                      title={`Vollstaendiger Timestamp: ${ev.ts}`}
                      source="GET /api/v1/oberon/audit"
                      updatedAt={`Zuletzt: ${updatedAt}`}
                    >
                      <span className="shrink-0 tabular-nums text-xs text-fg-muted font-mono">
                        {new Date(ev.ts).toLocaleTimeString("de-DE")}
                      </span>
                    </Tooltip>
                    <Tooltip
                      title={`Event-Typ: ${ev.event_type}`}
                      source="GET /api/v1/oberon/audit"
                      updatedAt={`Zuletzt: ${updatedAt}`}
                    >
                      <Chip tone={eventTone(ev.event_type)}>{ev.event_type}</Chip>
                    </Tooltip>
                    {ev.client_id && (
                      <span className="text-xs text-fg-muted font-mono">{ev.client_id}</span>
                    )}
                    <Tooltip
                      title={`Verarbeitungsdauer dieses Events: ${ev.duration_ms}ms`}
                      source="GET /api/v1/oberon/audit"
                      updatedAt={`Zuletzt: ${updatedAt}`}
                    >
                      <span className="ml-auto tabular-nums text-xs text-fg-subtle">{ev.duration_ms}ms</span>
                    </Tooltip>
                  </div>

                  {/* Zeile 2: PII-Badges + anonymisiert-Flag */}
                  {(ev.pii_types?.length > 0 || ev.anonymized) && (
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {ev.pii_types?.map((t: string) => (
                        <Tooltip
                          key={t}
                          title={`Erkannter PII-Typ: ${t}`}
                          source="GET /api/v1/oberon/audit"
                          updatedAt={`Zuletzt: ${updatedAt}`}
                        >
                          <span className="rounded border border-status-warn/30 bg-status-warn/10 px-1.5 py-0.5 text-xxs font-semibold text-status-warn">
                            {t}
                          </span>
                        </Tooltip>
                      ))}
                      {ev.anonymized && (
                        <Tooltip
                          title="PII wurde anonymisiert/geschwärzt"
                          source="GET /api/v1/oberon/audit"
                          updatedAt={`Zuletzt: ${updatedAt}`}
                        >
                          <span className="rounded border border-status-ok/30 bg-status-ok/10 px-1.5 py-0.5 text-xxs font-semibold text-status-ok">
                            anonymisiert
                          </span>
                        </Tooltip>
                      )}
                      {ev.created_at && (
                        <span className="ml-auto text-xxs text-fg-subtle">{relTime(ev.created_at)}</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}

      <PageBadge id="oberon.audit" />
    </div>
  );
}

export default AuditPage;
