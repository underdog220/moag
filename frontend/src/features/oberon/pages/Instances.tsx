// Instances — Aktive Oberon-Chat/DevLoop-Instanzen.
// Datenquelle: GET /api/v1/oberon/instances

import { useQuery } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import { qk } from "../../../lib/queryKeys";
import { PageBadge } from "../../../components/PageBadge";
import { LoadingSpinner } from "../../../components/LoadingSpinner";
import { EmptyState } from "../../../components/EmptyState";
import { Tooltip } from "../../../components/Tooltip";
import { Panel, KV, Chip, MiniBar, ErrorBanner, relTime } from "../_oberon_ui";

// Kontext-Auslastung als Prozent (Annahme: 128k = 100%)
const MAX_CONTEXT = 128_000;

function modeTone(mode: string | undefined): "ok" | "warn" | "brand" | "neutral" {
  if (!mode) return "neutral";
  if (mode.toLowerCase().includes("chat")) return "ok";
  if (mode.toLowerCase().includes("devloop") || mode.toLowerCase().includes("cursor")) return "brand";
  if (mode.toLowerCase().includes("batch")) return "warn";
  return "neutral";
}

export function InstancesPage() {
  const { data, isLoading, error, dataUpdatedAt } = useQuery({
    queryKey: qk.oberon.instances,
    queryFn: () => api.oberon.getInstances(),
    refetchInterval: 30_000,
  });

  const updatedAt = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString("de-DE") : "–";

  const isStub = (data as any)?.stub === true;
  const instances: any[] = Array.isArray(data) ? data : (data as any)?.instances ?? [];

  return (
    <div className="p-4" data-testid="oberon-instances-page">
      <h2 className="mb-4 text-base font-semibold text-fg">Aktive Instanzen</h2>

      {isLoading && <LoadingSpinner label="Lade Instanzen..." />}
      {error && <ErrorBanner message={(error as Error).message} />}

      {!isLoading && !error && (
        <>
          {isStub ? (
            <EmptyState title="Kein Zugriff" description={(data as any).message} />
          ) : instances.length === 0 ? (
            <EmptyState title="Keine aktiven Instanzen" description="Aktuell laufen keine DevLoop/Chat-Sessions auf Oberon." />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {instances.map((inst: any, i: number) => {
                const ctxPct =
                  inst.context_size != null
                    ? Math.round((inst.context_size / MAX_CONTEXT) * 100)
                    : null;
                return (
                  <Panel
                    key={inst.id ?? i}
                    title={inst.id ? `Instanz ${inst.id.slice(0, 12)}` : `Instanz #${i + 1}`}
                    className="border-brand/20"
                  >
                    <KV
                      label="ID"
                      value={
                        <Tooltip
                          title={`Vollstaendige Instanz-ID: ${inst.id ?? "unbekannt"}`}
                          source="GET /api/v1/oberon/instances"
                          updatedAt={`Zuletzt: ${updatedAt}`}
                        >
                          <span className="font-mono text-xs">{inst.id ?? "–"}</span>
                        </Tooltip>
                      }
                      mono
                    />
                    {inst.mode && (
                      <div className="flex items-center justify-between gap-3 py-1">
                        <span className="shrink-0 text-xs text-fg-muted">Modus</span>
                        <Tooltip
                          title={`Instanz-Modus: ${inst.mode}`}
                          source="GET /api/v1/oberon/instances"
                          updatedAt={`Zuletzt: ${updatedAt}`}
                        >
                          <Chip tone={modeTone(inst.mode)}>{inst.mode}</Chip>
                        </Tooltip>
                      </div>
                    )}
                    {inst.client_id && (
                      <KV label="Client" value={inst.client_id} />
                    )}
                    {inst.model && (
                      <KV
                        label="Modell"
                        value={inst.model}
                        mono
                        tip={`Aktiv genutztes LLM: ${inst.model}`}
                        source="GET /api/v1/oberon/instances"
                      />
                    )}
                    {inst.context_size != null && (
                      <div className="py-1">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="text-fg-muted">Kontext</span>
                          <Tooltip
                            title={`Kontext: ${inst.context_size.toLocaleString("de-DE")} Tokens (${ctxPct ?? "?"}% von ${(MAX_CONTEXT / 1000).toFixed(0)}k)`}
                            source="GET /api/v1/oberon/instances"
                            updatedAt={`Zuletzt: ${updatedAt}`}
                            thresholds="< 70% ok · 70–90% fast voll · > 90% kritisch"
                          >
                            <span className="tabular-nums text-fg">
                              {inst.context_size.toLocaleString("de-DE")}
                            </span>
                          </Tooltip>
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <MiniBar value={ctxPct} segs={12} />
                          <span className="text-xxs text-fg-muted">{ctxPct ?? "?"}%</span>
                        </div>
                      </div>
                    )}
                    {inst.created_at && (
                      <KV
                        label="Erstellt"
                        value={relTime(inst.created_at)}
                        tip={`Erstellt: ${inst.created_at}`}
                        source="GET /api/v1/oberon/instances"
                      />
                    )}
                    {inst.last_active_at && (
                      <KV
                        label="Zuletzt aktiv"
                        value={relTime(inst.last_active_at)}
                        tip={`Zuletzt aktiv: ${inst.last_active_at}`}
                        source="GET /api/v1/oberon/instances"
                      />
                    )}
                  </Panel>
                );
              })}
            </div>
          )}
        </>
      )}

      <PageBadge id="oberon.instances" />
    </div>
  );
}

export default InstancesPage;
