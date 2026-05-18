// ManifestHealth — Hub-Manifest-Health-Karte
// Sub-Route: /octoboss/manifest-health
// Datenquelle: GET /api/v1/manifest/health
//
// Zeigt Schema-Validierung, Cross-Ref, node_overrides-Bug, EXE-Existenz,
// SHA-Match und Live-Konsistenz fuer Bootstrapper- und Core-Manifests.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import { Tooltip } from "../../../components/Tooltip";
import { PageBadge } from "../../../components/PageBadge";
import { LoadingSpinner } from "../../../components/LoadingSpinner";

// ── Typen ─────────────────────────────────────────────────────────────────────

interface ManifestCheck {
  id: string;
  label: string;
  status: "green" | "yellow" | "red";
  detail: string;
  hint?: string;
  example?: string;
  schema_ref?: string;
  value_actual?: string | null;
  value_expected?: string | null;
}

interface ManifestResult {
  status: "green" | "yellow" | "red";
  checks: ManifestCheck[];
  errors: string[];
  warnings: string[];
  hints: string[];
  hub_url: string;
  data_source: string;
  manifest_endpoint: string;
}

interface ManifestHealthData {
  manifests: {
    bootstrapper?: ManifestResult;
    core?: ManifestResult;
  };
  summary: {
    overall_status: "green" | "yellow" | "red";
    errors_count: number;
    warnings_count: number;
    hub_url: string;
    data_source_note: string;
    cache_ttl_note: string;
  };
  fetched_at: string;
}

// ── Hilfsfunktionen ────────────────────────────────────────────────────────────

function statusColor(s: "green" | "yellow" | "red") {
  switch (s) {
    case "green":
      return "text-status-ok";
    case "yellow":
      return "text-status-warn";
    case "red":
      return "text-status-error";
  }
}

function statusBg(s: "green" | "yellow" | "red") {
  switch (s) {
    case "green":
      return "bg-status-ok/10 border-status-ok/30";
    case "yellow":
      return "bg-status-warn/10 border-status-warn/30";
    case "red":
      return "bg-status-error/10 border-status-error/30";
  }
}

function statusIcon(s: "green" | "yellow" | "red") {
  switch (s) {
    case "green":
      return "✓";
    case "yellow":
      return "⚠";
    case "red":
      return "✗";
  }
}

