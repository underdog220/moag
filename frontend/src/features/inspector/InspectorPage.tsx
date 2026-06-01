// InspectorPage — Adapter-Status-Inspector (Debug-Tool, read-only).
// Zeigt alle Rohfelder jedes Adapters aus /api/v1/overview.
// Datenquelle: api.getOverview(), Polling 30s.
// Pflicht: ADR-004 Tooltips, PageBadge, Pipeline-Logging Kopierbar-Pflicht.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { qk } from "../../lib/queryKeys";
import { PageBadge } from "../../components/PageBadge";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import type { SystemStatus } from "../../lib/types";

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

/** Relativer Zeitabstand zu einem ISO-8601-Zeitstempel. */
function relativeTime(isoStr: string): string {
  try {
    const diff = Date.now() - new Date(isoStr).getTime();
    if (diff < 0) return "gerade eben";
    const sek = Math.floor(diff / 1000);
    if (sek < 60) return `vor ${sek}s`;
    const min = Math.floor(sek / 60);
    if (min < 60) return `vor ${min}min`;
    const std = Math.floor(min / 60);
    return `vor ${std}h`;
  } catch {
    return isoStr;
  }
}

/** Formatiert ISO-Zeitstempel als lesbare absolute Zeit. */
function absoluteTime(isoStr: string): string {
  try {
    return new Date(isoStr).toLocaleString("de-DE");
  } catch {
    return isoStr;
  }
}

// ─── Sub-Komponenten ─────────────────────────────────────────────────────────

/** Kleiner grüner/roter Status-Dot mit Tooltip. */
function StatusDot({ ok, error }: { ok: boolean; error: string | null }) {
  return (
    <span
      className={`inline-block h-3 w-3 rounded-full flex-shrink-0 ${
        ok ? "bg-status-ok" : "bg-status-error"
      }`}
      title={
        ok
          ? "Status: OK — Adapter antwortet fehlerfrei. Quelle: GET /api/v1/overview"
          : `Status: Fehler — ${error ?? "unbekannter Fehler"}. Quelle: GET /api/v1/overview`
      }
      aria-label={ok ? "OK" : "Fehler"}
    />
  );
}

