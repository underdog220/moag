// AuditTab — Oberon-Cockpit-DSGVO-Audit-Event-Stream.
// Laedt Events von /api/oberon/cockpit/audit, 15s Auto-Refresh.
// Features: Filter-Bar, Severity/Typ-Pills, Row-Expand, CSV-Export, Auto-Scroll.

import {
  useState,
  useMemo,
  useRef,
  useEffect,
  useCallback,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { qk } from "../../lib/queryKeys";
import { Card } from "../../components/Card";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { EmptyState } from "../../components/EmptyState";
import type { CockpitAuditEvent } from "../../lib/types";

// Bekannte Event-Types
const EVENT_TYPES = ["dsgvo_proxy", "transcribe", "visual_redaction"] as const;

// Bekannte Severity-Stufen (abgeleitet aus pii_types + anonymized)
type AuditSeverity = "high" | "medium" | "low";

function calcSeverity(ev: CockpitAuditEvent): AuditSeverity {
  if (ev.pii_types.length > 1) return "high";
  if (ev.pii_types.length === 1) return "medium";
  return "low";
}

const SEVERITY_LABELS: Record<AuditSeverity, string> = {
  high: "Hoch",
  medium: "Mittel",
  low: "Niedrig",
};

const SEVERITY_CLASSES: Record<AuditSeverity, string> = {
  high: "bg-status-error/15 text-status-error",
  medium: "bg-status-warn/15 text-status-warn",
  low: "bg-bg-elevated text-fg-muted",
};

const EVENT_TYPE_CLASSES: Record<string, string> = {
  dsgvo_proxy: "bg-brand/15 text-brand",
  transcribe: "bg-violet-500/15 text-violet-400",
  visual_redaction: "bg-amber-500/15 text-amber-400",
};

function eventTypeClass(t: string): string {
  return EVENT_TYPE_CLASSES[t] ?? "bg-bg-elevated text-fg-muted";
}

// --- Relative Zeitanzeige ---

function relativeTime(iso: string): string {
  try {
    const diffMs = Date.now() - new Date(iso).getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return `${diffSec}s`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}min`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h`;
    return `${Math.floor(diffH / 24)}d`;
  } catch {
    return "-";
  }
}

function absoluteTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("de-DE", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

// --- CSV-Export ---

function auditEventsToCsv(events: CockpitAuditEvent[]): string {
  const headers = [
    "ts",
    "audit_id",
    "client_id",
    "event_type",
    "pii_types",
    "anonymized",
    "routing_decision",
    "duration_ms",
    "domain",
  ] as const;

  function csvEscape(val: unknown): string {
    if (val === null || val === undefined) return "";
    const s = Array.isArray(val) ? val.join(",") : String(val);
    if (/[";\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  const lines: string[] = [headers.join(";")];
  for (const ev of events) {
    lines.push(
      headers.map((h) => csvEscape((ev as unknown as Record<string, unknown>)[h])).join(";"),
    );
  }
  return lines.join("\r\n") + "\r\n";
}

function downloadBlob(content: string, filename: string, mime: string): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// --- Filter-Typen ---

interface AuditFilters {
  eventType: string; // "" = alle
  severity: AuditSeverity | ""; // "" = alle
  clientId: string;  // "" = alle
  search: string;
}

const DEFAULT_FILTERS: AuditFilters = {
  eventType: "",
  severity: "",
  clientId: "",
  search: "",
};

function applyFilters(events: CockpitAuditEvent[], f: AuditFilters): CockpitAuditEvent[] {
  return events.filter((ev) => {
    if (f.eventType && ev.event_type !== f.eventType) return false;
    if (f.severity && calcSeverity(ev) !== f.severity) return false;
    if (f.clientId && ev.client_id !== f.clientId) return false;
    if (f.search) {
      const q = f.search.toLowerCase();
      const inMessage =
        ev.event_type.toLowerCase().includes(q) ||
        (ev.client_id ?? "").toLowerCase().includes(q) ||
        ev.pii_types.some((t) => t.toLowerCase().includes(q)) ||
        (ev.routing_decision ?? "").toLowerCase().includes(q) ||
        (ev.domain ?? "").toLowerCase().includes(q) ||
        ev.audit_id.toLowerCase().includes(q);
      if (!inMessage) return false;
    }
    return true;
  });
}

// --- Haupt-Komponente ---

export function AuditTab() {
  const [filters, setFilters] = useState<AuditFilters>(DEFAULT_FILTERS);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const tableEndRef = useRef<HTMLDivElement>(null);

  // since = letzte 24h als Default (Oberon akzeptiert ISO-8601)
  const since = useMemo(() => {
    const d = new Date();
    d.setHours(d.getHours() - 24);
    return d.toISOString();
  }, []);

  const { data, isLoading, error } = useQuery({
    queryKey: qk.cockpit.audit(since),
    queryFn: () => api.getCockpitAudit({ since, limit: 200 }),
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  const allEvents = data?.events ?? [];

  // Abgeleitete Filter-Optionen
  const clientOptions = useMemo(
    () => Array.from(new Set(allEvents.map((e) => e.client_id).filter(Boolean) as string[])).sort(),
    [allEvents],
  );

  const filtered = useMemo(() => applyFilters(allEvents, filters), [allEvents, filters]);

  // Auto-Scroll ans Ende wenn neue Events kommen
  useEffect(() => {
    if (autoScroll && tableEndRef.current) {
      tableEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [allEvents.length, autoScroll]);

  const updateFilter = (patch: Partial<AuditFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  };

  const resetFilters = () => setFilters(DEFAULT_FILTERS);

  const onRowClick = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const exportCsv = () => {
    downloadBlob(
      auditEventsToCsv(filtered),
      `moag-audit-${Date.now()}.csv`,
      "text/csv;charset=utf-8",
    );
  };

  return (
    <div className="space-y-4 p-4" data-testid="audit-tab">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-fg">DSGVO-Audit</h1>
          <p className="text-xs text-fg-muted">
            {filtered.length} von {allEvents.length} Events (letzte 24h, Limit 200)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="audit-export-csv"
            onClick={exportCsv}
            className="rounded bg-bg-elevated px-3 py-1 text-xs text-fg hover:bg-bg-subtle"
          >
            CSV
          </button>
          <button
            type="button"
            data-testid="audit-auto-scroll-toggle"
            aria-pressed={autoScroll}
            onClick={() => setAutoScroll((v) => !v)}
            className={`rounded px-3 py-1 text-xs transition-colors ${
              autoScroll
                ? "bg-brand text-white"
                : "bg-bg-elevated text-fg-muted hover:text-fg"
            }`}
          >
            Auto-Scroll {autoScroll ? "an" : "aus"}
          </button>
          <button
            type="button"
            data-testid="audit-reset-filters"
            onClick={resetFilters}
            className="rounded bg-bg-elevated px-3 py-1 text-xs text-fg-muted hover:text-fg"
          >
            Filter zuruecksetzen
          </button>
        </div>
      </header>

      {/* Filter-Bar */}
      <Card title="Filter" bodyClassName="space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <select
            data-testid="audit-filter-event-type"
            aria-label="Event-Typ-Filter"
            value={filters.eventType}
            onChange={(e) => updateFilter({ eventType: e.target.value })}
            className="rounded border border-white/10 bg-bg-subtle px-2 py-1 text-sm text-fg"
          >
            <option value="">Alle Event-Typen</option>
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <select
            data-testid="audit-filter-severity"
            aria-label="Severity-Filter"
            value={filters.severity}
            onChange={(e) => updateFilter({ severity: e.target.value as AuditSeverity | "" })}
            className="rounded border border-white/10 bg-bg-subtle px-2 py-1 text-sm text-fg"
          >
            <option value="">Alle Severity-Stufen</option>
            <option value="high">Hoch</option>
            <option value="medium">Mittel</option>
            <option value="low">Niedrig</option>
          </select>

          <select
            data-testid="audit-filter-client"
            aria-label="Client-Filter"
            value={filters.clientId}
            onChange={(e) => updateFilter({ clientId: e.target.value })}
            className="rounded border border-white/10 bg-bg-subtle px-2 py-1 text-sm text-fg"
          >
            <option value="">Alle Clients</option>
            {clientOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <input
            type="search"
            placeholder="Freitext-Suche..."
            data-testid="audit-filter-search"
            aria-label="Audit-Freitext-Suche"
            value={filters.search}
            onChange={(e) => updateFilter({ search: e.target.value })}
            className="rounded border border-white/10 bg-bg-subtle px-2 py-1 text-sm text-fg"
          />
        </div>
      </Card>

      <Card>
        {isLoading && <LoadingSpinner label="Lade Audit-Events..." />}
        {error && (
          <div data-testid="audit-error" className="text-sm text-status-error">
            Fehler: {(error as Error).message}
          </div>
        )}

        {!isLoading && !error && (
          <>
            {filtered.length === 0 ? (
              <EmptyState
                title="Keine Audit-Events"
                description="Fuer die gewaehlten Filter gibt es keine Ereignisse."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm" data-testid="audit-table">
                  <thead className="border-b border-white/10">
                    <tr>
                      <th scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase text-fg-muted">
                        Zeitstempel
                      </th>
                      <th scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase text-fg-muted">
                        Typ
                      </th>
                      <th scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase text-fg-muted">
                        Severity
                      </th>
                      <th scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase text-fg-muted">
                        Client
                      </th>
                      <th scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase text-fg-muted">
                        PII-Typen
                      </th>
                      <th scope="col" className="px-3 py-2 text-right text-xs font-semibold uppercase text-fg-muted">
                        Dauer
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((ev) => {
                      const severity = calcSeverity(ev);
                      const isExpanded = expandedId === ev.audit_id;
                      return (
                        <>
                          <tr
                            key={ev.audit_id}
                            data-testid={`audit-row-${ev.audit_id}`}
                            className="cursor-pointer border-b border-white/5 hover:bg-bg-elevated/40"
                            onClick={() => onRowClick(ev.audit_id)}
                            aria-expanded={isExpanded}
                          >
                            <td className="px-3 py-2 text-fg-muted" title={absoluteTime(ev.ts)}>
                              <span className="font-mono text-xs">{relativeTime(ev.ts)}</span>
                              <span className="ml-1 text-xxs text-fg-subtle">
                                {absoluteTime(ev.ts)}
                              </span>
                            </td>
                            <td className="px-3 py-2">
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xxs font-medium ${eventTypeClass(ev.event_type)}`}
                                data-testid={`audit-type-pill-${ev.audit_id}`}
                              >
                                {ev.event_type}
                              </span>
                            </td>
                            <td className="px-3 py-2">
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xxs font-medium ${SEVERITY_CLASSES[severity]}`}
                                data-testid={`audit-severity-pill-${ev.audit_id}`}
                              >
                                {SEVERITY_LABELS[severity]}
                              </span>
                            </td>
                            <td className="px-3 py-2 font-mono text-xs text-fg">
                              {ev.client_id ?? "-"}
                            </td>
                            <td className="px-3 py-2 text-xs text-fg-muted">
                              {ev.pii_types.length > 0
                                ? ev.pii_types.join(", ")
                                : "-"}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-xs text-fg-muted">
                              {ev.duration_ms}ms
                            </td>
                          </tr>

                          {/* Expand-Zeile: volle Payload-Sicht */}
                          {isExpanded && (
                            <tr
                              key={`${ev.audit_id}-expanded`}
                              data-testid={`audit-row-expanded-${ev.audit_id}`}
                            >
                              <td colSpan={6} className="bg-bg-elevated/50 px-4 py-3">
                                <div className="space-y-1 text-xs">
                                  <div>
                                    <span className="text-fg-muted">audit_id: </span>
                                    <span className="font-mono text-fg">{ev.audit_id}</span>
                                  </div>
                                  <div>
                                    <span className="text-fg-muted">ts: </span>
                                    <span className="font-mono text-fg">{ev.ts}</span>
                                  </div>
                                  <div>
                                    <span className="text-fg-muted">anonymized: </span>
                                    <span className="font-mono text-fg">
                                      {String(ev.anonymized)}
                                    </span>
                                  </div>
                                  {ev.routing_decision != null && (
                                    <div>
                                      <span className="text-fg-muted">routing_decision: </span>
                                      <span className="font-mono text-fg">
                                        {ev.routing_decision}
                                      </span>
                                    </div>
                                  )}
                                  {ev.domain != null && (
                                    <div>
                                      <span className="text-fg-muted">domain: </span>
                                      <span className="font-mono text-fg">{ev.domain}</span>
                                    </div>
                                  )}
                                  <div>
                                    <span className="text-fg-muted">pii_types: </span>
                                    <span className="font-mono text-fg">
                                      {JSON.stringify(ev.pii_types)}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-fg-muted">duration_ms: </span>
                                    <span className="font-mono text-fg">{ev.duration_ms}</span>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
                <div ref={tableEndRef} aria-hidden="true" />
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

export default AuditTab;
