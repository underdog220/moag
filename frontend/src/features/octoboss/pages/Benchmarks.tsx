// Benchmarks — OctoBoss-Bench-Suite-Dashboard
// Sub-Route: /octoboss/benchmarks
// Datenquelle:
//   GET  /api/v1/octoboss/benchmarks/matrix
//   GET  /api/v1/octoboss/benchmarks/runs
//   GET  /api/v1/octoboss/benchmarks/history
//   GET  /api/v1/octoboss/nodes            (Hostname/GPU-Mapping)
//   POST /api/v1/octoboss/benchmarks/run
//
// Layout: Run-Panel · Heatmap-Vergleich (nur echte Nodes, Hostname-Header) ·
//         veraltete Nodes (ausklappbar) · History (ausklappbar).
// ADR-004: Tooltips auf allen Zellen, Zahlen, Status-Symbolen.

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import { Tooltip } from "../../../components/Tooltip";
import { PageBadge } from "../../../components/PageBadge";
import { LoadingSpinner } from "../../../components/LoadingSpinner";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import type { OctoBossNodeDetail } from "../../../lib/types";

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
  summary?: { total: number; passed: number; failed: number; skipped: number };
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

/** Node-Stammdaten fürs Hostname/GPU-Mapping. */
interface NodeInfo {
  hostname: string;
  gpu: string | null;
}

// Pseudo-Subjects, die OctoBoss als Platzhalter erzeugt wenn ein Node keine
// (Vision-)Modelle hat — gehören nicht in den Performance-Vergleich.
const PSEUDO_SUBJECTS = new Set(["(no_models)", "(no_vision_models)"]);

// Benchmark-Domänen (OctoBoss RunRequest.domains). Auswahl im Run-Panel.
const BENCH_DOMAINS: { key: string; label: string }[] = [
  { key: "llm_text", label: "LLM-Text" },
  { key: "llm_vision", label: "LLM-Vision" },
  { key: "ocr", label: "OCR" },
  { key: "ner_pii", label: "NER / PII" },
];

/** Scope-Filter für POST /benchmarks/run (leere Felder = „alles"). */
interface RunScope {
  domains?: string[];
  node_ids?: string[];
}

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

/** Primaer-Metrik pro Domain (was in der Zelle angezeigt wird). */
function primaryMetricLabel(domain: string, cell: BenchmarkCell): string {
  if (cell.metric_value == null) return cell.metric_string ?? "—";
  switch (domain) {
    case "llm_text":
      return `${cell.metric_value.toFixed(1)} tok/s`;
    case "llm_vision":
      return cell.metric_value >= 0.5 ? "pass" : "fail";
    case "ocr":
      return `${(cell.metric_value * 100).toFixed(1)}%`;
    case "ner_pii":
      return `F1 ${cell.metric_value.toFixed(2)}`;
    default:
      return String(cell.metric_value);
  }
}

/** Domains, bei denen ein höherer metric_value „besser" ist (→ Heatmap/Bester). */
function higherIsBetter(domain: string): boolean {
  return domain === "llm_text" || domain === "ner_pii" || domain === "ocr";
}

/** Node-Anzeigename: Hostname wenn bekannt, sonst gekürzte ID. */
function nodeLabel(id: string, info: NodeInfo | undefined): string {
  return info?.hostname ?? id.slice(0, 8) + "…";
}

/** Trend-Icon. */
function TrendIcon({ trend }: { trend: "up" | "down" | "stable" }) {
  if (trend === "up") return <span className="text-status-ok text-xs" aria-label="Trend steigend">▲</span>;
  if (trend === "down") return <span className="text-status-error text-xs" aria-label="Trend fallend">▼</span>;
  return <span className="text-fg-subtle text-xs" aria-label="Trend stabil">—</span>;
}

function is503(error: unknown): boolean {
  if (!error) return false;
  const msg = (error as Error).message ?? "";
  return msg.includes("503") || msg.toLowerCase().includes("benchmark-db");
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("de-DE");
  } catch {
    return iso;
  }
}

function fmtAge(hours: number | null): string {
  if (hours == null) return "Alter unbekannt";
  if (hours < 24) return `${hours.toFixed(0)} h alt`;
  return `${(hours / 24).toFixed(1)} d alt`;
}