/** Metriken-Tabelle mit allen Schlüssel-Wert-Paaren. */
function MetricsTable({ metrics }: { metrics: SystemStatus["metrics"] }) {
  const entries = Object.entries(metrics);
  if (entries.length === 0) {
    return (
      <p
        className="text-xs text-fg-subtle italic"
        title="Keine Metriken vom Adapter geliefert. Quelle: GET /api/v1/overview"
      >
        keine Metriken
      </p>
    );
  }
  return (
    <table
      className="w-full text-xs"
      title="Rohe Metriken dieses Adapters. Quelle: GET /api/v1/overview"
    >
      <thead>
        <tr>
          <th
            className="pb-1 pr-3 text-left font-medium text-fg-subtle"
            title="Metrik-Schlüssel aus dem metrics-Dict des Adapters"
          >
            Schlüssel
          </th>
          <th
            className="pb-1 text-right font-medium text-fg-subtle"
            title="Metrik-Wert (number | string | boolean | null)"
          >
            Wert
          </th>
        </tr>
      </thead>
      <tbody>
        {entries.map(([key, val]) => (
          <tr key={key} className="border-t border-white/5">
            <td
              className="py-0.5 pr-3 font-mono text-fg-muted"
              title={`Metrik-Feld "${key}". Quelle: GET /api/v1/overview`}
            >
              {key}
            </td>
            <td
              className="py-0.5 text-right tabular-nums text-fg"
              title={`Wert von "${key}": ${String(val)}. Quelle: GET /api/v1/overview`}
            >
              {val === null ? (
                <span className="text-fg-subtle italic">null</span>
              ) : val === true ? (
                <span className="text-status-ok">true</span>
              ) : val === false ? (
                <span className="text-status-error">false</span>
              ) : (
                String(val)
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Kopier-Hilfsfunktion ─────────────────────────────────────────────────────

/** Kopiert Text in die Zwischenablage und gibt Bestätigung zurück. */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// ─── Adapter-Detailkarte ──────────────────────────────────────────────────────

interface AdapterCardProps {
  system: SystemStatus;
}

function AdapterCard({ system }: AdapterCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const json = JSON.stringify(system, null, 2);
    const ok = await copyToClipboard(json);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div
      data-testid={`inspector-${system.id}`}
      className={`rounded-lg border bg-bg-panel transition-colors ${
        system.ok ? "border-white/10" : "border-status-error/30"
      }`}
    >
      {/* Karten-Header — immer sichtbar */}
      <div
        className="flex cursor-pointer items-center gap-3 p-4"
        onClick={() => setExpanded((e) => !e)}
        role="button"
        aria-expanded={expanded}
        aria-controls={`inspector-body-${system.id}`}
        title={`Adapter "${system.name}" — Klicken zum ${expanded ? "Einklappen" : "Ausklappen"} der Rohfelder. Quelle: GET /api/v1/overview`}
      >
        {/* Status-Dot */}
        <StatusDot ok={system.ok} error={system.error} />

        {/* Name + ID */}
        <div className="min-w-0 flex-1">
          <span
            className="font-semibold text-fg"
            title={`Adapter-Name: "${system.name}". Quelle: GET /api/v1/overview`}
          >
            {system.name}
          </span>
          <span
            className="ml-2 font-mono text-xs text-fg-subtle"
            title={`system_id (interner Bezeichner des Adapters). Quelle: GET /api/v1/overview`}
          >
            {system.id}
          </span>
        </div>

        {/* Score */}
        <span
          className={`tabular-nums text-sm font-semibold ${
            system.score >= 70
              ? "text-status-ok"
              : system.score >= 40
                ? "text-status-warn"
                : "text-status-error"
          }`}
          title={`Gesundheits-Score 0–100. ≥70 = OK, 40–69 = Warnung, <40 = Fehler. Quelle: GET /api/v1/overview`}
        >
          {system.score}%
        </span>

        {/* Gruppe */}
        <span
          className="hidden rounded bg-bg-elevated px-2 py-0.5 text-xs text-fg-subtle sm:inline-block"
          title={`Gruppe dieses Adapters (KI-Backbone / Infrastruktur / Compliance & Test). Quelle: GET /api/v1/overview`}
        >
          {system.group}
        </span>

        {/* Expand-Chevron */}
        <span
          className={`text-fg-subtle transition-transform ${expanded ? "rotate-90" : ""}`}
          aria-hidden="true"
        >
          ›
        </span>
      </div>

      {/* Karten-Body — ausgeklappt */}
      {expanded && (
        <div
          id={`inspector-body-${system.id}`}
          className="border-t border-white/5 p-4 space-y-4"
        >
          {/* Rohdaten-Tabelle */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
              Rohfelder
            </h3>
            <dl className="space-y-1 text-sm">
              {/* id */}
              <div className="flex gap-3">
                <dt
                  className="w-28 flex-shrink-0 font-mono text-xs text-fg-subtle"
                  title="system_id — interner Bezeichner des Adapters. Quelle: GET /api/v1/overview"
                >
                  system_id
                </dt>
                <dd className="font-mono text-fg">{system.id}</dd>
              </div>

              {/* name */}
              <div className="flex gap-3">
                <dt
                  className="w-28 flex-shrink-0 font-mono text-xs text-fg-subtle"
                  title="name — Anzeigename des Adapters. Quelle: GET /api/v1/overview"
                >
                  name
                </dt>
                <dd className="text-fg">{system.name}</dd>
              </div>

              {/* group */}
              <div className="flex gap-3">
                <dt
                  className="w-28 flex-shrink-0 font-mono text-xs text-fg-subtle"
                  title="group — Gruppenzugehörigkeit (KI-Backbone / Infrastruktur / Compliance & Test). Quelle: GET /api/v1/overview"
                >
                  group
                </dt>
                <dd className="text-fg">{system.group}</dd>
              </div>

              {/* ok */}
              <div className="flex gap-3">
                <dt
                  className="w-28 flex-shrink-0 font-mono text-xs text-fg-subtle"
                  title="ok — true wenn Adapter erreichbar und fehlerfrei, false bei Fehler. Quelle: GET /api/v1/overview"
                >
                  ok
                </dt>
                <dd>
                  <span
                    className={system.ok ? "text-status-ok" : "text-status-error"}
                    title={`ok = ${String(system.ok)}. Quelle: GET /api/v1/overview`}
                  >
                    {String(system.ok)}
                  </span>
                </dd>
              </div>

              {/* score */}
              <div className="flex gap-3">
                <dt
                  className="w-28 flex-shrink-0 font-mono text-xs text-fg-subtle"
                  title="score — Gesundheits-Score 0..100. ≥70 OK, 40–69 Warnung, <40 Fehler. Quelle: GET /api/v1/overview"
                >
                  score
                </dt>
                <dd
                  className="tabular-nums text-fg"
                  title={`Rohwert: ${system.score}. Quelle: GET /api/v1/overview`}
                >
                  {system.score}
                </dd>
              </div>

              {/* summary */}
              <div className="flex gap-3">
                <dt
                  className="w-28 flex-shrink-0 font-mono text-xs text-fg-subtle"
                  title="summary — Einzeiler-Statusbeschreibung vom Adapter. Quelle: GET /api/v1/overview"
                >
                  summary
                </dt>
                <dd className="text-fg">{system.summary}</dd>
              </div>

              {/* error */}
              <div className="flex gap-3">
                <dt
                  className="w-28 flex-shrink-0 font-mono text-xs text-fg-subtle"
                  title="error — Fehlermeldung bei ok=false, sonst null. Quelle: GET /api/v1/overview"
                >
                  error
                </dt>
                <dd>
                  {system.error ? (
                    <code
                      className="break-all font-mono text-xs text-status-error"
                      title={`Fehlermeldung: ${system.error}. Quelle: GET /api/v1/overview`}
                    >
                      {system.error}
                    </code>
                  ) : (
                    <span
                      className="text-xs text-fg-subtle italic"
                      title="Kein Fehler vorhanden. Quelle: GET /api/v1/overview"
                    >
                      null
                    </span>
                  )}
                </dd>
              </div>

              {/* fetched_at */}
              <div className="flex gap-3">
                <dt
                  className="w-28 flex-shrink-0 font-mono text-xs text-fg-subtle"
                  title="fetched_at — Zeitpunkt der letzten Abfrage dieses Adapters (ISO-8601 UTC). Quelle: GET /api/v1/overview"
                >
                  fetched_at
                </dt>
                <dd>
                  <span
                    className="text-fg"
                    title={`Absolut: ${absoluteTime(system.fetched_at)} · ISO: ${system.fetched_at} · Quelle: GET /api/v1/overview`}
                  >
                    {relativeTime(system.fetched_at)}
                  </span>
                  <span className="ml-2 text-xs text-fg-subtle">
                    ({absoluteTime(system.fetched_at)})
                  </span>
                </dd>
              </div>
            </dl>
          </section>

          {/* Metriken */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
              Metriken
            </h3>
            <MetricsTable metrics={system.metrics} />
          </section>

          {/* "JSON kopieren"-Button */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleCopy}
              className="rounded bg-bg-elevated px-3 py-1 text-xs text-fg-muted transition-colors
                         hover:bg-brand/10 hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand/40"
              title={`Rohes JSON dieses Adapters (SystemStatus) in die Zwischenablage kopieren. Quelle: GET /api/v1/overview`}
            >
              {copied ? "Kopiert!" : "JSON kopieren"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── InspectorPage ────────────────────────────────────────────────────────────

export function InspectorPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: qk.overview,
    queryFn: () => api.getOverview(),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    retry: 1,
  });

  const systems: SystemStatus[] = data?.systems ?? [];
  const [allCopied, setAllCopied] = useState(false);

  async function handleCopyAll() {
    const json = JSON.stringify(systems, null, 2);
    const ok = await copyToClipboard(json);
    if (ok) {
      setAllCopied(true);
      setTimeout(() => setAllCopied(false), 2000);
    }
  }

  return (
    <div className="min-h-full p-4 pb-12" data-testid="inspector-page">
      {/* Seitenkopf */}
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-fg">Adapter-Status-Inspector</h1>
          <p className="mt-1 text-base text-fg-muted">
            Alle Rohfelder jedes Adapters aus{" "}
            <code
              className="font-mono text-sm text-fg-subtle"
              title="HTTP-GET-Endpunkt der MOAG-Aggregator-API"
            >
              GET /api/v1/overview
            </code>
            {" "}— read-only Debug-Ansicht. Polling alle 30s.
          </p>
        </div>

        {/* "Alles kopieren"-Button — erfüllt Pipeline-Logging Kopierbar-Pflicht */}
        <button
          type="button"
          onClick={handleCopyAll}
          disabled={systems.length === 0}
          className="rounded bg-bg-elevated px-4 py-2 text-sm text-fg-muted transition-colors
                     hover:bg-brand/10 hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand/40
                     disabled:cursor-not-allowed disabled:opacity-40"
          title="Gesamte systems-Liste als formatiertes JSON in die Zwischenablage kopieren. Quelle: GET /api/v1/overview"
        >
          {allCopied ? "Alles kopiert!" : "Alles kopieren"}
        </button>
      </header>

      {/* Lade-Zustand */}
      {isLoading && systems.length === 0 && (
        <LoadingSpinner label="Lade Adapter-Status..." />
      )}

      {/* Fehler-Zustand */}
      {error && systems.length === 0 && (
        <div
          className="rounded border border-status-error/30 bg-status-error/10 p-4 text-sm text-status-error"
          title={`Fehler beim Laden der Adapter-Daten. Quelle: GET /api/v1/overview`}
        >
          Fehler beim Laden: {(error as Error).message}
        </div>
      )}

      {/* Adapter-Liste */}
      {systems.length > 0 && (
        <div className="space-y-3">
          {systems.map((system) => (
            <AdapterCard key={system.id} system={system} />
          ))}
        </div>
      )}

      {/* Leer-Zustand (nach Laden, aber keine Systeme) */}
      {!isLoading && !error && systems.length === 0 && (
        <p
          className="text-center text-sm text-fg-subtle"
          title="Backend hat eine leere systems-Liste geliefert. Quelle: GET /api/v1/overview"
        >
          Keine Adapter-Daten verfügbar.
        </p>
      )}

      <PageBadge id="inspector" />
    </div>
  );
}

export default InspectorPage;
