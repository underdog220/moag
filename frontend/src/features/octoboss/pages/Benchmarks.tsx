// Benchmarks — OctoBoss-Bench-Suite-Dashboard
// Sub-Route: /octoboss/benchmarks
// Datenquelle:
//   GET  /api/v1/octoboss/benchmarks/matrix
//   GET  /api/v1/octoboss/benchmarks/runs
//   GET  /api/v1/octoboss/benchmarks/history
//   POST /api/v1/octoboss/benchmarks/run
//
// Drei Bereiche: Run-Panel (oben) · Matrix (Mitte) · History (unten)
// Defensive Render: 503 → degraded-State, kein Crash.
// ADR-004: Tooltips auf allen Zellen, Zahlen, Status-Symbolen.

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import { Tooltip } from "../../../components/Tooltip";
import { PageBadge } from "../../../components/PageBadge";
import { LoadingSpinner } from "../../../components/LoadingSpinner";
import { ConfirmDialog } from "../../../components/ConfirmDialog";

// ── Typen ─────────────────────────────────────────────────────────────────────

interface BenchmarkCell {
  domain: "ocr" | "llm_text" | "llm_vision" | "ner_pii";
  metric_key: string;
  metric_value: number | null;
  metric_string: string | null;
  passed: boolean;
  error_text: string | null;
  age_hours: number | null;
  stale: boolean;
  trend: "up" | "down" | "stable";
  created_at: string;
}

interface BenchmarkMatrix {
  subjects: string[];
  nodes: string[];
  matrix: Record<string, Record<string, BenchmarkCell>>;
}

interface BenchmarkRun {
  run_id: string;
  started_at: string;
  status: string;
  scope_filters: Record<string, unknown>;
  summary?: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
}

interface BenchmarkRunsResponse {
  runs: BenchmarkRun[];
  count: number;
  active_run_id: string | null;
}

interface HistoryResult {
  id?: string;
  subject: string;
  node_id: string;
  domain: string;
  metric_key: string;
  metric_value: number | null;
  metric_string?: string | null;
  passed: boolean;
  error_text?: string | null;
  created_at: string;
}

interface HistoryResponse {
  results: HistoryResult[];
  count: number;
}

interface RunStartResponse {
  run_id: string;
  started_at: string;
  scope_filters: Record<string, unknown>;
  message: string;
  summary?: { skipped?: boolean };
}

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

/** Primaer-Metrik pro Domain (was in der Zelle angezeigt wird). */
function primaryMetricLabel(domain: string, cell: BenchmarkCell): string {
  if (cell.metric_string) return cell.metric_string;
  if (cell.metric_value == null) return "—";
  switch (domain) {
    case "llm_text":
      return `${cell.metric_value.toFixed(1)} tok/s`;
    case "llm_vision":
      return cell.metric_value >= 0.5 ? "pass" : "fail";
    case "ocr":
      return `${(cell.metric_value * 100).toFixed(1)}%`;
    case "ner_pii":
      return `F1: ${cell.metric_value.toFixed(3)}`;
    default:
      return String(cell.metric_value);
  }
}

/** Trend-Icon. */
function TrendIcon({ trend }: { trend: "up" | "down" | "stable" }) {
  if (trend === "up") return <span className="text-status-ok text-xs" aria-label="Trend steigend">▲</span>;
  if (trend === "down") return <span className="text-status-error text-xs" aria-label="Trend fallend">▼</span>;
  return <span className="text-fg-subtle text-xs" aria-label="Trend stabil">—</span>;
}

/** Ob der Fehler ein 503 (Bench-DB nicht verfuegbar) ist. */
function is503(error: unknown): boolean {
  if (!error) return false;
  const msg = (error as Error).message ?? "";
  return msg.includes("503") || msg.toLowerCase().includes("benchmark-db");
}

/** Formatiert ISO-Datum als lokale Zeit. */
function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("de-DE");
  } catch {
    return iso;
  }
}

// ── Run-Panel ─────────────────────────────────────────────────────────────────

interface RunPanelProps {
  activeRunId: string | null;
  onTrigger: () => void;
  isMutating: boolean;
  lastRunId: string | null;
}

