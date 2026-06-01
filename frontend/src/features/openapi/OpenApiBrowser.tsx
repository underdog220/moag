// OpenApiBrowser — Seite fuer den OpenAPI-Endpoint-Browser.
// Datenquellen:
//   GET /api/v1/openapi/targets — Target-Liste (einmalig geladen)
//   GET /api/v1/openapi/{target} — Endpoint-Liste des gewaehlten Targets

import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageBadge } from "../../components/PageBadge";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Tooltip } from "../../components/Tooltip";
import {
  fetchOpenApiTargets,
  fetchOpenApiSpec,
  type OpenApiEndpoint,
} from "./openapiApi";

// ── HTTP-Methode Farbe ─────────────────────────────────────────────────────────

function methodColor(method: string): string {
  switch (method.toUpperCase()) {
    case "GET":    return "bg-status-ok/20 text-status-ok border-status-ok/30";
    case "POST":   return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    case "PUT":    return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    case "PATCH":  return "bg-orange-500/20 text-orange-400 border-orange-500/30";
    case "DELETE": return "bg-status-error/20 text-status-error border-status-error/30";
    default:       return "bg-fg-subtle/20 text-fg-muted border-fg-subtle/30";
  }
}

// ── Suche / Filter ─────────────────────────────────────────────────────────────

function filterEndpoints(
  endpoints: OpenApiEndpoint[],
  query: string,
): OpenApiEndpoint[] {
  const q = query.trim().toLowerCase();
  if (!q) return endpoints;
  return endpoints.filter(
    (ep) =>
      ep.path.toLowerCase().includes(q) ||
      ep.summary.toLowerCase().includes(q) ||
      ep.tags.some((t) => t.toLowerCase().includes(q)) ||
      ep.method.toLowerCase().includes(q),
  );
}

// ── Haupt-Komponente ───────────────────────────────────────────────────────────

