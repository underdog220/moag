// Providers — Liste aller konfigurierten Oberon-LLM-Provider.
// Datenquelle: GET /api/v1/oberon/providers

import { useQuery } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import { qk } from "../../../lib/queryKeys";
import { PageBadge } from "../../../components/PageBadge";
import { LoadingSpinner } from "../../../components/LoadingSpinner";
import { EmptyState } from "../../../components/EmptyState";
import { Tooltip } from "../../../components/Tooltip";
import { Panel, StatusBadge, Chip, ErrorBanner } from "../_oberon_ui";
import type { CockpitProvider } from "../../../lib/types";

export function ProvidersPage() {
  const { data, isLoading, error, dataUpdatedAt } = useQuery({
    queryKey: qk.oberon.providers,
    queryFn: () => api.oberon.getProviders(),
    refetchInterval: 30_000,
  });

  if (isLoading) return <LoadingSpinner label="Lade Provider..." />;
  if (error)
    return <ErrorBanner message={(error as Error).message} />;

  const providers: CockpitProvider[] = (data as any)?.providers ?? [];
  const updatedAt = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString("de-DE") : "–";

  return (
    <div className="p-4" data-testid="oberon-providers-page">
      <h2 className="mb-4 text-base font-semibold text-fg">LLM-Provider</h2>

      {providers.length === 0 ? (
        <EmptyState title="Keine Provider" description="Kein Admin-Token konfiguriert oder Oberon nicht erreichbar." />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {providers.map((p) => (
            <Panel
              key={p.id}
              title={p.name}
              className="border-brand/20"
              data-testid={`provider-${p.id}`}
            >

              {/* Status + Default-Chip nebeneinander */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
                <div className="flex items-center gap-2">
                  {p.is_default && (
                    <Tooltip
                      title="Dieser Provider ist als Default konfiguriert"
                      source="GET /api/v1/oberon/providers"
                      updatedAt={`Zuletzt: ${updatedAt}`}
                    >
                      <Chip tone="brand">Default</Chip>
                    </Tooltip>
                  )}
                  <Tooltip
                    title={`Typ: ${p.type}`}
                    source="GET /api/v1/oberon/providers"
                    updatedAt={`Zuletzt: ${updatedAt}`}
                  >
                    <Chip tone="neutral">{p.type}</Chip>
                  </Tooltip>
                </div>
                <Tooltip
                  title={`Health-Status: ${p.status}`}
                  source="GET /api/v1/oberon/providers"
                  updatedAt={`Zuletzt: ${updatedAt}`}
                  thresholds="healthy = voll verfuegbar · degraded = eingeschraenkt · down = nicht erreichbar"
                >
                  <StatusBadge status={p.status} />
                </Tooltip>
              </div>

              {/* ID */}
              <div className="flex items-start justify-between gap-3 py-1">
                <span className="shrink-0 text-xs text-fg-muted">ID</span>
                <span className="text-right font-mono text-xs text-fg">{p.id}</span>
              </div>

              {/* Latenz */}
              {(p.latency_p50_ms != null || p.latency_p95_ms != null) && (
                <div className="flex items-start justify-between gap-3 py-1">
                  <span className="shrink-0 text-xs text-fg-muted">Latenz</span>
                  <div className="flex items-center gap-2">
                    {p.latency_p50_ms != null && (
                      <Tooltip
                        title={`Median-Latenz der letzten 24h: ${p.latency_p50_ms.toFixed(0)}ms`}
                        source="GET /api/v1/oberon/providers"
                        updatedAt={`Zuletzt: ${updatedAt}`}
                        thresholds="< 500ms gut · 500–1500ms akzeptabel · > 1500ms langsam"
                      >
                        <span className="text-xs tabular-nums text-fg">
                          P50 {p.latency_p50_ms.toFixed(0)}ms
                        </span>
                      </Tooltip>
                    )}
                    {p.latency_p95_ms != null && (
                      <Tooltip
                        title={`P95-Latenz der letzten 24h: ${p.latency_p95_ms.toFixed(0)}ms`}
                        source="GET /api/v1/oberon/providers"
                        updatedAt={`Zuletzt: ${updatedAt}`}
                        thresholds="< 1500ms gut · > 3000ms problematisch"
                      >
                        <span className="text-xs tabular-nums text-fg-muted">
                          P95 {p.latency_p95_ms.toFixed(0)}ms
                        </span>
                      </Tooltip>
                    )}
                  </div>
                </div>
              )}

              {/* API-Key-Hint */}
              {p.api_key_hint && (
                <div className="flex items-start justify-between gap-3 py-1">
                  <span className="shrink-0 text-xs text-fg-muted">Key</span>
                  <span className="text-right font-mono text-xs text-fg">{p.api_key_hint}</span>
                </div>
              )}

              {/* Modell-Profile */}
              {p.profiles && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {Object.entries(p.profiles as Record<string, string | null>)
                    .filter(([, v]) => v)
                    .map(([profile, model]) => (
                      <Tooltip
                        key={profile}
                        title={`Profil ${profile} nutzt Modell: ${model}`}
                        source="GET /api/v1/oberon/providers"
                        updatedAt={`Zuletzt: ${updatedAt}`}
                      >
                        <span className="rounded border border-white/10 bg-bg-elevated px-1.5 py-0.5 text-xxs text-fg-muted">
                          {profile}: <span className="text-fg">{model}</span>
                        </span>
                      </Tooltip>
                    ))}
                </div>
              )}
            </Panel>
          ))}
        </div>
      )}

      <PageBadge id="oberon.providers" />
    </div>
  );
}

export default ProvidersPage;
