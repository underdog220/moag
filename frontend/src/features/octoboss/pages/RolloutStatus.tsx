// OctoBoss · Rollout & Test — komprimierte Sicht (Phase 1, READ-ONLY).
// Sub-Route: /octoboss/rollout-status
// Datenquelle: GET /api/v1/octoboss/rollout/status  (Aggregat-Endpoint,
//   fan-out zu manifest/inventory + seti/nodes + benchmarks runs/matrix).
//
// Drei Sektionen (Mockup: docs/concepts/2026-06-21-moag-octoboss-rollout-view.md):
//   1. ROLLOUT       — core_default + Hub + Per-Node Soll vs. agent_version/Heartbeat
//   2. LETZTER TEST  — letzter Benchmark-Lauf (Verdikt + subjects); Pretest = Lücke
//   3. VERBESSERUNG  — Trend ▲/=/▼ je subject/domain aus der Matrix
//
// EHRLICHE LÜCKE (Konzept): Per-Node Ist-Core-Version ist NICHT getrackt
//   (agent_version ≠ Core). Wird mit ≈* + Fußnote gekennzeichnet, kein "alle grün".
//
// ADR-004: Jede Zahl / jedes Symbol / jeder Button trägt einen <Tooltip>.
// Phase 1: KEINE Aktionen — die Buttons sind disabled-Platzhalter (Phase 2).

import { useQuery } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import { Tooltip } from "../../../components/Tooltip";
import { PageBadge } from "../../../components/PageBadge";
import { LoadingSpinner } from "../../../components/LoadingSpinner";
import type { RolloutNode, RolloutImprovement } from "../../../lib/types";

const SRC = "/api/v1/octoboss/rollout/status";

// ── Hilfsfunktionen ─────────────────────────────────────────────────────────

function relAge(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}min`;
  return `${Math.floor(m / 60)}h`;
}

function relTimeFromIso(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    return relAge(s);
  } catch {
    return iso;
  }
}

// Heartbeat-Punkt: grün <30s, gelb <120s, rot älter / kein HB.
function hbColor(ageS: number | null, connected: boolean): string {
  if (!connected || ageS == null) return "bg-status-error";
  if (ageS < 30) return "bg-status-ok";
  if (ageS < 120) return "bg-status-warn";
  return "bg-status-error";
}

// ── Sektion-Wrapper ──────────────────────────────────────────────────────────

function Section({
  title,
  tooltip,
  children,
}: {
  title: string;
  tooltip: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-white/10 bg-bg-panel">
      <div className="border-b border-white/10 px-4 py-3">
        <Tooltip title={tooltip} source={SRC}>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
            {title}
          </h3>
        </Tooltip>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

// ── ROLLOUT-Sektion ──────────────────────────────────────────────────────────

function RolloutNodeRow({ node }: { node: RolloutNode }) {
  return (
    <tr className="border-b border-white/5 last:border-0 hover:bg-bg-elevated/30">
      <td className="px-3 py-2 font-medium text-fg whitespace-nowrap">
        {node.hostname ?? node.node_id}
      </td>
      <td className="px-3 py-2 font-mono text-xs text-fg-muted whitespace-nowrap">
        <Tooltip
          title={
            node.soll_source === "override"
              ? "Soll-Version aus Per-Node-Override (Manifest pinnt diese Node)"
              : "Soll-Version aus Core-Default (kein Override für diese Node)"
          }
          source={SRC}
        >
          <span>{node.soll ?? "—"}</span>
          {node.soll_source === "override" && (
            <span className="ml-1 text-status-warn" aria-label="Override">⊙</span>
          )}
        </Tooltip>
      </td>
      <td className="px-3 py-2 font-mono text-xs text-fg-subtle whitespace-nowrap">
        <Tooltip
          title={
            "Agent-/Bootstrapper-Build (≈*) — NICHT die deployte Core-Version. " +
            "Per-Node Ist-Core-Version ist nicht getrackt (siehe Fußnote)."
          }
          source={SRC}
        >
          <span>{node.agent_version ?? "—"}</span>
          <span className="ml-0.5 text-status-warn">≈*</span>
        </Tooltip>
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        <Tooltip
          title={
            node.connected
              ? `Verbunden · letzter Heartbeat ${relTimeFromIso(node.last_heartbeat)}`
              : "Nicht verbunden / kein Heartbeat"
          }
          source={SRC}
          thresholds="<30s ok · <120s warn · älter/keiner krit"
        >
          <span className="inline-flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${hbColor(node.heartbeat_age_s, node.connected)}`} />
            <span className="text-xs text-fg-muted tabular-nums">
              {relAge(node.heartbeat_age_s)}
            </span>
          </span>
        </Tooltip>
      </td>
    </tr>
  );
}