export function OpenApiBrowser() {
  const [selectedTarget, setSelectedTarget] = useState<string>("moag");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Target-Liste laden
  const {
    data: targets,
    isLoading: targetsLoading,
    error: targetsError,
  } = useQuery({
    queryKey: ["openapi", "targets"],
    queryFn: fetchOpenApiTargets,
    staleTime: 60_000,
    retry: 1,
  });

  // Endpoint-Liste fuer das gewaehlte Target laden
  const {
    data: spec,
    isLoading: specLoading,
    error: specError,
    isFetching: specFetching,
  } = useQuery({
    queryKey: ["openapi", "spec", selectedTarget],
    queryFn: () => fetchOpenApiSpec(selectedTarget),
    staleTime: 30_000,
    retry: 0,
    enabled: Boolean(selectedTarget),
  });

  const handleTargetChange = useCallback(
    (id: string) => {
      setSelectedTarget(id);
      setSearchQuery("");
    },
    [],
  );

  const visibleEndpoints = filterEndpoints(spec?.endpoints ?? [], searchQuery);

  return (
    <div
      className="min-h-full p-4 pb-12"
      data-testid="openapi-browser"
    >
      {/* Kopfzeile */}
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-fg">
          MOAG — OpenAPI-Browser
        </h1>
        <p className="mt-1 text-base text-fg-muted">
          Durchsuche die API-Endpoints von MOAG und den angebundenen Sub-Systemen.
        </p>
      </header>

      {/* Fehler beim Laden der Targets */}
      {targetsError && (
        <div
          className="mb-4 rounded border border-status-error/30 bg-status-error/10 p-3 text-sm text-status-error"
          data-testid="targets-error"
        >
          Targets konnten nicht geladen werden: {(targetsError as Error).message}
        </div>
      )}

      <div className="flex flex-col gap-4 lg:flex-row">

        {/* ── Linke Spalte: Target-Auswahl ─────────────────────────────────── */}
        <aside className="w-full lg:w-56 shrink-0">
          <div className="rounded border border-white/10 bg-bg-elevated">
            <div className="border-b border-white/10 px-3 py-2">
              <p className="text-xxs font-semibold uppercase tracking-wide text-fg-muted">
                Systeme
              </p>
            </div>

            {targetsLoading && (
              <div className="p-3">
                <LoadingSpinner label="Lade Systeme..." />
              </div>
            )}

            {!targetsLoading && (targets ?? []).map((target) => (
              <Tooltip
                key={target.id}
                title={target.name}
                source="/api/v1/openapi/targets"
                updatedAt="beim Seitenstart geladen"
              >
                <button
                  type="button"
                  className={`w-full px-3 py-2.5 text-left text-sm transition-colors ${
                    selectedTarget === target.id
                      ? "bg-blue-500/15 text-fg font-medium"
                      : "text-fg-muted hover:bg-white/5 hover:text-fg"
                  }`}
                  onClick={() => handleTargetChange(target.id)}
                  data-testid={`target-btn-${target.id}`}
                  aria-pressed={selectedTarget === target.id}
                >
                  {target.name}
                </button>
              </Tooltip>
            ))}
          </div>
        </aside>

        {/* ── Rechte Spalte: Endpoint-Liste ────────────────────────────────── */}
        <main className="flex-1 min-w-0">

          {/* Suchfeld + Status-Kopf */}
          <div className="mb-3 flex items-center gap-3 flex-wrap">
            <input
              type="search"
              placeholder="Pfad, Methode oder Summary filtern..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 min-w-[180px] rounded border border-white/15 bg-bg-elevated
                         px-3 py-1.5 text-sm text-fg placeholder:text-fg-subtle
                         focus:outline-none focus:ring-1 focus:ring-blue-500/50"
              data-testid="openapi-search"
            />
            {spec && (
              <Tooltip
                title="Anzahl der gefundenen Endpoints"
                source={`/api/v1/openapi/${selectedTarget}`}
                updatedAt="nach letztem Target-Wechsel"
              >
                <span
                  className="shrink-0 text-xs text-fg-muted tabular-nums"
                  data-testid="endpoint-count-badge"
                >
                  {visibleEndpoints.length} / {spec.endpoint_count ?? spec.endpoints.length} Endpoints
                </span>
              </Tooltip>
            )}
          </div>

          {/* Lade-Indikator */}
          {(specLoading || specFetching) && (
            <LoadingSpinner label={`Lade Endpoints fuer „${selectedTarget}"...`} />
          )}

          {/* Fehler beim Spec-Laden */}
          {specError && (
            <div
              className="rounded border border-status-error/30 bg-status-error/10 p-3 text-sm text-status-error"
              data-testid="spec-error"
            >
              Fehler: {(specError as Error).message}
            </div>
          )}

          {/* Nicht erreichbar */}
          {spec && !spec.reachable && (
            <div
              className="rounded border border-status-warn/30 bg-status-warn/10 p-4 text-sm text-status-warn"
              data-testid="not-reachable-hint"
            >
              <span className="font-semibold">System nicht erreichbar</span>
              {spec.error && (
                <span className="ml-2 text-fg-muted">— {spec.error}</span>
              )}
            </div>
          )}

          {/* Endpoint-Liste */}
          {spec && spec.reachable && (
            <div className="flex flex-col gap-1" data-testid="endpoint-list">
              {visibleEndpoints.length === 0 && (
                <p
                  className="text-sm text-fg-muted py-6 text-center"
                  data-testid="no-endpoints-hint"
                >
                  Keine Endpoints gefunden{searchQuery ? " fuer diesen Filter" : ""}.
                </p>
              )}

              {visibleEndpoints.map((ep, idx) => (
                <div
                  // Stabile Key-Basis: path + method + idx (fuer doppelte Methoden am selben Pfad)
                  key={`${ep.method}-${ep.path}-${idx}`}
                  className="flex flex-col gap-1 rounded border border-white/8
                             bg-bg-elevated px-3 py-2 hover:bg-white/5 transition-colors"
                  data-testid={`endpoint-row-${ep.method}-${encodeURIComponent(ep.path)}`}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Methode-Badge */}
                    <Tooltip
                      title={`HTTP-Methode ${ep.method}`}
                      source={`/api/v1/openapi/${selectedTarget}`}
                    >
                      <span
                        className={`inline-flex items-center rounded border px-1.5 py-0.5
                                    font-mono text-xxs font-semibold uppercase
                                    ${methodColor(ep.method)}`}
                        data-testid={`method-badge-${ep.method}`}
                      >
                        {ep.method}
                      </span>
                    </Tooltip>

                    {/* Pfad */}
                    <code
                      className="font-mono text-xs text-fg break-all"
                      data-testid="endpoint-path"
                    >
                      {ep.path}
                    </code>
                  </div>

                  {/* Summary + Tags */}
                  {(ep.summary || ep.tags.length > 0) && (
                    <div className="flex items-start gap-2 flex-wrap pl-1">
                      {ep.summary && (
                        <span
                          className="text-xs text-fg-muted"
                          data-testid="endpoint-summary"
                        >
                          {ep.summary}
                        </span>
                      )}
                      {ep.tags.map((tag) => (
                        <Tooltip
                          key={tag}
                          title={`OpenAPI-Tag: ${tag}`}
                          source={`/api/v1/openapi/${selectedTarget}`}
                        >
                          <span
                            className="rounded-full bg-fg-subtle/15 px-1.5 py-0.5
                                       text-xxs text-fg-subtle"
                            data-testid={`endpoint-tag-${tag}`}
                          >
                            {tag}
                          </span>
                        </Tooltip>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </main>
      </div>

      <PageBadge id="openapi" />
    </div>
  );
}

export default OpenApiBrowser;
