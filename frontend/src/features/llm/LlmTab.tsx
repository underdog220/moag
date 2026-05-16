// LlmTab — Provider-Übersicht aus dem Oberon Cockpit.
// Route: /llm
// Refresh: alle 10 Sekunden via React-Query.

import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { qk } from "../../lib/queryKeys";
import { ProviderCard } from "./ProviderCard";

// ── Loading-State ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div
      data-testid="llm-loading"
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
      aria-busy="true"
      aria-label="Provider werden geladen"
    >
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="h-40 animate-pulse rounded-lg border border-white/8 bg-bg-subtle"
        />
      ))}
    </div>
  );
}

// ── Error-State ──────────────────────────────────────────────────────────

function ErrorBox({ message }: { message: string }) {
  return (
    <div
      data-testid="llm-error"
      className="rounded border border-status-error/40 bg-status-error/10 p-4 text-sm text-status-error"
    >
      Provider-Daten konnten nicht geladen werden: {message}
    </div>
  );
}

// ── Leer-State ───────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div
      data-testid="llm-empty"
      className="flex flex-col items-center justify-center py-16 text-center text-fg-muted"
    >
      <p className="text-sm">Keine Provider konfiguriert.</p>
      <p className="mt-1 text-xs">
        Provider werden in der Oberon-Konfiguration hinterlegt.
      </p>
    </div>
  );
}

// ── Hauptkomponente ──────────────────────────────────────────────────────

export function LlmTab() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: qk.cockpit.providers,
    queryFn: () => api.getCockpitProviders(),
    refetchInterval: 10_000,
    staleTime: 5_000,
  });

  if (isLoading) return <LoadingSkeleton />;

  if (isError) {
    const msg = (error as Error)?.message ?? "unbekannter Fehler";
    return <ErrorBox message={msg} />;
  }

  const providers = data?.providers ?? [];

  if (providers.length === 0) return <EmptyState />;

  return (
    <div
      data-testid="llm-provider-grid"
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
    >
      {providers.map((p) => (
        <ProviderCard key={p.id} provider={p} />
      ))}
    </div>
  );
}

export default LlmTab;