function RunPanel({ activeRunId, onTrigger, isMutating, lastRunId }: RunPanelProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div className="rounded border border-white/10 bg-bg-panel px-5 py-4">
      <div className="flex flex-wrap items-center gap-4">
        <div>
          <h3 className="text-sm font-semibold text-fg">Benchmark-Run starten</h3>
          <p className="mt-0.5 text-xs text-fg-muted">
            Startet einen vollstaendigen Bench-Durchlauf auf allen verfuegbaren Nodes.
          </p>
        </div>

        <div className="ml-auto flex items-center gap-3">
          {/* Aktiver-Run-Indikator */}
          {activeRunId && (
            <Tooltip
              title={`Laufender Run: ${activeRunId}`}
              source="/api/v1/octoboss/benchmarks/runs"
              updatedAt={undefined}
            >
              <span className="flex items-center gap-1.5 rounded border border-status-warn/30 bg-status-warn/10 px-2.5 py-1.5 text-xs text-status-warn">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-status-warn" />
                Run laeuft
              </span>
            </Tooltip>
          )}

          {/* Letzter Run-Indikator (nach Trigger) */}
          {!activeRunId && lastRunId && (
            <Tooltip
              title={`Zuletzt gestarteter Run: ${lastRunId}`}
              source="/api/v1/octoboss/benchmarks/run"
            >
              <span className="text-xs text-fg-subtle font-mono">
                Gestartet: {lastRunId.slice(0, 8)}…
              </span>
            </Tooltip>
          )}

          {/* Run-Trigger-Button */}
          <Tooltip
            title="Startet einen vollstaendigen Benchmark-Durchlauf (alle Subjects x alle Nodes). Bestaetigung erforderlich."
            source="/api/v1/octoboss/benchmarks/run"
            thresholds="Dauer: typisch 2–10 Minuten je nach Cluster-Groesse"
          >
            <button
              onClick={() => setConfirmOpen(true)}
              disabled={isMutating || !!activeRunId}
              className="min-h-[44px] rounded border border-brand/50 bg-brand/10 px-4 py-2
                         text-sm font-medium text-brand transition-colors
                         hover:bg-brand/20 hover:border-brand
                         disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Benchmark-Run starten"
            >
              {isMutating ? "Starte…" : "Run starten"}
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Bestaetigung-Dialog */}
      <ConfirmDialog
        open={confirmOpen}
        title="Benchmark-Run starten?"
        message={
          <span>
            Es wird ein vollstaendiger Bench-Durchlauf auf allen verfuegbaren Nodes gestartet.
            Laufzeit: typisch 2–10 Minuten. Ein gleichzeitig laufender Run wird als
            <em> uebersprungen</em> markiert.
          </span>
        }
        confirmLabel="Run starten"
        onConfirm={() => {
          setConfirmOpen(false);
          onTrigger();
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

// ── Matrix-Tabelle ─────────────────────────────────────────────────────────────

interface MatrixTableProps {
  matrix: BenchmarkMatrix;
}

function MatrixTable({ matrix }: MatrixTableProps) {
  const { subjects, nodes, matrix: data } = matrix;

  if (subjects.length === 0 || nodes.length === 0) {
    return (
      <div className="rounded border border-white/10 bg-bg-panel px-5 py-8 text-center text-sm text-fg-muted">
        Noch keine Matrix-Daten vorhanden.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded border border-white/10">
      <table className="min-w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-white/10 bg-bg-subtle">
            {/* Leere Ecke oben links */}
            <th className="px-3 py-2.5 text-left text-fg-muted font-medium whitespace-nowrap">
              Subject
            </th>
            {nodes.map((node) => (
              <th key={node} className="px-3 py-2.5 text-left text-fg-muted font-medium whitespace-nowrap">
                <Tooltip
                  title={`Node: ${node}`}
                  source="/api/v1/octoboss/benchmarks/matrix"
                >
                  <span>{node}</span>
                </Tooltip>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {subjects.map((subject) => (
            <tr key={subject} className="border-b border-white/5 last:border-0 hover:bg-bg-elevated/30 transition-colors">
              {/* Subject-Spalte */}
              <td className="px-3 py-2 font-mono text-fg whitespace-nowrap">
                <Tooltip
                  title={`Bench-Subject: ${subject}`}
                  source="/api/v1/octoboss/benchmarks/matrix"
                >
                  <span>{subject}</span>
                </Tooltip>
              </td>

              {/* Zellen pro Node */}
              {nodes.map((node) => {
                const cell: BenchmarkCell | undefined = data[subject]?.[node];

                if (!cell) {
                  // Sparse — kein Ergebnis fuer diese Kombination
                  return (
                    <td key={node} className="px-3 py-2 text-fg-subtle text-center">
                      <Tooltip
                        title={`Keine Bench-Daten fuer ${subject} auf ${node}`}
                        source="/api/v1/octoboss/benchmarks/matrix"
                      >
                        <span>—</span>
                      </Tooltip>
                    </td>
                  );
                }

                const metricLabel = primaryMetricLabel(cell.domain, cell);
                const isStale = cell.stale;
                const ageLabel = cell.age_hours != null
                  ? `${cell.age_hours.toFixed(1)}h alt`
                  : "Alter unbekannt";

                const tooltipText = [
                  `Domain: ${cell.domain}`,
                  `Metrik: ${cell.metric_key}`,
                  cell.metric_string ? `Wert: ${cell.metric_string}` : null,
                  `Trend: ${cell.trend}`,
                  ageLabel,
                  isStale ? "VERALTET (>24h)" : null,
                  cell.error_text ? `Fehler: ${cell.error_text}` : null,
                  `Gemessen: ${fmtDate(cell.created_at)}`,
                ].filter(Boolean).join(" · ");

                return (
                  <td
                    key={node}
                    className={`px-3 py-2 whitespace-nowrap ${isStale ? "opacity-40" : ""}`}
                  >
                    <Tooltip
                      title={tooltipText}
                      source="/api/v1/octoboss/benchmarks/matrix"
                      thresholds={`Primaer-Metrik fuer Domain ${cell.domain}: ${cell.metric_key}`}
                    >
                      <span className="flex items-center gap-1.5">
                        {/* Passed/Failed-Dot */}
                        <span
                          className={`shrink-0 h-2 w-2 rounded-full ${
                            cell.passed ? "bg-status-ok" : "bg-status-error"
                          }`}
                          aria-label={cell.passed ? "bestanden" : "nicht bestanden"}
                        />
                        {/* Metrik-Wert */}
                        <span
                          className={`font-mono tabular-nums ${
                            cell.passed ? "text-fg" : "text-status-error"
                          }`}
                        >
                          {metricLabel}
                        </span>
                        {/* Trend-Icon */}
                        <TrendIcon trend={cell.trend} />
                      </span>
                    </Tooltip>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── History-Liste ──────────────────────────────────────────────────────────────

type SortKey = "subject" | "node" | "created_at" | "metric_value";

interface HistoryListProps {
  results: HistoryResult[];
}

function HistoryList({ results }: HistoryListProps) {
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const sorted = [...results].sort((a, b) => {
    let av: string | number | null;
    let bv: string | number | null;
    switch (sortKey) {
      case "subject":
        av = a.subject; bv = b.subject; break;
      case "node":
        av = a.node_id; bv = b.node_id; break;
      case "metric_value":
        av = a.metric_value; bv = b.metric_value; break;
      case "created_at":
      default:
        av = a.created_at; bv = b.created_at; break;
    }
    if (av == null) return 1;
    if (bv == null) return -1;
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sortDir === "asc" ? cmp : -cmp;
  });

  if (results.length === 0) {
    return (
      <div className="rounded border border-white/10 bg-bg-panel px-5 py-8 text-center text-sm text-fg-muted">
        Keine History-Eintraege vorhanden.
      </div>
    );
  }

  function SortHeader({ col, label, tooltip }: { col: SortKey; label: string; tooltip: string }) {
    const active = sortKey === col;
    return (
      <th className="px-3 py-2.5 text-left">
        <Tooltip title={tooltip} source="/api/v1/octoboss/benchmarks/history">
          <button
            onClick={() => toggleSort(col)}
            className={`flex items-center gap-1 text-xs font-medium transition-colors
              ${active ? "text-brand" : "text-fg-muted hover:text-fg"}`}
            aria-label={`Sortieren nach ${label}${active ? (sortDir === "asc" ? " (aufsteigend)" : " (absteigend)") : ""}`}
          >
            {label}
            {active && <span className="text-xs">{sortDir === "asc" ? "▲" : "▼"}</span>}
          </button>
        </Tooltip>
      </th>
    );
  }

  return (
    <div className="overflow-x-auto rounded border border-white/10">
      <table className="min-w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-white/10 bg-bg-subtle">
            <SortHeader col="subject" label="Subject" tooltip="Bench-Subject (Engine/Modell) — klicken zum Sortieren" />
            <SortHeader col="node" label="Node" tooltip="Node-ID auf der der Benchmark lief — klicken zum Sortieren" />
            <th className="px-3 py-2.5 text-left text-xs font-medium text-fg-muted">Domain</th>
            <SortHeader col="metric_value" label="Wert" tooltip="Primaer-Metrik des Benchmarks — klicken zum Sortieren" />
            <th className="px-3 py-2.5 text-left text-xs font-medium text-fg-muted">Status</th>
            <SortHeader col="created_at" label="Zeitpunkt" tooltip="Zeitpunkt der Messung — klicken zum Sortieren (Standard: neueste zuerst)" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, idx) => (
            <tr
              key={r.id ?? `${r.subject}-${r.node_id}-${r.created_at}-${idx}`}
              className="border-b border-white/5 last:border-0 hover:bg-bg-elevated/30 transition-colors"
            >
              <td className="px-3 py-2 font-mono text-fg whitespace-nowrap">{r.subject}</td>
              <td className="px-3 py-2 text-fg-muted whitespace-nowrap">{r.node_id}</td>
              <td className="px-3 py-2 text-fg-subtle whitespace-nowrap">
                <Tooltip
                  title={`Domain: ${r.domain} · Metrik: ${r.metric_key}`}
                  source="/api/v1/octoboss/benchmarks/history"
                >
                  <span>{r.domain}</span>
                </Tooltip>
              </td>
              <td className="px-3 py-2 font-mono tabular-nums text-fg whitespace-nowrap">
                <Tooltip
                  title={`${r.metric_key}: ${r.metric_string ?? r.metric_value ?? "—"}`}
                  source="/api/v1/octoboss/benchmarks/history"
                >
                  <span>{r.metric_string ?? (r.metric_value != null ? String(r.metric_value) : "—")}</span>
                </Tooltip>
              </td>
              <td className="px-3 py-2">
                <Tooltip
                  title={r.passed ? "Benchmark bestanden" : `Benchmark nicht bestanden${r.error_text ? ` — ${r.error_text}` : ""}`}
                  source="/api/v1/octoboss/benchmarks/history"
                >
                  <span
                    className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-medium
                      ${r.passed
                        ? "border-status-ok/30 bg-status-ok/10 text-status-ok"
                        : "border-status-error/30 bg-status-error/10 text-status-error"
                      }`}
                  >
                    {r.passed ? "✓ ok" : "✗ fail"}
                  </span>
                </Tooltip>
              </td>
              <td className="px-3 py-2 text-fg-subtle whitespace-nowrap">
                <Tooltip
                  title={`Gemessen: ${fmtDate(r.created_at)}`}
                  source="/api/v1/octoboss/benchmarks/history"
                >
                  <span>{fmtDate(r.created_at)}</span>
                </Tooltip>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Degraded-State (503) ───────────────────────────────────────────────────────

function DegradedBanner() {
  return (
    <div className="rounded border border-status-warn/30 bg-status-warn/10 px-4 py-3 text-sm text-status-warn">
      <p className="font-semibold">Benchmark-DB nicht verfuegbar — OctoBoss pruefen</p>
      <p className="mt-1 text-xs text-fg-muted">
        Die Benchmark-Datenbank antwortet mit HTTP 503. Bitte pruefen ob OctoBoss
        laueft und die Bench-DB eingebunden ist.
      </p>
    </div>
  );
}

// ── Haupt-Komponente ───────────────────────────────────────────────────────────

export function BenchmarksPage() {
  const queryClient = useQueryClient();
  const [lastRunId, setLastRunId] = useState<string | null>(null);

  // ── Runs-Query (dynamisches Polling-Intervall) ──────────────────────────────
  const runsQuery = useQuery({
    queryKey: ["octoboss", "benchmarks", "runs"],
    queryFn: () => api.octoboss.getBenchmarkRuns(50) as Promise<BenchmarkRunsResponse>,
    refetchInterval: (query) => {
      // 3s wenn aktiver Run laeuft, sonst 30s
      const data = query.state.data as BenchmarkRunsResponse | undefined;
      return data?.active_run_id ? 3_000 : 30_000;
    },
  });

  const activeRunId = (runsQuery.data as BenchmarkRunsResponse | undefined)?.active_run_id ?? null;

  // ── Matrix-Query ────────────────────────────────────────────────────────────
  const matrixQuery = useQuery({
    queryKey: ["octoboss", "benchmarks", "matrix"],
    queryFn: () => api.octoboss.getBenchmarkMatrix() as Promise<BenchmarkMatrix>,
    refetchInterval: activeRunId ? 10_000 : 60_000,
  });

  // ── History-Query ───────────────────────────────────────────────────────────
  const historyQuery = useQuery({
    queryKey: ["octoboss", "benchmarks", "history"],
    queryFn: () =>
      api.octoboss.getBenchmarkHistory({ limit: 50 }) as Promise<HistoryResponse>,
    refetchInterval: activeRunId ? 10_000 : 60_000,
  });

  // ── Run-Trigger-Mutation ────────────────────────────────────────────────────
  const runMutation = useMutation({
    mutationFn: () => api.octoboss.runBenchmark() as Promise<RunStartResponse>,
    onSuccess: (data) => {
      setLastRunId(data.run_id ?? null);
      // Sofort Runs-Query invalidieren damit active_run_id aktuell ist
      void queryClient.invalidateQueries({ queryKey: ["octoboss", "benchmarks", "runs"] });
    },
  });

  // ── 503-Ermittlung ─────────────────────────────────────────────────────────
  const anyDegraded =
    is503(matrixQuery.error) || is503(runsQuery.error) || is503(historyQuery.error);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6">
      {/* Seitenheader */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-fg">Benchmarks</h2>
        <Tooltip
          title="Automatische Aktualisierung: 3s waehrend aktivem Run, 30s im Idle"
          source="/api/v1/octoboss/benchmarks/runs"
        >
          <span className="text-xs text-fg-subtle">
            {activeRunId ? "Polling 3s" : "Polling 30s"}
          </span>
        </Tooltip>
      </div>

      {/* Degraded-Banner (503) */}
      {anyDegraded && <DegradedBanner />}

      {/* ── Run-Panel ─────────────────────────────────────────────────── */}
      <section aria-label="Run-Panel">
        <RunPanel
          activeRunId={activeRunId}
          onTrigger={() => runMutation.mutate()}
          isMutating={runMutation.isPending}
          lastRunId={lastRunId}
        />

        {/* Skipped-Run-Hinweis */}
        {runMutation.isSuccess &&
          (runMutation.data as RunStartResponse | undefined)?.summary?.skipped && (
            <div className="mt-2 rounded border border-status-warn/30 bg-status-warn/10 px-4 py-2 text-xs text-status-warn">
              Uebersprungen — anderer Run aktiv. Der neue Run wird nach Abschluss des laufenden Runs ausgefuehrt.
            </div>
          )}

        {/* Mutations-Fehler */}
        {runMutation.isError && (
          <div className="mt-2 rounded border border-status-error/30 bg-status-error/10 px-4 py-2 text-xs text-status-error">
            Fehler beim Starten: {(runMutation.error as Error).message}
          </div>
        )}
      </section>

      {/* ── Matrix-Sektion ────────────────────────────────────────────── */}
      <section aria-label="Benchmark-Matrix">
        <div className="mb-3 flex items-center gap-3">
          <Tooltip
            title="Subjects (Zeilen) x Nodes (Spalten) — sparse, fehlende Zellen als —. Farbpunkte: gruen=bestanden, rot=nicht bestanden."
            source="/api/v1/octoboss/benchmarks/matrix"
            thresholds="Stale-Zellen (>24h) werden ausgegraut dargestellt"
          >
            <h3 className="text-sm font-semibold text-fg">Matrix</h3>
          </Tooltip>
          {matrixQuery.isFetching && <LoadingSpinner />}
        </div>

        {matrixQuery.isLoading && !anyDegraded && <LoadingSpinner />}

        {matrixQuery.error && !is503(matrixQuery.error) && (
          <div className="rounded border border-status-error/30 bg-status-error/10 px-4 py-3 text-xs text-status-error">
            Fehler: {(matrixQuery.error as Error).message}
          </div>
        )}

        {matrixQuery.data && !matrixQuery.error && (
          <MatrixTable matrix={matrixQuery.data as BenchmarkMatrix} />
        )}
      </section>

      {/* ── History-Sektion ───────────────────────────────────────────── */}
      <section aria-label="Benchmark-History">
        <div className="mb-3 flex items-center gap-3">
          <Tooltip
            title="Letzte 50 Einzel-Ergebnisse — sortierbar nach Subject, Node oder Zeitpunkt"
            source="/api/v1/octoboss/benchmarks/history"
          >
            <h3 className="text-sm font-semibold text-fg">History</h3>
          </Tooltip>
          {historyQuery.isFetching && <LoadingSpinner />}
          {historyQuery.data && (
            <Tooltip
              title="Anzahl der geladenen History-Eintraege"
              source="/api/v1/octoboss/benchmarks/history"
            >
              <span className="text-xs text-fg-muted">
                {(historyQuery.data as HistoryResponse).count} Eintraege
              </span>
            </Tooltip>
          )}
        </div>

        {historyQuery.isLoading && !anyDegraded && <LoadingSpinner />}

        {historyQuery.error && !is503(historyQuery.error) && (
          <div className="rounded border border-status-error/30 bg-status-error/10 px-4 py-3 text-xs text-status-error">
            Fehler: {(historyQuery.error as Error).message}
          </div>
        )}

        {historyQuery.data && !historyQuery.error && (
          <HistoryList results={(historyQuery.data as HistoryResponse).results} />
        )}
      </section>

      <PageBadge id="octoboss.benchmarks" />
    </div>
  );
}

export default BenchmarksPage;