function StatusBadge({ status }: { status: "green" | "yellow" | "red" }) {
  const label = status === "green" ? "OK" : status === "yellow" ? "Warnung" : "Fehler";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-semibold ${statusBg(status)} ${statusColor(status)}`}
    >
      {statusIcon(status)} {label}
    </span>
  );
}

// ── Check-Zeile ────────────────────────────────────────────────────────────────

function CheckRow({ check }: { check: ManifestCheck }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetail =
    check.detail || check.hint || check.example || check.schema_ref;
  const isClickable = hasDetail && check.status !== "green";

  return (
    <div className="border-b border-white/5 last:border-0">
      <button
        className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors
          ${isClickable ? "cursor-pointer hover:bg-bg-elevated/40" : "cursor-default"}`}
        onClick={() => isClickable && setExpanded((e) => !e)}
        disabled={!isClickable}
        aria-expanded={isClickable ? expanded : undefined}
      >
        {/* Status-Icon */}
        <span
          className={`shrink-0 text-sm font-bold tabular-nums ${statusColor(check.status)}`}
          aria-label={`Status: ${check.status}`}
        >
          {statusIcon(check.status)}
        </span>

        {/* Label */}
        <Tooltip
          title={`Check: ${check.label}. ${check.detail ? check.detail.split("\n")[0] : ""}`}
          source="/api/v1/manifest/health"
        >
          <span className="flex-1 text-sm text-fg">{check.label}</span>
        </Tooltip>

        {/* Expand-Pfeil bei Fehler/Warnung */}
        {isClickable && (
          <span className="shrink-0 text-xs text-fg-subtle">{expanded ? "▲" : "▼"}</span>
        )}
      </button>

      {/* Aufgeklappter Detail-Block */}
      {isClickable && expanded && (
        <div
          className={`mx-4 mb-3 rounded border p-3 text-xs ${statusBg(check.status)}`}
        >
          {check.detail && (
            <div className="mb-2">
              <p className="mb-1 font-semibold text-fg-muted">Befund</p>
              <pre className="whitespace-pre-wrap font-mono text-fg">{check.detail}</pre>
            </div>
          )}

          {check.value_actual && (
            <div className="mb-2 grid grid-cols-2 gap-2">
              <div>
                <p className="mb-0.5 font-semibold text-fg-muted">Ist</p>
                <code className="text-status-error">{check.value_actual}</code>
              </div>
              {check.value_expected && (
                <div>
                  <p className="mb-0.5 font-semibold text-fg-muted">Soll</p>
                  <code className="text-status-ok">{check.value_expected}</code>
                </div>
              )}
            </div>
          )}

          {check.hint && (
            <div className="mb-2">
              <p className="mb-1 font-semibold text-fg-muted">Hinweis</p>
              <p className="text-fg">{check.hint}</p>
            </div>
          )}

          {check.example && (
            <div className="mb-2">
              <p className="mb-1 font-semibold text-fg-muted">Korrektur-Beispiel</p>
              <pre className="rounded bg-bg-panel px-2 py-1 font-mono text-fg">{check.example}</pre>
            </div>
          )}

          {check.schema_ref && (
            <div>
              <p className="mb-0.5 font-semibold text-fg-muted">Schema-Referenz</p>
              <code className="text-fg-subtle">{check.schema_ref}</code>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Manifest-Sektion (Bootstrapper oder Core) ─────────────────────────────────

function ManifestSection({
  title,
  result,
  endpoint,
}: {
  title: string;
  result: ManifestResult;
  endpoint: string;
}) {
  return (
    <div className="rounded border border-white/10 bg-bg-panel">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-3">
          <Tooltip
            title={`${title}: Gesamt-Status der Manifest-Validierung`}
            source={endpoint}
            thresholds="grün=alle OK · gelb=Warnungen · rot=Fehler"
          >
            <h3 className="text-sm font-semibold text-fg">{title}</h3>
          </Tooltip>
          <StatusBadge status={result.status} />
        </div>

        <Tooltip
          title={`Datenquelle: ${endpoint}`}
          source={endpoint}
        >
          <span className="font-mono text-xs text-fg-subtle">{endpoint.replace(/https?:\/\/[^/]+/, "")}</span>
        </Tooltip>
      </div>

      {/* Check-Liste */}
      <div>
        {result.checks.map((check) => (
          <CheckRow key={check.id} check={check} />
        ))}
      </div>

      {/* Fehlerzusammenfassung unten */}
      {result.hints.length > 0 && (
        <div className="border-t border-white/10 px-4 py-3">
          <p className="mb-1.5 text-xs font-semibold text-fg-muted">Allgemeine Hinweise</p>
          <ul className="list-inside list-disc space-y-1">
            {result.hints.map((h, i) => (
              <li key={i} className="text-xs text-status-warn">
                {h}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Haupt-Komponente ──────────────────────────────────────────────────────────

export function ManifestHealthPage() {
  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["octoboss", "manifest-health"],
    queryFn: () => api.octoboss.getManifestHealth(),
    refetchInterval: 60_000,  // alle 60s automatisch — Cache-TTL ist 30s
  });

  const health = data as ManifestHealthData | undefined;
  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString("de-DE")
    : null;

  return (
    <div className="flex flex-col gap-6">
      {/* Seitenheader */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-fg">Manifest-Health</h2>
          {health && <StatusBadge status={health.summary.overall_status} />}
        </div>

        <div className="flex items-center gap-3">
          {lastUpdated && (
            <Tooltip
              title="Zeitpunkt der letzten Abfrage"
              source="/api/v1/manifest/health"
              updatedAt={lastUpdated}
            >
              <span className="text-xs text-fg-subtle">Stand: {lastUpdated}</span>
            </Tooltip>
          )}
          <button
            onClick={() => void refetch()}
            className="rounded border border-white/20 bg-bg-panel px-3 py-1.5 text-xs text-fg-muted
              hover:border-white/40 hover:text-fg transition-colors min-h-[44px] min-w-[44px]
              flex items-center justify-center"
            aria-label="Manifest-Health-Daten neu laden"
          >
            Neu laden
          </button>
        </div>
      </div>

      {/* Lade-Zustand */}
      {isLoading && <LoadingSpinner />}

      {/* Fehler-Zustand */}
      {error && (
        <div className="rounded border border-status-error/30 bg-status-error/10 px-4 py-3 text-sm text-status-error">
          <p className="font-semibold">Fehler beim Abrufen der Manifest-Health-Daten</p>
          <p className="mt-1 font-mono text-xs">{(error as Error).message}</p>
        </div>
      )}

      {/* Summary-Header */}
      {health && (
        <div className={`rounded border px-4 py-3 ${statusBg(health.summary.overall_status)}`}>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className={`font-semibold ${statusColor(health.summary.overall_status)}`}>
              {health.summary.overall_status === "green"
                ? "Alle Manifests sind konsistent"
                : health.summary.overall_status === "yellow"
                  ? "Warnungen erkannt — pruefen empfohlen"
                  : "Fehler erkannt — Manifests inkonsistent"}
            </span>
            {health.summary.errors_count > 0 && (
              <span className="text-status-error">
                {health.summary.errors_count} Fehler
              </span>
            )}
            {health.summary.warnings_count > 0 && (
              <span className="text-status-warn">
                {health.summary.warnings_count} Warnungen
              </span>
            )}
            <Tooltip
              title={`Daten-Quelle: ${health.summary.data_source_note}`}
              source="/api/v1/manifest/health"
            >
              <span className="ml-auto text-xs text-fg-subtle">
                Hub: {health.summary.hub_url}
              </span>
            </Tooltip>
          </div>

          {/* Cache-TTL-Hinweis */}
          <p className="mt-2 text-xs text-fg-subtle">{health.summary.cache_ttl_note}</p>
        </div>
      )}

      {/* Manifest-Sektionen */}
      {health?.manifests.bootstrapper && (
        <ManifestSection
          title="Bootstrapper-Manifest"
          result={health.manifests.bootstrapper}
          endpoint={health.manifests.bootstrapper.manifest_endpoint}
        />
      )}

      {health?.manifests.core && (
        <ManifestSection
          title="Core-Manifest"
          result={health.manifests.core}
          endpoint={health.manifests.core.manifest_endpoint}
        />
      )}

      {/* Hinweis: Daten-Quellen-Limitierung */}
      {health && (
        <div className="rounded border border-white/10 bg-bg-panel px-4 py-3">
          <p className="mb-1 text-xs font-semibold text-fg-muted">Daten-Quellen-Hinweis (Option A)</p>
          <p className="text-xs text-fg-subtle">{health.summary.data_source_note}</p>
          <p className="mt-2 text-xs text-fg-subtle">
            Vollstaendige Manifest-Datei-Validierung (inkl. node_overrides aller Nodes)
            ist mit einem OctoBoss-Admin-Endpoint moeglich (Option C — CR ausstehend).
          </p>
        </div>
      )}

      <PageBadge id="octoboss.manifest-health" />
    </div>
  );
}

export default ManifestHealthPage;
