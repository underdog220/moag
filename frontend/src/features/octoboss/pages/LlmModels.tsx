// OctoBoss LLM-Models — OpenAI-Models-Liste mit Online-Status.
// Sub-Route: /octoboss/llm-models
// Datenquelle: GET /api/v1/octoboss/llm/models
// Aktionen: octoboss.ollama.pull, octoboss.bench.start

import { useQuery } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import { Tooltip } from "../../../components/Tooltip";
import { PageBadge } from "../../../components/PageBadge";
import { LoadingSpinner } from "../../../components/LoadingSpinner";
import { ActionCard } from "../../aktionen/ActionCard";
import type { Action, OctoBossLlmModel } from "../../../lib/types";

// Fallback-Metadaten wenn Registry nicht erreichbar
const ACTION_OLLAMA_PULL: Action = {
  action_id: "octoboss.ollama.pull",
  system_id: "octoboss",
  name: "Ollama-Modell pullen",
  description:
    "Lädt das Modell llama3.2:3b auf alle verbundenen OctoBoss-Nodes. " +
    "Der Pull-Job wird im Hintergrund gestartet (ca. 20s Timeout).",
  category: "operation",
  sub_area: "ollama",
  requires_confirm: false,
  is_destructive: false,
  estimated_duration_s: 20,
  implemented: true,
};

const ACTION_BENCH_START: Action = {
  action_id: "octoboss.bench.start",
  system_id: "octoboss",
  name: "LLM-Benchmark starten",
  description:
    "Startet einen LLM-Inference-Benchmark auf dem OctoBoss-Cluster. " +
    "Schickt einen kurzen Prompt an den Scheduler (Job-Typ: llm_inference, ~15s).",
  category: "diagnose",
  sub_area: "bench",
  requires_confirm: false,
  is_destructive: false,
  estimated_duration_s: 15,
  implemented: true,
};

function relTime(unix: number | null | undefined): string {
  if (unix == null) return "—";
  try {
    const diff = Date.now() - unix * 1000;
    const s = Math.floor(diff / 1000);
    if (s < 60) return `vor ${s}s`;
    if (s < 3600) return `vor ${Math.floor(s / 60)}min`;
    const h = Math.floor(s / 3600);
    if (h < 24) return `vor ${h}h`;
    return `vor ${Math.floor(h / 24)}d`;
  } catch {
    return String(unix);
  }
}

export function LlmModelsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["octoboss", "llm", "models"],
    queryFn: () => api.octoboss.getLlmModels(),
    refetchInterval: 30_000,
  });

  // Echte Actions aus Registry holen
  const { data: actionsData } = useQuery({
    queryKey: ["actions"],
    queryFn: api.getActions,
    staleTime: 60_000,
  });
  const registryActions = actionsData?.actions ?? [];
  const ollamaPullAction =
    registryActions.find((a) => a.action_id === "octoboss.ollama.pull") ?? ACTION_OLLAMA_PULL;
  const benchStartAction =
    registryActions.find((a) => a.action_id === "octoboss.bench.start") ?? ACTION_BENCH_START;

  const models: OctoBossLlmModel[] = (() => {
    if (!data) return [];
    if (Array.isArray(data)) return data as OctoBossLlmModel[];
    const d = data as Record<string, unknown>;
    if (Array.isArray(d.data)) return d.data as OctoBossLlmModel[];
    if (Array.isArray(d.models)) return d.models as OctoBossLlmModel[];
    return [];
  })();

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold text-fg">LLM-Modelle</h2>

      {isLoading && <LoadingSpinner />}
      {error && (
        <div className="rounded border border-status-error/30 bg-status-error/10 px-3 py-2 text-sm text-status-error">
          Fehler: {(error as Error).message}
        </div>
      )}

      {/* Modell-Tabelle */}
      {!isLoading && !error && models.length === 0 && (
        <p className="text-sm text-fg-muted">
          Keine LLM-Modelle verfügbar — Ollama möglicherweise nicht gestartet.
        </p>
      )}

      {models.length > 0 && (
        <div className="overflow-x-auto rounded border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-bg-panel text-left text-xs text-fg-muted">
                <th className="px-3 py-2">
                  <Tooltip title="Modell-ID (OpenAI-kompatibel)" source="/api/v1/octoboss/llm/models">Modell-ID</Tooltip>
                </th>
                <th className="px-3 py-2">
                  <Tooltip title="Objekt-Typ (model)" source="/api/v1/octoboss/llm/models">Objekt</Tooltip>
                </th>
                <th className="px-3 py-2">
                  <Tooltip title="Eigentümer/Anbieter des Modells" source="/api/v1/octoboss/llm/models">Anbieter</Tooltip>
                </th>
                <th className="px-3 py-2">
                  <Tooltip title="Erstellungszeitpunkt (Unix-Timestamp)" source="/api/v1/octoboss/llm/models" updatedAt="alle 30s">Erstellt</Tooltip>
                </th>
              </tr>
            </thead>
            <tbody>
              {models.map((model) => (
                <tr key={model.id} className="border-b border-white/5 hover:bg-bg-elevated/40">
                  <td className="px-3 py-2 font-mono text-xs text-fg">{model.id}</td>
                  <td className="px-3 py-2 text-fg-muted text-xs">{model.object ?? "model"}</td>
                  <td className="px-3 py-2 text-fg-muted text-xs">{model.owned_by ?? "—"}</td>
                  <td className="px-3 py-2 text-fg-subtle text-xs">{relTime(model.created)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Aktionen */}
      <div>
        <h3 className="mb-3 text-sm font-medium text-fg-muted">Aktionen</h3>
        <div className="grid gap-3 sm:grid-cols-2 max-w-2xl">
          <ActionCard action={ollamaPullAction} />
          <ActionCard action={benchStartAction} />
        </div>
      </div>

      <PageBadge id="octoboss.llm-models" />
    </div>
  );
}

export default LlmModelsPage;