// ── Run-Panel ─────────────────────────────────────────────────────────────────

interface RunPanelProps {
  activeRunId: string | null;
  onTrigger: (scope: RunScope) => void;
  isMutating: boolean;
  lastRunId: string | null;
  liveNodes: string[];
  nodeInfo: Record<string, NodeInfo>;
}

/** Toggle-Chip für die Scope-Auswahl. */
function ScopeChip({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
        on
          ? "border-brand/50 bg-brand/15 text-brand"
          : "border-white/10 bg-bg-subtle text-fg-subtle hover:text-fg"
      }`}
    >
      {on ? "✓ " : ""}
      {label}
    </button>
  );
}

function RunPanel({ activeRunId, onTrigger, isMutating, lastRunId, liveNodes, nodeInfo }: RunPanelProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  // „Ausgeschlossen"-Sets statt „ausgewählt": neue Nodes/Domänen sind so
  // automatisch an (robust gegen asynchrones Nachladen der Node-Liste).
  const [exclDomains, setExclDomains] = useState<Set<string>>(new Set());
  const [exclNodes, setExclNodes] = useState<Set<string>>(new Set());

  function toggle(set: Set<string>, key: string, setter: (s: Set<string>) => void) {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setter(next);
  }

  const selectedDomains = BENCH_DOMAINS.filter((d) => !exclDomains.has(d.key)).map((d) => d.key);
  const selectedNodes = liveNodes.filter((n) => !exclNodes.has(n));
  const nothingSelected = selectedDomains.length === 0 || (liveNodes.length > 0 && selectedNodes.length === 0);

  // Scope bauen: nur einschränken wenn nicht „alles" gewählt ist.
  function buildScope(): RunScope {
    const scope: RunScope = {};
    if (selectedDomains.length < BENCH_DOMAINS.length) scope.domains = selectedDomains;
    if (liveNodes.length > 0 && selectedNodes.length < liveNodes.length) scope.node_ids = selectedNodes;
    return scope;
  }

  const scopeSummary =
    selectedDomains.length === BENCH_DOMAINS.length && selectedNodes.length === liveNodes.length
      ? "alle Tests auf allen Rechnern"
      : `${selectedDomains.length}/${BENCH_DOMAINS.length} Tests · ${selectedNodes.length}/${liveNodes.length || "?"} Rechner`;

  return (
    <div className="rounded border border-white/10 bg-bg-panel px-5 py-4">
      <div className="flex flex-wrap items-center gap-4">
        <div>
          <h3 className="text-sm font-semibold text-fg">Benchmark-Run starten</h3>
          <p className="mt-0.5 text-xs text-fg-muted">
            Wähle was gebencht werden soll — leere Auswahl = alles.
          </p>
        </div>

        <div className="ml-auto flex items-center gap-3">
          {activeRunId && (
            <Tooltip title={`Laufender Run: ${activeRunId}`} source="/api/v1/octoboss/benchmarks/runs">
              <span className="flex items-center gap-1.5 rounded border border-status-warn/30 bg-status-warn/10 px-2.5 py-1.5 text-xs text-status-warn">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-status-warn" />
                Run laeuft
              </span>
            </Tooltip>
          )}
          {!activeRunId && lastRunId && (
            <Tooltip title={`Zuletzt gestarteter Run: ${lastRunId}`} source="/api/v1/octoboss/benchmarks/run">
              <span className="text-xs text-fg-subtle font-mono">Gestartet: {lastRunId.slice(0, 8)}…</span>
            </Tooltip>
          )}
          <Tooltip
            title={`Startet einen Benchmark-Durchlauf für: ${scopeSummary}. Bestätigung erforderlich.`}
            source="/api/v1/octoboss/benchmarks/run"
            thresholds="Dauer: typisch 2–10 Minuten je nach Auswahl"
          >
            <button
              onClick={() => setConfirmOpen(true)}
              disabled={isMutating || !!activeRunId || nothingSelected}
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

      {/* Scope-Auswahl */}
      <div className="mt-3 flex flex-col gap-2 border-t border-white/10 pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-16 shrink-0 text-xs text-fg-subtle">Tests:</span>
          {BENCH_DOMAINS.map((d) => (
            <ScopeChip
              key={d.key}
              on={!exclDomains.has(d.key)}
              label={d.label}
              onClick={() => toggle(exclDomains, d.key, setExclDomains)}
            />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-16 shrink-0 text-xs text-fg-subtle">Rechner:</span>
          {liveNodes.length === 0 ? (
            <span className="text-xs text-fg-subtle">— lädt …</span>
          ) : (
            liveNodes.map((n) => (
              <ScopeChip
                key={n}
                on={!exclNodes.has(n)}
                label={nodeLabel(n, nodeInfo[n])}
                onClick={() => toggle(exclNodes, n, setExclNodes)}
              />
            ))
          )}
        </div>
        {nothingSelected && (
          <p className="text-xxs text-status-warn">Mindestens einen Test und einen Rechner wählen.</p>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Benchmark-Run starten?"
        message={
          <span>
            Es wird ein Bench-Durchlauf gestartet: <strong>{scopeSummary}</strong>.
            Laufzeit: typisch 2–10 Minuten. Ein gleichzeitig laufender Run wird als
            <em> uebersprungen</em> markiert.
          </span>
        }
        confirmLabel="Run starten"
        onConfirm={() => {
          setConfirmOpen(false);
          onTrigger(buildScope());
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

// ── Heatmap-Vergleich ──────────────────────────────────────────────────────────

interface HeatmapProps {
  matrix: BenchmarkMatrix;
  liveNodes: string[];
  nodeInfo: Record<string, NodeInfo>;
}

function HeatCell({
  cell,
  rowMax,
  isBest,
}: {
  cell: BenchmarkCell | undefined;
  rowMax: number | null;
  isBest: boolean;
}) {
  if (!cell) {
    return (
      <td className="px-3 py-2 text-center text-fg-subtle">
        <Tooltip title="Kein Bench-Ergebnis für diese Kombination" source="/api/v1/octoboss/benchmarks/matrix">
          <span>—</span>
        </Tooltip>
      </td>
    );
  }

  const label = primaryMetricLabel(cell.domain, cell);
  const numeric = cell.metric_value != null && higherIsBetter(cell.domain);
  const pct = numeric && rowMax && rowMax > 0 ? Math.min(100, ((cell.metric_value as number) / rowMax) * 100) : 0;

  const tooltipText = [
    `Domain: ${cell.domain}`,
    `Metrik: ${cell.metric_key}`,
    cell.metric_string ? `Wert: ${cell.metric_string}` : null,
    `Trend: ${cell.trend}`,
    fmtAge(cell.age_hours),
    cell.stale ? "VERALTET (>24h)" : null,
    cell.error_text ? `Fehler: ${cell.error_text}` : null,
    `Gemessen: ${fmtDate(cell.created_at)}`,
  ].filter(Boolean).join(" · ");

  return (
    <td className={`relative px-3 py-2 whitespace-nowrap ${cell.stale ? "opacity-50" : ""}`}>
      {/* Heatmap-Balken im Hintergrund (Anteil am Zeilenmaximum) */}
      {numeric && (
        <span
          className={`pointer-events-none absolute inset-y-1 left-0 rounded-sm ${
            isBest ? "bg-status-ok/25" : "bg-brand/10"
          }`}
          style={{ width: `${pct}%` }}
          aria-hidden="true"
        />
      )}
      <Tooltip title={tooltipText} source="/api/v1/octoboss/benchmarks/matrix">
        <span className="relative flex items-center gap-1.5">
          <span
            className={`shrink-0 h-2 w-2 rounded-full ${cell.passed ? "bg-status-ok" : "bg-status-error"}`}
            aria-label={cell.passed ? "bestanden" : "nicht bestanden"}
          />
          <span className={`font-mono tabular-nums ${isBest ? "font-semibold text-status-ok" : cell.passed ? "text-fg" : "text-status-error"}`}>
            {label}
          </span>
          {isBest && <span className="text-status-ok text-xs" aria-label="Schnellster">▲</span>}
          {!isBest && <TrendIcon trend={cell.trend} />}
        </span>
      </Tooltip>
    </td>
  );
}

function HeatmapTable({ matrix, liveNodes, nodeInfo }: HeatmapProps) {
  const { matrix: data } = matrix;

  // Echte Subjects: Pseudo-Platzhalter raus, nur Zeilen mit mind. einem Wert auf
  // einem live Node.
  const subjects = matrix.subjects.filter((s) => {
    if (PSEUDO_SUBJECTS.has(s)) return false;
    return liveNodes.some((n) => data[s]?.[n]);
  });

  if (liveNodes.length === 0 || subjects.length === 0) {
    return (
      <div className="rounded border border-white/10 bg-bg-panel px-5 py-8 text-center text-sm text-fg-muted">
        Keine Performance-Daten von aktiven Nodes.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded border border-white/10">
      <table className="min-w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-white/10 bg-bg-subtle">
            <th className="px-3 py-2.5 text-left text-fg-muted font-medium whitespace-nowrap">Modell / Subject</th>
            {liveNodes.map((node) => {
              const info = nodeInfo[node];
              return (
                <th key={node} className="px-3 py-2 text-left font-medium whitespace-nowrap">
                  <Tooltip
                    title={`Rechner ${nodeLabel(node, info)} · Node-ID ${node}${info?.gpu ? " · GPU " + info.gpu : ""}`}
                    source="/api/v1/octoboss/nodes"
                  >
                    <span className="flex flex-col">
                      <span className="text-sm font-semibold text-brand">{nodeLabel(node, info)}</span>
                      <span className="text-xxs font-normal text-fg-subtle">{info?.gpu ?? "—"}</span>
                    </span>
                  </Tooltip>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {subjects.map((subject) => {
            // Zeilenmaximum (nur higher-is-better-Domains) für Heatmap + Bester.
            const cells = liveNodes.map((n) => data[subject]?.[n]).filter(Boolean) as BenchmarkCell[];
            const comparable = cells.filter((c) => c.metric_value != null && higherIsBetter(c.domain));
            const rowMax = comparable.length ? Math.max(...comparable.map((c) => c.metric_value as number)) : null;
            const bestCount = comparable.filter((c) => c.metric_value === rowMax).length;

            return (
              <tr key={subject} className="border-b border-white/5 last:border-0 hover:bg-bg-elevated/30 transition-colors">
                <td className="px-3 py-2 font-mono text-fg whitespace-nowrap">{subject}</td>
                {liveNodes.map((node) => {
                  const cell = data[subject]?.[node];
                  // „Bester" nur markieren wenn es einen echten Vergleich gibt
                  // (>1 vergleichbarer Wert) und dieser Node das Maximum hält.
                  const isBest =
                    !!cell &&
                    cell.metric_value != null &&
                    higherIsBetter(cell.domain) &&
                    rowMax != null &&
                    cell.metric_value === rowMax &&
                    comparable.length > 1 &&
                    bestCount === 1;
                  return <HeatCell key={node} cell={cell} rowMax={rowMax} isBest={isBest} />;
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Veraltete / unbekannte Nodes (ausklappbar) ─────────────────────────────────

function StaleNodesSection({
  matrix,
  staleNodes,
}: {
  matrix: BenchmarkMatrix;
  staleNodes: string[];
}) {
  const [open, setOpen] = useState(false);
  if (staleNodes.length === 0) return null;

  // Pro toter Node das jüngste created_at aus der Matrix ziehen (Orientierung).
  function nodeMeta(node: string): { age: string; when: string } {
    let newest: BenchmarkCell | null = null;
    for (const s of matrix.subjects) {
      const c = matrix.matrix[s]?.[node];
      if (c && (!newest || c.created_at > newest.created_at)) newest = c;
    }
    return newest
      ? { age: fmtAge(newest.age_hours), when: fmtDate(newest.created_at) }
      : { age: "—", when: "—" };
  }

  return (
    <div className="rounded border border-white/10 bg-bg-panel">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-sm text-fg-muted">
          <span className="text-xs">{open ? "▼" : "▶"}</span>
          Veraltete / unbekannte Nodes
          <span className="rounded-full bg-fg-subtle/15 px-2 py-0.5 text-xxs text-fg-subtle">{staleNodes.length}</span>
        </span>
        <span className="text-xxs text-fg-subtle">nicht mehr im Cluster-Heartbeat</span>
      </button>
      {open && (
        <div className="border-t border-white/10 px-4 py-3">
          <p className="mb-2 text-xxs text-fg-subtle">
            Diese Node-IDs liegen noch in der Benchmark-DB, sind aber nicht im aktuellen
            <code className="mx-1 rounded bg-bg-subtle px-1">/seti/nodes</code>-Heartbeat — meist alte Test-VMs.
            Aus dem Performance-Vergleich oben ausgeblendet.
          </p>
          <table className="min-w-full text-xs">
            <thead>
              <tr className="text-xxs uppercase tracking-wide text-fg-subtle">
                <th className="py-1 pr-4 text-left">Node-ID</th>
                <th className="py-1 pr-4 text-left">Letzte Messung</th>
                <th className="py-1 text-left">Alter</th>
              </tr>
            </thead>
            <tbody>
              {staleNodes.map((node) => {
                const m = nodeMeta(node);
                return (
                  <tr key={node} className="border-t border-white/5">
                    <td className="py-1.5 pr-4 font-mono text-fg-muted">{node}</td>
                    <td className="py-1.5 pr-4 text-fg-subtle">{m.when}</td>
                    <td className="py-1.5 text-fg-subtle">{m.age}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── History (ausklappbar) ──────────────────────────────────────────────────────

type SortKey = "subject" | "node" | "created_at" | "metric_value";

function HistoryList({
  results,
  nodeInfo,
}: {
  results: HistoryResult[];
  nodeInfo: Record<string, NodeInfo>;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const sorted = [...results].sort((a, b) => {
    let av: string | number | null;
    let bv: string | number | null;
    switch (sortKey) {
      case "subject": av = a.subject; bv = b.subject; break;
      case "node": av = a.node_id; bv = b.node_id; break;
      case "metric_value": av = a.metric_value; bv = b.metric_value; break;
      default: av = a.created_at; bv = b.created_at; break;
    }
    if (av == null) return 1;
    if (bv == null) return -1;
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sortDir === "asc" ? cmp : -cmp;
  });

  if (results.length === 0) {
    return <p className="px-4 py-6 text-center text-sm text-fg-muted">Keine History-Eintraege vorhanden.</p>;
  }

  function SortHeader({ col, label, tooltip }: { col: SortKey; label: string; tooltip: string }) {
    const active = sortKey === col;
    return (
      <th className="px-3 py-2.5 text-left">
        <Tooltip title={tooltip} source="/api/v1/octoboss/benchmarks/history">
          <button
            onClick={() => toggleSort(col)}
            className={`flex items-center gap-1 text-xs font-medium transition-colors ${active ? "text-brand" : "text-fg-muted hover:text-fg"}`}
          >
            {label}
            {active && <span className="text-xs">{sortDir === "asc" ? "▲" : "▼"}</span>}
          </button>
        </Tooltip>
      </th>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-white/10 bg-bg-subtle">
            <SortHeader col="subject" label="Subject" tooltip="Bench-Subject (Engine/Modell) — klicken zum Sortieren" />
            <SortHeader col="node" label="Rechner" tooltip="Rechner auf dem der Benchmark lief — klicken zum Sortieren" />
            <th className="px-3 py-2.5 text-left text-xs font-medium text-fg-muted">Metrik</th>
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
              <td className="px-3 py-2 text-fg-muted whitespace-nowrap">
                <Tooltip title={`Node-ID: ${r.node_id}`} source="/api/v1/octoboss/nodes">
                  <span>{nodeLabel(r.node_id, nodeInfo[r.node_id])}</span>
                </Tooltip>
              </td>
              <td className="px-3 py-2 text-fg-subtle whitespace-nowrap">
                <Tooltip title={`Domain: ${r.domain} · Metrik-Key: ${r.metric_key}`} source="/api/v1/octoboss/benchmarks/history">
                  <span>{r.metric_key}</span>
                </Tooltip>
              </td>
              <td className="px-3 py-2 font-mono tabular-nums text-fg whitespace-nowrap">
                {r.metric_string ?? (r.metric_value != null ? String(r.metric_value) : "—")}
              </td>
              <td className="px-3 py-2">
                <Tooltip
                  title={r.passed ? "Benchmark bestanden" : `Benchmark nicht bestanden${r.error_text ? ` — ${r.error_text}` : ""}`}
                  source="/api/v1/octoboss/benchmarks/history"
                >
                  <span
                    className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-medium ${
                      r.passed
                        ? "border-status-ok/30 bg-status-ok/10 text-status-ok"
                        : "border-status-error/30 bg-status-error/10 text-status-error"
                    }`}
                  >
                    {r.passed ? "✓ ok" : "✗ fail"}
                  </span>
                </Tooltip>
              </td>
              <td className="px-3 py-2 text-fg-subtle whitespace-nowrap">{fmtDate(r.created_at)}</td>
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
  const [historyOpen, setHistoryOpen] = useState(false);

  const runsQuery = useQuery({
    queryKey: ["octoboss", "benchmarks", "runs"],
    queryFn: () => api.octoboss.getBenchmarkRuns(50) as Promise<BenchmarkRunsResponse>,
    refetchInterval: (query) => {
      const data = query.state.data as BenchmarkRunsResponse | undefined;
      return data?.active_run_id ? 3_000 : 30_000;
    },
  });
  const activeRunId = (runsQuery.data as BenchmarkRunsResponse | undefined)?.active_run_id ?? null;

  const matrixQuery = useQuery({
    queryKey: ["octoboss", "benchmarks", "matrix"],
    queryFn: () => api.octoboss.getBenchmarkMatrix() as Promise<BenchmarkMatrix>,
    refetchInterval: activeRunId ? 10_000 : 60_000,
  });

  // Node-Stammdaten fürs Hostname/GPU-Mapping + Live-Erkennung.
  const nodesQuery = useQuery({
    queryKey: ["octoboss", "nodes"],
    queryFn: () => api.octoboss.getNodes(),
    refetchInterval: 30_000,
  });

  const historyQuery = useQuery({
    queryKey: ["octoboss", "benchmarks", "history"],
    queryFn: () => api.octoboss.getBenchmarkHistory({ limit: 50 }) as Promise<HistoryResponse>,
    refetchInterval: activeRunId ? 10_000 : 60_000,
  });

  const runMutation = useMutation({
    mutationFn: (scope: RunScope) => api.octoboss.runBenchmark(scope) as Promise<RunStartResponse>,
    onSuccess: (data) => {
      setLastRunId(data.run_id ?? null);
      void queryClient.invalidateQueries({ queryKey: ["octoboss", "benchmarks", "runs"] });
    },
  });

  // Node-Mapping aufbauen (id → hostname/gpu) + Set der live Node-IDs.
  const nodeList: OctoBossNodeDetail[] = (() => {
    const d = nodesQuery.data as unknown;
    if (Array.isArray(d)) return d as OctoBossNodeDetail[];
    if (d && Array.isArray((d as { nodes?: unknown }).nodes)) return (d as { nodes: OctoBossNodeDetail[] }).nodes;
    return [];
  })();
  const nodeInfo: Record<string, NodeInfo> = {};
  const liveIds = new Set<string>();
  for (const n of nodeList) {
    if (!n?.node_id) continue;
    liveIds.add(n.node_id);
    nodeInfo[n.node_id] = { hostname: n.hostname ?? n.node_id.slice(0, 8), gpu: n.hardware?.gpu_name ?? null };
  }

  const matrix = matrixQuery.data as BenchmarkMatrix | undefined;
  // Solange die Node-Liste nicht geladen ist, NICHT vorschnell ausblenden.
  const nodesReady = nodeList.length > 0;
  const liveNodes = matrix
    ? nodesReady
      ? matrix.nodes.filter((id) => liveIds.has(id))
      : matrix.nodes
    : [];
  const staleNodes = matrix && nodesReady ? matrix.nodes.filter((id) => !liveIds.has(id)) : [];

  const anyDegraded = is503(matrixQuery.error) || is503(runsQuery.error) || is503(historyQuery.error);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-fg">Benchmarks</h2>
        <Tooltip
          title="Automatische Aktualisierung: 3s waehrend aktivem Run, 30s im Idle"
          source="/api/v1/octoboss/benchmarks/runs"
        >
          <span className="text-xs text-fg-subtle">{activeRunId ? "Polling 3s" : "Polling 30s"}</span>
        </Tooltip>
      </div>

      {anyDegraded && <DegradedBanner />}

      <section aria-label="Run-Panel">
        <RunPanel
          activeRunId={activeRunId}
          onTrigger={(scope) => runMutation.mutate(scope)}
          isMutating={runMutation.isPending}
          lastRunId={lastRunId}
          liveNodes={liveNodes}
          nodeInfo={nodeInfo}
        />
        {runMutation.isSuccess && (runMutation.data as RunStartResponse | undefined)?.summary?.skipped && (
          <div className="mt-2 rounded border border-status-warn/30 bg-status-warn/10 px-4 py-2 text-xs text-status-warn">
            Uebersprungen — anderer Run aktiv. Der neue Run wird nach Abschluss des laufenden Runs ausgefuehrt.
          </div>
        )}
        {runMutation.isError && (
          <div className="mt-2 rounded border border-status-error/30 bg-status-error/10 px-4 py-2 text-xs text-status-error">
            Fehler beim Starten: {(runMutation.error as Error).message}
          </div>
        )}
      </section>

      {/* ── Performance-Vergleich (Heatmap, nur echte Nodes) ───────────── */}
      <section aria-label="Performance-Vergleich">
        <div className="mb-3 flex items-center gap-3">
          <Tooltip
            title="tok/s je Modell und Rechner. Schnellster Rechner pro Zeile grün + ▲, Balken = Anteil am Zeilenmaximum. Nur aktiv verbundene Nodes; veraltete/Test-Nodes siehe Sektion darunter."
            source="/api/v1/octoboss/benchmarks/matrix"
            thresholds="Grün = schnellster · Stale-Zellen (>24h) ausgegraut"
          >
            <h3 className="text-sm font-semibold text-fg">Performance-Vergleich</h3>
          </Tooltip>
          {(matrixQuery.isFetching || nodesQuery.isFetching) && <LoadingSpinner />}
          {matrix && (
            <span className="text-xs text-fg-muted">{liveNodes.length} aktive Nodes</span>
          )}
        </div>

        {matrixQuery.isLoading && !anyDegraded && <LoadingSpinner />}
        {matrixQuery.error && !is503(matrixQuery.error) && (
          <div className="rounded border border-status-error/30 bg-status-error/10 px-4 py-3 text-xs text-status-error">
            Fehler: {(matrixQuery.error as Error).message}
          </div>
        )}
        {matrix && !matrixQuery.error && (
          <div className="flex flex-col gap-3">
            <HeatmapTable matrix={matrix} liveNodes={liveNodes} nodeInfo={nodeInfo} />
            <StaleNodesSection matrix={matrix} staleNodes={staleNodes} />
          </div>
        )}
      </section>

      {/* ── History (ausklappbar) ─────────────────────────────────────── */}
      <section aria-label="Benchmark-History">
        <div className="rounded border border-white/10 bg-bg-panel">
          <button
            onClick={() => setHistoryOpen((o) => !o)}
            className="flex w-full items-center justify-between px-4 py-3 text-left"
            aria-expanded={historyOpen}
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-fg">
              <span className="text-xs">{historyOpen ? "▼" : "▶"}</span>
              History (Einzelmessungen)
              {historyQuery.data && (
                <span className="rounded-full bg-fg-subtle/15 px-2 py-0.5 text-xxs font-normal text-fg-subtle">
                  {(historyQuery.data as HistoryResponse).count}
                </span>
              )}
            </span>
            {historyQuery.isFetching && <LoadingSpinner />}
          </button>
          {historyOpen && (
            <div className="border-t border-white/10">
              {historyQuery.isLoading && !anyDegraded && <LoadingSpinner />}
              {historyQuery.error && !is503(historyQuery.error) && (
                <div className="px-4 py-3 text-xs text-status-error">
                  Fehler: {(historyQuery.error as Error).message}
                </div>
              )}
              {historyQuery.data && !historyQuery.error && (
                <HistoryList results={(historyQuery.data as HistoryResponse).results} nodeInfo={nodeInfo} />
              )}
            </div>
          )}
        </div>
      </section>

      <PageBadge id="octoboss.benchmarks" />
    </div>
  );
}

export default BenchmarksPage;
