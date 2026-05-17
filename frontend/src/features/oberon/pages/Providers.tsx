// Providers — Liste aller konfigurierten Oberon-LLM-Provider.
// Datenquelle: GET /api/v1/oberon/providers

import { useQuery } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import { qk } from "../../../lib/queryKeys";
import { PageBadge } from "../../../components/PageBadge";
import { LoadingSpinner } from "../../../components/LoadingSpinner";
import { EmptyState } from "../../../components/EmptyState";
import { Tooltip } from "../../../components/Tooltip";
import type { CockpitProvider } from "../../../lib/types";

function HealthBadge({ status }: { status: string }) {
  const color =
    status === "healthy"
      ? "text-status-ok border-status-ok/30 bg-status-ok/10"
      : status === "degraded"
        ? "text-status-warn border-status-warn/30 bg-status-warn/10"
        : "text-status-error border-status-error/30 bg-status-error/10";
  return (
    <span className={`rounded border px-1.5 py-0.5 text-xxs font-medium ${color}`}>
      {status}
    </span>
  );
}

export function ProvidersPage() {
  const { data, isLoading, error, dataUpdatedAt } = useQuery({
    queryKey: qk.oberon.providers,
    queryFn: () => api.oberon.getProviders(),
    refetchInterval: 30_000,
  });

  if (isLoading) return <LoadingSpinner label="Lade Provider..." />;
  if (error)
    return (
      <div className="p-4 text-sm text-status-error">
        Fehler: {(error as Error).message}
      </div>
    );

  const providers: CockpitProvider[] = (data as any)?.providers ?? [];
  const updatedAt = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString("de-DE") : "–";

  return (
    <div className="p-4" data-testid="oberon-providers-page">
      <h2 className="mb-4 text-base font-semibold text-fg">LLM-Provider</h2>

      {providers.length === 0 ? (
        <EmptyState title="Keine Provider" description="Kein Admin-Token konfiguriert oder Oberon nicht erreichbar." />
      ) : (
        <div className="space-y-3">
          {providers.map((p) => (
            <div
              key={p.id}
              className="rounded-lg border border-white/10 bg-bg-panel p-4"
              data-testid={`provider-${p.id}`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-fg">{p.name}</span>
                  {p.is_default && (
                    <Tooltip
                      title="Dieser Provider ist als Default konfiguriert"
                      source="GET /api/v1/oberon/providers"
                      updatedAt={`Zuletzt: ${updatedAt}`}
                    >
                      <span className="text-xxs text-brand border border-brand/30 bg-brand/10 rounded px-1.5 py-0.5">
                        Default
                      </span>
                    </Tooltip>
                  )}
                </div>
                <Tooltip
                  title={`Health-Status: ${p.status}`}
                  source="GET /api/v1/oberon/providers"
                  updatedAt={`Zuletzt: ${updatedAt}`}
                  thresholds="healthy = voll verfuegbar · degraded = eingeschraenkt · down = nicht erreichbar"
                >
                  <HealthBadge status={p.status} />
                </Tooltip>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-fg-muted">
                <span>Typ: <span className="text-fg">{p.type}</span></span>
                <span>ID: <span className="text-fg font-mono">{p.id}</span></span>

                {p.latency_p50_ms != null && (
                  <Tooltip
                    title={`Median-Latenz der letzten 24h: ${p.latency_p50_ms.toFixed(0)}ms`}
                    source="GET /api/v1/oberon/providers"
                    updatedAt={`Zuletzt: ${updatedAt}`}
                    thresholds="< 500ms gut · 500–1500ms akzeptabel · > 1500ms langsam"
                  >
                    <span>P50: <span className="tabular-nums text-fg">{p.latency_p50_ms.toFixed(0)}ms</span></span>
                  </Tooltip>
                )}
                {p.latency_p95_ms != null && (
                  <Tooltip
                    title={`P95-Latenz der letzten 24h: ${p.latency_p95_ms.toFixed(0)}ms`}
                    source="GET /api/v1/oberon/providers"
                    updatedAt={`Zuletzt: ${updatedAt}`}
                    thresholds="< 1500ms gut · > 3000ms problematisch"
                  >
                    <span>P95: <span className="tabular-nums text-fg">{p.latency_p95_ms.toFixed(0)}ms</span></span>
                  </Tooltip>
                )}

                {p.api_key_hint && (
                  <span className="col-span-2">Key: <span className="font-mono text-fg">{p.api_key_hint}</span></span>
                )}
              </div>

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
            </div>
          ))}
        </div>
      )}

      <PageBadge id="oberon.providers" />
    </div>
  );
}

export default ProvidersPage;