// ── VERBESSERUNG: Trend-Symbol ───────────────────────────────────────────────

function TrendSymbol({ row }: { row: RolloutImprovement }) {
  const cls =
    row.trend === "up"
      ? "text-status-ok"
      : row.trend === "down"
        ? "text-status-error"
        : "text-fg-muted";
  const label =
    row.trend === "up"
      ? "besser als vorher"
      : row.trend === "down"
        ? "schlechter als vorher"
        : "stabil";
  return (
    <Tooltip
      title={`Trend: ${label}`}
      source="/api/v1/octoboss/benchmarks/matrix"
      thresholds="▲ besser · = stabil · ▼ schlechter"
    >
      <span className={`text-sm font-semibold ${cls}`}>{row.symbol}</span>
    </Tooltip>
  );
}

// ── Phase-2-Platzhalter-Button (disabled, löst NICHTS aus) ────────────────────

function PhaseTwoButton({ label, hint }: { label: string; hint: string }) {
  return (
    <Tooltip title={`${hint} (Phase 2 — in dieser Ansicht noch nicht aktiv)`} source={SRC}>
      <button
        type="button"
        disabled
        aria-disabled="true"
        className="cursor-not-allowed rounded border border-white/10 bg-bg-elevated/40
                   px-3 py-1.5 text-xs font-medium text-fg-subtle opacity-60"
      >
        {label} <span className="ml-1 text-fg-subtle">· Phase 2</span>
      </button>
    </Tooltip>
  );
}

// ── Seite ────────────────────────────────────────────────────────────────────

