// ManifestHealth — Hub-Manifest-Health-Karte (Multi-Hub-View)
// Sub-Route: /octoboss/manifest-health
// Datenquellen:
//   GET /api/v1/manifest/health/all — alle konfigurierten Hubs parallel
//   GET /api/v1/manifest/health     — Einzel-Hub (Backward-Compat, beibehalten)
//
// Zeigt Schema-Validierung, Cross-Ref, node_overrides-Bug, EXE-Existenz,
// SHA-Match und Live-Konsistenz fuer Bootstrapper- und Core-Manifests.
// Aktiver Hub (default_hub_id) wird visuell hervorgehoben.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import { Tooltip } from "../../../components/Tooltip";
import { PageBadge } from "../../../components/PageBadge";
import { LoadingSpinner } from "../../../components/LoadingSpinner";
import {
  ClusterIntentSection,
  type HubInventory,
  type ManifestInventoryAll,
} from "../components/ClusterIntentSection";

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

// Typen fuer das Multi-Hub-Response (schema: manifest-health-all-v1)

interface HubHealthEntry {
  id: string;
  url: string;
  is_active: boolean;
  // Bei Erfolg: vollstaendiges ManifestHealthData-Objekt
  // Bei Timeout / Verbindungsfehler: {error: string, detail: string}
  health: ManifestHealthData | { error: string; detail: string };
}

