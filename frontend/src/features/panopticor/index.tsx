// Panopticor-Drilldown-Seite — Phase 6 umgesetzt (CR #4 Panopticor-seitig erfuellt).
// Zeigt Status-Panel (Score, Metriken, letzter Run) aus der Panopticor-Bridge GET /status.
// Polling: 15s via @tanstack/react-query.

import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { Tooltip } from "../../components/Tooltip";
import { PageBadge } from "../../components/PageBadge";
import { Breadcrumb } from "../../components/Breadcrumb";
import { StatusDot } from "../../components/StatusDot";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { formatRelative, formatDateTime } from "../../lib/format";
import type { PanopticorStatus } from "../../lib/types";

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 70) return "text-status-ok";
  if (score >= 40) return "text-status-warn";
  return "text-status-error";
}

function verdictColor(verdict: string | null | undefined): string {
  if (!verdict) return "text-fg-muted";
  const v = verdict.toLowerCase();
  if (v === "good" || v === "pass" || v === "green") return "text-status-ok";
  if (v === "warn" || v === "yellow") return "text-status-warn";
  return "text-status-error";
}

// ─── Bausteine ───────────────────────────────────────────────────────────────

function Panel({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-lg border border-white/10 bg-bg-panel p-3 ${className}`}>
      <h3 className="mb-2 border-b border-white/10 pb-1.5 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
        {title}
      </h3>
      {children}
    </section>
  );
}

function KV({
  label,
  value,
  tip,
  thresholds,
  updatedAt,
}: {
  label: string;
  value: React.ReactNode;
  tip: string;
  thresholds?: string;
  updatedAt?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1 border-b border-white/5 last:border-0">
      <span className="shrink-0 text-xs text-fg-muted">{label}</span>
      <Tooltip
        title={tip}
        source="/api/v1/panopticor/status"
        thresholds={thresholds}
        updatedAt={updatedAt}
      >
        <span className="text-right text-sm text-fg">{value}</span>
      </Tooltip>
    </div>
  );
}

// ─── Status-Panel ─────────────────────────────────────────────────────────────

function StatusPanel({
  status,
  updatedAt,
}: {
  status: PanopticorStatus;
  updatedAt: string;
}) {
  const m = status.metrics;
  const kind = scoreColor(status.score);

  const lastRunAt = m.lastRun_updatedAt
    ? (Date.parse(String(m.lastRun_updatedAt)) > Date.now() + 60_000
        ? formatDateTime(String(m.lastRun_updatedAt))
        : formatRelative(String(m.lastRun_updatedAt)))
    : null;

  return (
    <Panel title="Bridge-Status">
      {/* Hero: Score + LED + Summary */}
      <div className="mb-3 flex items-center gap-3">
        <Tooltip
          title="Gesamt-Score der Panopticor-Bridge (0..100)"
          source="/api/v1/panopticor/status"
          thresholds="≥70 = gruen · 40–69 = gelb · <40 = rot"
          updatedAt={updatedAt}
        >
          <span className={`text-3xl font-bold tabular-nums ${kind}`}>
            {status.score}
          </span>
        </Tooltip>
        <div className="flex flex-col gap-0.5">
          <Tooltip
            title={`Status: ${status.ok ? "Bridge betriebsbereit" : "Bridge nicht erreichbar"}`}
            source="/api/v1/panopticor/status"
            thresholds="gruen = betriebsbereit · rot = nicht erreichbar"
            updatedAt={updatedAt}
          >
            <span className="flex items-center gap-1.5">
              <StatusDot status={status.ok ? "ok" : "error"} size="lg" />
              <span
                className={`text-xs font-medium ${
                  status.ok ? "text-status-ok" : "text-status-error"
                }`}
              >
                {status.ok ? "Betriebsbereit" : "Nicht erreichbar"}
              </span>
            </span>
          </Tooltip>
          <span className="text-xs text-fg-muted">{status.summary}</span>
        </div>
      </div>

      {/* Bridge-Metriken */}
      <div className="flex flex-col gap-0">
        {m.projectVersion != null && (
          <KV
            label="Bridge-Version"
            value={String(m.projectVersion)}
            tip="Panopticor-Bridge-Version"
            updatedAt={updatedAt}
          />
        )}
        {m.activeRuns != null && (
          <KV
            label="Aktive Runs"
            value={
              <span className={Number(m.activeRuns) > 0 ? "text-status-warn font-semibold" : ""}>
                {String(m.activeRuns)}{" "}
                {m.maxConcurrent != null ? `/ ${m.maxConcurrent}` : ""}
              </span>
            }
            tip="Anzahl laufender Test-Runs / maximale Gleichzeitigkeit"
            thresholds="0 = idle · >0 = aktiv · = max = ausgelastet"
            updatedAt={updatedAt}
          />
        )}
        {m.aiEvaluation != null && (
          <KV
            label="KI-Evaluierung"
            value={String(m.aiEvaluation)}
            tip="Status der KI-gestützten Run-Bewertung"
            updatedAt={updatedAt}
          />
        )}
        {m.canRun != null && (
          <KV
            label="Run-Bereitschaft"
            value={
              <span
                className={
                  m.canRun ? "text-status-ok" : "text-status-error"
                }
              >
                {m.canRun ? "Ja" : "Nein"}
              </span>
            }
            tip="Ob die Bridge aktuell neue Runs starten kann"
            thresholds="Ja = gruen · Nein = rot (z.B. Integritaetsproblem)"
            updatedAt={updatedAt}
          />
        )}
        {m.integrityFindings != null && (
          <KV
            label="Integritaets-Befunde"
            value={
              <span
                className={
                  Number(m.integrityFindings) > 0 ? "text-status-error font-semibold" : ""
                }
              >
                {String(m.integrityFindings)}
              </span>
            }
            tip="Anzahl offener Integritaets-Probleme der Bridge"
            thresholds="0 = gruen · >0 = rot"
            updatedAt={updatedAt}
          />
        )}
      </div>

      {/* Fehler-Box */}
      {status.error && (
        <div className="mt-2 rounded border border-status-error/30 bg-status-error/10 px-2 py-1 text-xs text-status-error">
          {status.error}
        </div>
      )}

      {/* Letzter Run */}
      {m.lastRun_runId && (
        <div className="mt-3 border-t border-white/10 pt-2">
          <p className="mb-1.5 text-xxs uppercase tracking-wide text-fg-subtle">
            Letzter Run
          </p>
          <div className="flex flex-col gap-0">
            <KV
              label="Run-ID"
              value={
                <span className="font-mono text-xs text-fg-muted">
                  {String(m.lastRun_runId)}
                </span>
              }
              tip="Eindeutige ID des letzten Test-Runs"
              updatedAt={updatedAt}
            />
            {m.lastRun_taskId && (
              <KV
                label="Task"
                value={String(m.lastRun_taskId)}
                tip="Task-ID des letzten Runs"
                updatedAt={updatedAt}
              />
            )}
            {m.lastRun_verdict && (
              <KV
                label="Verdikt"
                value={
                  <span className={`font-semibold ${verdictColor(String(m.lastRun_verdict))}`}>
                    {String(m.lastRun_verdict)}
                  </span>
                }
                tip="Verdikt des letzten Runs (good = gruen, warn/red = Probleme)"
                thresholds="good = gruen · warn = gelb · red/fail = rot"
                updatedAt={updatedAt}
              />
            )}
            {m.lastRun_releaseReadiness && (
              <KV
                label="Release-Reife"
                value={String(m.lastRun_releaseReadiness)}
                tip="Release-Bereitschafts-Bewertung des letzten Runs"
                updatedAt={updatedAt}
              />
            )}
            {lastRunAt && (
              <KV
                label="Abgeschlossen"
                value={lastRunAt}
                tip={`Zeitpunkt des letzten Run-Abschlusses: ${m.lastRun_updatedAt ?? "—"}`}
                updatedAt={updatedAt}
              />
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}

// ─── Haupt-Komponente ─────────────────────────────────────────────────────────

export function PanopticorFeature() {
  const now = new Date().toISOString();

  const statusQuery = useQuery({
    queryKey: ["panopticor", "status"],
    queryFn: () => api.panopticor.getStatus(),
    refetchInterval: 15_000,
    retry: 1,
  });

  const updatedAt = formatRelative(
    statusQuery.dataUpdatedAt
      ? new Date(statusQuery.dataUpdatedAt).toISOString()
      : now,
  );

  return (
    <div className="flex flex-col" data-testid="panopticor">
      <Breadcrumb />

      <div className="flex flex-col gap-4 p-4">
        {/* Titelzeile + Hologramm-Link */}
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-lg font-semibold text-fg">Panopticor</h1>
          <Tooltip
            title="Oeffnet das Panopticor-Hologramm (Live-Test-Uebersicht, Port :8787)"
            source="http://localhost:8787/live"
          >
            <a
              href="http://localhost:8787/live"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded border border-white/10 bg-bg-panel px-3 py-1.5 text-sm text-fg
                         hover:bg-bg-subtle transition-colors"
              data-testid="hologramm-link"
            >
              Hologramm oeffnen →
            </a>
          </Tooltip>
        </div>

        {/* Lade-Zustand */}
        {statusQuery.isLoading && (
          <div className="flex items-center gap-2 text-sm text-fg-muted">
            <LoadingSpinner />
            <span>Lade Bridge-Status…</span>
          </div>
        )}

        {/* Fehler-Zustand (kein Data, Netz-Fehler) */}
        {statusQuery.isError && !statusQuery.data && (
          <div className="rounded border border-status-error/30 bg-status-error/10 px-3 py-2 text-sm text-status-error">
            Status nicht erreichbar — Panopticor-Bridge antwortet nicht.
          </div>
        )}

        {/* Status-Panel */}
        {statusQuery.data && (
          <StatusPanel status={statusQuery.data} updatedAt={updatedAt} />
        )}
      </div>

      <PageBadge id="panopticor" />
    </div>
  );
}

export default PanopticorFeature;