export function RolloutStatusPage() {
  const { data, isLoading, error, dataUpdatedAt } = useQuery({
    queryKey: ["octoboss", "rollout", "status"],
    queryFn: () => api.octoboss.getRolloutStatus(),
    refetchInterval: 30_000,
  });

  const updatedAtLabel = dataUpdatedAt
    ? relTimeFromIso(new Date(dataUpdatedAt).toISOString())
    : "—";

  return (
    <div className="flex flex-col gap-6">
      {/* Kopf */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-fg">Rollout &amp; Test</h2>
        {data?.rollout?.core_default && (
          <Tooltip
            title="Aktuell als Default gesetzte Core-Version (Manifest default_version)"
            source={SRC}
          >
            <span className="rounded border border-brand/30 bg-brand/15 px-2 py-1 text-xs font-medium text-brand">
              Core default: {data.rollout.core_default}
            </span>
          </Tooltip>
        )}
      </div>

      {isLoading && <LoadingSpinner />}
      {error && (
        <div className="rounded border border-status-error/30 bg-status-error/10 px-3 py-2 text-sm text-status-error">
          Fehler: {(error as Error).message}
        </div>
      )}

      {data && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* ── 1. ROLLOUT ── */}
          <Section
            title="Rollout"
            tooltip="Core-Default + Hub + Per-Node Soll (Manifest) vs. agent_version + Heartbeat"
          >
            <div className="mb-3 flex flex-col gap-1 text-sm">
              <div className="flex items-center justify-between">
                <Tooltip title="Aktive Hub-Identität (Manifest active_hub_id)" source={SRC}>
                  <span className="text-xs text-fg-muted">Hub</span>
                </Tooltip>
                <span className="font-mono text-xs text-fg">
                  {data.rollout.hub_version ?? "—"}
                </span>
              </div>
            </div>

            {data.rollout.error && (
              <div className="mb-3 rounded border border-status-warn/30 bg-status-warn/10 px-2 py-1 text-xs text-status-warn">
                Teil-Fehler: {data.rollout.error}
              </div>
            )}

            {data.rollout.nodes.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-left text-xs text-fg-muted">
                      <th className="px-3 py-2">
                        <Tooltip title="Node-Hostname" source={SRC}>Node</Tooltip>
                      </th>
                      <th className="px-3 py-2">
                        <Tooltip
                          title="Soll-Version: Per-Node-Override (⊙) sonst Core-Default"
                          source={SRC}
                        >
                          Soll
                        </Tooltip>
                      </th>
                      <th className="px-3 py-2">
                        <Tooltip
                          title="Ist (≈*): agent_version — Agent-/Bootstrapper-Build, NICHT Core-Version"
                          source={SRC}
                        >
                          Ist ≈*
                        </Tooltip>
                      </th>
                      <th className="px-3 py-2">
                        <Tooltip
                          title="Heartbeat-Alter + Verbindungsstatus"
                          source={SRC}
                          thresholds="<30s ok · <120s warn · älter/keiner krit"
                        >
                          HB
                        </Tooltip>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rollout.nodes.map((n) => (
                      <RolloutNodeRow key={n.node_id} node={n} />
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-fg-muted">Keine Nodes gemeldet.</p>
            )}

            {/* Ehrliche Lücke — Fußnote */}
            {!data.rollout.core_ist_tracked && (
              <p className="mt-3 border-t border-white/5 pt-2 text-xxs leading-relaxed text-fg-subtle">
                <span className="text-status-warn">≈*</span>{" "}
                {data.rollout.core_ist_note}
              </p>
            )}
          </Section>

          {/* ── 2. LETZTER TEST ── */}
          <Section
            title="Letzter Test"
            tooltip="Letzter Benchmark-Lauf (Verdikt + getestete subjects); Pretest-Verdikt ist read-only nicht abrufbar"
          >
            {data.last_test.error && (
              <div className="mb-3 rounded border border-status-warn/30 bg-status-warn/10 px-2 py-1 text-xs text-status-warn">
                Teil-Fehler: {data.last_test.error}
              </div>
            )}

            {data.last_test.benchmark_run ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <Tooltip
                    title="Benchmark-Verdikt: GRÜN wenn summary.failed = 0, sonst ROT"
                    source="/api/v1/octoboss/benchmarks/runs"
                    thresholds="failed=0 → GRÜN · failed>0 → ROT"
                  >
                    <span
                      className={`rounded border px-2 py-1 text-xs font-medium ${
                        data.last_test.benchmark_run.verdict === "GREEN"
                          ? "border-status-ok/30 bg-status-ok/15 text-status-ok"
                          : data.last_test.benchmark_run.verdict === "RED"
                            ? "border-status-error/30 bg-status-error/15 text-status-error"
                            : "border-white/10 bg-bg-elevated/40 text-fg-muted"
                      }`}
                    >
                      Benchmark {data.last_test.benchmark_run.verdict ?? data.last_test.benchmark_run.status ?? "—"}
                    </span>
                  </Tooltip>
                  <Tooltip title="Startzeitpunkt des Laufs" source="/api/v1/octoboss/benchmarks/runs">
                    <span className="text-xs text-fg-muted">
                      vor {relTimeFromIso(data.last_test.benchmark_run.started_at)}
                    </span>
                  </Tooltip>
                </div>

                {data.last_test.benchmark_run.summary && (
                  <Tooltip
                    title="Zusammenfassung des Laufs (bestanden / fehlgeschlagen / übersprungen)"
                    source="/api/v1/octoboss/benchmarks/runs"
                  >
                    <p className="text-xs text-fg-muted tabular-nums">
                      {data.last_test.benchmark_run.summary.passed ?? 0} ✓ ·{" "}
                      {data.last_test.benchmark_run.summary.failed ?? 0} ✗ ·{" "}
                      {data.last_test.benchmark_run.summary.skipped ?? 0} ⊘ (von{" "}
                      {data.last_test.benchmark_run.summary.total ?? 0})
                    </p>
                  </Tooltip>
                )}

                {data.last_test.benchmark_run.subjects.length > 0 && (
                  <ul className="flex flex-col gap-1 border-t border-white/5 pt-2">
                    {data.last_test.benchmark_run.subjects.slice(0, 8).map((s, i) => (
                      <li
                        key={`${s.subject}-${s.node_id}-${i}`}
                        className="flex items-center justify-between text-xs"
                      >
                        <span className="truncate font-mono text-fg-muted">
                          {s.subject ?? "—"}
                          <span className="ml-1 text-fg-subtle">{s.domain}</span>
                        </span>
                        <Tooltip
                          title={`${s.subject ?? "?"} (${s.domain ?? "?"}) — ${
                            s.passed ? "bestanden" : "nicht bestanden"
                          }${s.metric ? ` · ${s.metric}` : ""}`}
                          source="/api/v1/octoboss/benchmarks/runs"
                          position="top"
                        >
                          <span
                            className={`ml-2 shrink-0 ${
                              s.passed ? "text-status-ok" : "text-status-error"
                            }`}
                          >
                            {s.metric ?? (s.passed ? "✓" : "✗")}
                          </span>
                        </Tooltip>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <p className="text-sm text-fg-muted">Kein Benchmark-Lauf gefunden.</p>
            )}

            {/* Pretest-Lücke ehrlich kennzeichnen */}
            <p className="mt-3 border-t border-white/5 pt-2 text-xxs leading-relaxed text-fg-subtle">
              <span className="text-status-warn">Pretest:</span>{" "}
              {data.last_test.pretest_note}
            </p>
          </Section>

          {/* ── 3. VERBESSERUNG ── */}
          <Section
            title="Verbesserung"
            tooltip="Trend je subject/domain (▲ besser / = stabil / ▼ schlechter) aus der Benchmark-Matrix"
          >
            {data.improvement_error && (
              <div className="mb-3 rounded border border-status-warn/30 bg-status-warn/10 px-2 py-1 text-xs text-status-warn">
                Teil-Fehler: {data.improvement_error}
              </div>
            )}

            {data.improvement.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {data.improvement.map((row, i) => (
                  <li
                    key={`${row.subject}-${row.domain}-${i}`}
                    className="flex items-center justify-between gap-2 border-b border-white/5 py-1.5 text-xs last:border-0"
                  >
                    <span className="min-w-0 truncate">
                      <span className="font-mono text-fg">{row.subject}</span>
                      <span className="ml-1 text-fg-subtle">{row.domain}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {row.metric && (
                        <span
                          className={`font-mono tabular-nums ${
                            row.stale ? "text-fg-subtle" : "text-fg-muted"
                          }`}
                        >
                          {row.metric}
                        </span>
                      )}
                      <TrendSymbol row={row} />
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-fg-muted">Keine Trend-Daten verfügbar.</p>
            )}

            <p className="mt-3 border-t border-white/5 pt-2 text-xxs leading-relaxed text-fg-subtle">
              Katalog-Lifecycle (proposed→benchmarking→active) noch nicht angebunden —
              keine read-only Quelle in dieser Ansicht. Folge-TODO.
            </p>
          </Section>
        </div>
      )}

      {/* Phase-2-Aktionsleiste (disabled-Platzhalter — löst NICHTS aus) */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/5 pt-4">
        <div className="flex flex-wrap gap-2">
          <PhaseTwoButton
            label="Test starten"
            hint="Benchmark-/Pretest-Lauf starten"
          />
          <PhaseTwoButton
            label="Default wechseln (Pretest-Gate)"
            hint="Core-Default-Version tauschen — mit Panopticor-Pretest-Gate"
          />
        </div>
        <Tooltip title="Letzte Aktualisierung dieser Ansicht (Polling alle 30s)" source={SRC}>
          <span className="text-xs text-fg-subtle">
            Stand: vor {updatedAtLabel} · auto-30s
          </span>
        </Tooltip>
      </div>

      <PageBadge id="octoboss.rollout-status" />
    </div>
  );
}

export default RolloutStatusPage;