interface ManifestHealthAllData {
  schema: "manifest-health-all-v1";
  active_hub_id: string;
  hubs: HubHealthEntry[];
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

// ── Hilfsfunktion: ist health ein Fehler? ────────────────────────────────────

function isHealthError(h: HubHealthEntry["health"]): h is { error: string; detail: string } {
  return typeof (h as { error?: unknown }).error === "string";
}

// ── Hub-Card (eine Karte pro konfiguriertem Hub) ──────────────────────────────

function HubCard({
  entry,
  inventory,
}: {
  entry: HubHealthEntry;
  inventory: HubInventory | null;
}) {
  const health = entry.health;
  const hasError = isHealthError(health);

  // Gesamt-Status fuer den Card-Header
  const overallStatus: "green" | "yellow" | "red" = hasError
    ? "red"
    : (health as ManifestHealthData).summary?.overall_status ?? "yellow";

  return (
    <div
      className={`rounded border-2 bg-bg-panel ${
        entry.is_active
          ? "border-status-ok/60 ring-1 ring-status-ok/20"
          : "border-white/10"
      }`}
      data-testid={`hub-card-${entry.id}`}
    >
      {/* Card-Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Hub-Aktiv-Badge */}
          {entry.is_active ? (
            <Tooltip
              title="Dies ist der aktuell als default_hub_id konfigurierte Hub — pollende Nodes greifen typischerweise auf diesen zu."
              source="/api/v1/manifest/health/all"
            >
              <span className="inline-flex items-center gap-1 rounded border border-status-ok/40 bg-status-ok/10 px-2 py-0.5 text-xs font-semibold text-status-ok">
                ★ Aktiv
              </span>
            </Tooltip>
          ) : (
            <Tooltip
              title="Theoretisch erreichbar, aber nicht als default konfiguriert. Nodes pollen typischerweise den aktiven Hub."
              source="/api/v1/manifest/health/all"
            >
              <span className="inline-flex items-center gap-1 rounded border border-white/20 bg-bg-elevated px-2 py-0.5 text-xs font-semibold text-fg-muted">
                Sekundär
              </span>
            </Tooltip>
          )}

          {/* Hub-ID */}
          <Tooltip
            title={`Hub-ID: ${entry.id} · URL: ${entry.url}`}
            source="/api/v1/manifest/health/all"
          >
            <span className="font-semibold text-fg">{entry.id}</span>
          </Tooltip>

          {/* Gesamt-Status-Badge */}
          {!hasError && <StatusBadge status={overallStatus} />}
          {hasError && (
            <span className="inline-flex items-center gap-1 rounded border border-status-error/30 bg-status-error/10 px-2 py-0.5 text-xs font-semibold text-status-error">
              ✗ Nicht erreichbar
            </span>
          )}
        </div>

        {/* Hub-URL (dezent) */}
        <Tooltip
          title={`Hub-Endpunkt: ${entry.url}`}
          source="/api/v1/manifest/health/all"
        >
          <span className="font-mono text-xs text-fg-subtle">{entry.url}</span>
        </Tooltip>
      </div>

      {/* Fehler-Zustand: Timeout oder Verbindungsfehler */}
      {hasError && (
        <div className="px-4 py-3">
          <p className="mb-1 text-xs font-semibold text-status-error">
            {(health as { error: string }).error === "timeout"
              ? "Timeout: Hub hat nicht innerhalb von 5s geantwortet"
              : "Verbindungsfehler"}
          </p>
          <p className="font-mono text-xs text-fg-subtle">
            {(health as { detail: string }).detail}
          </p>
        </div>
      )}

      {/* Erfolg: Bootstrapper- + Core-Sektionen */}
      {!hasError && (() => {
        const h = health as ManifestHealthData;
        return (
          <div className="flex flex-col gap-4 p-4">
            {h.manifests?.bootstrapper && (
              <ManifestSection
                title="Bootstrapper-Manifest"
                result={h.manifests.bootstrapper}
                endpoint={h.manifests.bootstrapper.manifest_endpoint}
              />
            )}
            {h.manifests?.core && (
              <ManifestSection
                title="Core-Manifest"
                result={h.manifests.core}
                endpoint={h.manifests.core.manifest_endpoint}
              />
            )}

            {/* Cluster-Intent: Versionen + Overrides + Module-Drift */}
            {inventory && (
              <div className="mt-2 border-t border-white/10 pt-4">
                <div className="mb-3 flex items-center gap-2">
                  <span aria-hidden="true" className="text-fg-muted">⛁</span>
                  <h4 className="text-sm font-semibold text-fg">Cluster-Intent</h4>
                  <Tooltip
                    title="Soll-Zustand des Clusters: welche Versionen sollen wo laufen, wer ist gepinnt, wo driftet die Realitaet."
                    source="/api/v1/manifest/inventory"
                  >
                    <span className="text-xs text-fg-subtle cursor-help">(?)</span>
                  </Tooltip>
                </div>
                <ClusterIntentSection inventory={inventory} hubId={entry.id} />
              </div>
            )}

            {/* Cache-TTL-Hinweis */}
            {h.summary?.cache_ttl_note && (
              <p className="text-xs text-fg-subtle">{h.summary.cache_ttl_note}</p>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// ── Haupt-Komponente ──────────────────────────────────────────────────────────

export function ManifestHealthPage() {
  // Multi-Hub-Query: alle konfigurierten Hubs parallel
  const { data: allData, isLoading, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["octoboss", "manifest-health-all"],
    queryFn: () => api.octoboss.getManifestHealthAll(),
    refetchInterval: 60_000,  // alle 60s automatisch — Cache-TTL ist 30s
  });

  // Cluster-Intent-Inventar (Versionen, Overrides, Module): eigener Endpoint,
  // unabhaengiges Polling-Intervall (15s — Pinning-/Default-Aktionen sollen
  // schnell sichtbar werden).
  const { data: inventoryData } = useQuery({
    queryKey: ["octoboss", "manifest-inventory"],
    queryFn: () => api.octoboss.getManifestInventory(),
    refetchInterval: 15_000,
  });

  const allHealth = allData as ManifestHealthAllData | undefined;
  const inventoryAll = inventoryData as ManifestInventoryAll | undefined;
  const inventoryByHub: Record<string, HubInventory | null> = {};
  if (inventoryAll) {
    for (const h of inventoryAll.hubs) {
      inventoryByHub[h.id] = h.inventory;
    }
  }
  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString("de-DE")
    : null;

  // Gesamt-Status aus allen Hubs aggregieren
  const overallStatus: "green" | "yellow" | "red" | null = allHealth
    ? (() => {
        let worst: "green" | "yellow" | "red" = "green";
        for (const entry of allHealth.hubs) {
          if (isHealthError(entry.health)) {
            worst = "red";
            break;
          }
          const s = (entry.health as ManifestHealthData).summary?.overall_status;
          if (s === "red") { worst = "red"; break; }
          if (s === "yellow" && worst === "green") worst = "yellow";
        }
        return worst;
      })()
    : null;

  return (
    <div className="flex flex-col gap-6">
      {/* Seitenheader */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-fg">Manifest-Health</h2>
          {overallStatus && <StatusBadge status={overallStatus} />}
          {allHealth && (
            <Tooltip
              title={`${allHealth.hubs.length} Hub(s) konfiguriert · aktiver Hub: ${allHealth.active_hub_id}`}
              source="/api/v1/manifest/health/all"
            >
              <span className="text-xs text-fg-subtle">
                {allHealth.hubs.length} Hub{allHealth.hubs.length !== 1 ? "s" : ""}
              </span>
            </Tooltip>
          )}
        </div>

        <div className="flex items-center gap-3">
          {lastUpdated && (
            <Tooltip
              title="Zeitpunkt der letzten Abfrage"
              source="/api/v1/manifest/health/all"
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

      {/* Multi-Hub-Cards — vertikal gestapelt */}
      {allHealth && allHealth.hubs.map((entry) => (
        <HubCard
          key={entry.id}
          entry={entry}
          inventory={inventoryByHub[entry.id] ?? null}
        />
      ))}

      {/* Hinweis: Daten-Quellen-Limitierung (nur wenn mindestens ein Hub erfolgreich) */}
      {allHealth && allHealth.hubs.some((e) => !isHealthError(e.health)) && (
        <div className="rounded border border-white/10 bg-bg-panel px-4 py-3">
          <p className="mb-1 text-xs font-semibold text-fg-muted">Daten-Quellen-Hinweis (Option A)</p>
          <p className="text-xs text-fg-subtle">
            Schema-Validierung basiert auf vom Hub aufgeloesten Feldern, nicht auf rohem Manifest-File.
            node_overrides-Drift wird nur erkannt wenn Hub ihn exponiert.
          </p>
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
