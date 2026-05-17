// NasDominator — Metrics-Seite (CPU/RAM/Storage-Gauges).
// Quelle: GET /api/v1/nasdominator/metrics

import { useQuery } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import { PageBadge } from "../../../components/PageBadge";
import { Tooltip } from "../../../components/Tooltip";
import { Gauge } from "../../../components/Gauge";
import { LoadingSpinner } from "../../../components/LoadingSpinner";
import { EmptyState } from "../../../components/EmptyState";

const QUERY_KEY = ["nasdominator", "metrics"];

interface MiniGaugeCardProps {
  label: string;
  value: number | null | undefined;
  unit?: string;
  tooltip: string;
  source: string;
  invertThresholds?: boolean; // true = hoher Wert = schlecht (CPU/RAM Last)
}

function MiniGaugeCard({ label, value, unit = "%", tooltip, source, invertThresholds = false }: MiniGaugeCardProps) {
  const v = value ?? 0;
  // Fuer CPU/RAM-Last: hoher Wert ist schlecht -> Gauge-Score invertieren
  const gaugeValue = invertThresholds ? Math.max(0, 100 - v) : v;
  const thresholds = invertThresholds
    ? { warn: 60, bad: 30 } // Gauge-Score: 60% bedeutet 40% Last (warn) -> 30% bedeutet 70% Last (bad)
    : { warn: 70, bad: 40 };

  return (
    <div className="flex flex-col items-center gap-2 rounded border border-white/10 bg-bg-panel p-4">
      <Tooltip
        title={tooltip}
        source={source}
        thresholds={
          invertThresholds
            ? "< 50% Last = grün · 50–80% = gelb · > 80% = rot"
            : "≥ 70% = grün · 40–69% = gelb · < 40% = rot"
        }
      >
        <span className="text-xs text-fg-muted uppercase tracking-wider">{label}</span>
      </Tooltip>
      {value == null ? (
        <span className="text-sm text-fg-subtle">—</span>
      ) : (
        <>
          <Gauge
            value={gaugeValue}
            variant="hero"
            label={`${v.toFixed(1)}${unit}`}
            tooltip={{ title: tooltip, source }}
            thresholds={thresholds}
          />
          <span className="text-sm font-semibold text-fg">
            {v.toFixed(1)}{unit}
          </span>
        </>
      )}
    </div>
  );
}

export function MetricsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => api.nasdominator.getMetrics(),
    refetchInterval: 20_000,
    retry: 1,
  });

  const metrics = data?.metrics ?? {};
  const authRequired = data?.auth_required ?? false;

  const cpu = metrics.cpu_percent ?? metrics.cpu_usage ?? null;
  const ram = metrics.ram_percent ?? metrics.ram_usage ?? null;
  const storage = metrics.storage_percent ?? null;

  const hasData = cpu != null || ram != null || storage != null;

  return (
    <div className="flex flex-col gap-4 p-4">
      <Tooltip
        title="System-Metriken der QNAP-NAS: CPU-Last, RAM-Auslastung, Storage-Fuellstand"
        source="/api/v1/nasdominator/metrics"
      >
        <h2 className="text-base font-semibold text-fg">System-Metriken</h2>
      </Tooltip>

      {authRequired && (
        <div className="rounded border border-status-warn/30 bg-status-warn/10 px-3 py-2 text-sm text-status-warn">
          NasDominator erfordert Anmeldung. Metriken nicht verfuegbar.
        </div>
      )}

      {isLoading && <LoadingSpinner />}

      {!isLoading && error && (
        <EmptyState
          icon="!"
          title="Fehler beim Laden"
          description={String(error)}
        />
      )}

      {!isLoading && !error && !hasData && !authRequired && (
        <EmptyState
          icon="~"
          title="Keine Metriken"
          description="NasDominator liefert keine Metrik-Daten."
        />
      )}

      {!isLoading && hasData && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <MiniGaugeCard
            label="CPU-Last"
            value={cpu as number | null}
            unit="%"
            tooltip="CPU-Auslastung der QNAP-NAS in Prozent"
            source="/api/v1/nasdominator/metrics"
            invertThresholds
          />
          <MiniGaugeCard
            label="RAM-Auslastung"
            value={ram as number | null}
            unit="%"
            tooltip="RAM-Auslastung der QNAP-NAS in Prozent"
            source="/api/v1/nasdominator/metrics"
            invertThresholds
          />
          <MiniGaugeCard
            label="Storage"
            value={storage as number | null}
            unit="%"
            tooltip="Storage-Fuellstand der QNAP-NAS in Prozent"
            source="/api/v1/nasdominator/metrics"
            invertThresholds
          />
        </div>
      )}

      {data?.fetched_at && (
        <p className="text-xxs text-fg-subtle text-right">
          Letzte Abfrage: {new Date(data.fetched_at).toLocaleTimeString("de-DE")}
        </p>
      )}

      <PageBadge id="nasdominator.metrics" />
    </div>
  );
}

export default MetricsPage;
