// qnapbackup-Drilldown-Seite — Phase 5 umgesetzt.
// Zeigt Status-Panel (Score, Metriken) + Backup-Historie aus der qnapbackup-API.
// Polling: 15s via @tanstack/react-query.

import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { Tooltip } from "../../components/Tooltip";
import { PageBadge } from "../../components/PageBadge";
import { Breadcrumb } from "../../components/Breadcrumb";
import { StatusDot } from "../../components/StatusDot";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import {
  formatBytes,
  formatRelative,
  formatPercent,
  formatDateTime,
} from "../../lib/format";
import type { QnapBackupStatus, QnapBackupRecentItem } from "../../lib/types";

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

/** Formatiert Sekunden lesbar: <60s → "Xs", <3600 → "Xmin", <86400 → "Xh", sonst "Xd". */
function fmtDuration(sec: number | null | undefined): string {
  if (sec == null || Number.isNaN(sec)) return "-";
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}min`;
  if (sec < 86_400) return `${(sec / 3600).toFixed(1)}h`;
  return `${(sec / 86_400).toFixed(1)}d`;
}

/** Relative Backup-Zeit, robust gegen Zukunfts-Timestamps. qnapbackup liefert
 * für `last_backup_at`/`finished_at` teils Zeiten ~25 min in der Zukunft
 * (Datenbug in qnapbackups Backup-Timestamp-Logik — die VDR-System-Uhr UND
 * qnapbackups `fetched_at` sind nachweislich korrekt). Statt irreführendem
 * "in 41 Minuten" zeigen wir dann das absolute Datum + neutralen Hinweis. */
function backupTimeLabel(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  if (t > Date.now() + 60_000) return `${formatDateTime(iso)} (Zeitstempel voraus)`;
  return formatRelative(iso);
}

// ─── Score-Faktoren (Drilldown "Warum dieser Score?") ────────────────────────
// Spiegelt die qnapbackup-Heuristik compute_status_score (CR 2026-05-16):
// Backup-Aktualität, Shares, freier Speicher, Replica(+Lag), Fehler.
// Maßgeblich bleibt der von qnapbackup gelieferte Score — hier nur Diagnose.

type FactorState = "ok" | "warn" | "crit";
interface ScoreFactor {
  label: string;
  state: FactorState;
  detail: string;
}

function evalScoreFactors(m: QnapBackupStatus["metrics"]): ScoreFactor[] {
  const f: ScoreFactor[] = [];

  // Backup-Aktualität (Zukunfts-Timestamp = Uhr-Versatz → als frisch werten)
  if (m.last_backup_at) {
    const t = Date.parse(m.last_backup_at);
    if (!Number.isNaN(t)) {
      const ageH = Math.max(0, (Date.now() - t) / 3_600_000);
      f.push({
        label: "Backup-Aktualität",
        state: ageH < 25 ? "ok" : ageH < 48 ? "warn" : "crit",
        detail: ageH < 25 ? "letztes Backup < 25 h" : `letztes Backup ${ageH < 48 ? ageH.toFixed(0) + " h" : (ageH / 24).toFixed(1) + " d"} alt`,
      });
    }
  }
  // Freigaben
  if (m.shares_total != null) {
    const allOk = (m.shares_failed ?? 0) === 0 && m.shares_ok === m.shares_total;
    f.push({
      label: "Freigaben",
      state: allOk ? "ok" : "crit",
      detail: `${m.shares_ok ?? "?"}/${m.shares_total} gesichert`,
    });
  }
  // Freier Speicher
  if (m.free_space_percent != null) {
    const p = m.free_space_percent;
    f.push({
      label: "Freier Speicher",
      state: p >= 20 ? "ok" : p >= 10 ? "warn" : "crit",
      detail: `${p} % frei`,
    });
  }
  // Postgres-Replica (+ Lag)
  if (m.replica_oberon_postgres_ok != null) {
    const ok = m.replica_oberon_postgres_ok;
    const lag = m.replica_oberon_postgres_lag_seconds ?? 0;
    f.push({
      label: "Postgres-Replica",
      state: !ok ? "crit" : lag >= 300 ? "warn" : "ok",
      detail: !ok ? "Replica nicht erreichbar" : `Lag ${fmtDuration(lag)}${lag >= 300 ? " (> 300 s)" : " (ok)"}`,
    });
  }
  // Fehler 24h
  if (m.errors_24h != null) {
    f.push({
      label: "Fehler (24 h)",
      state: m.errors_24h > 0 ? "crit" : "ok",
      detail: `${m.errors_24h} Fehler`,
    });
  }
  return f;
}

function FactorDot({ state }: { state: FactorState }) {
  const c = state === "crit" ? "bg-status-error" : state === "warn" ? "bg-status-warn" : "bg-status-ok";
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${c}`} aria-hidden="true" />;
}

function rankState(s: FactorState): number {
  return s === "crit" ? 2 : s === "warn" ? 1 : 0;
}

/** Statusfarbe fuer einen Backup-Eintrag. */
function backupStatusKind(status: string): "ok" | "warn" | "error" {
  const s = status.toLowerCase();
  if (["success", "ok", "completed"].includes(s)) return "ok";
  if (["partial", "warning", "warn"].includes(s)) return "warn";
  return "error";
}

/** Statusfarbe fuer Score 0..100. */
function scoreKind(score: number): "ok" | "warn" | "error" {
  if (score >= 70) return "ok";
  if (score >= 40) return "warn";
  return "error";
}

const SCORE_COLORS: Record<"ok" | "warn" | "error", string> = {
  ok: "text-status-ok",
  warn: "text-status-warn",
  error: "text-status-error",
};

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
  source = "/api/v1/qnapbackup/status",
  updatedAt,
}: {
  label: string;
  value: React.ReactNode;
  tip: string;
  thresholds?: string;
  source?: string;
  updatedAt?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1 border-b border-white/5 last:border-0">
      <span className="shrink-0 text-xs text-fg-muted">{label}</span>
      <Tooltip title={tip} source={source} thresholds={thresholds} updatedAt={updatedAt}>
        <span className="text-right text-sm text-fg">{value}</span>
      </Tooltip>
    </div>
  );
}

// ─── Status-Panel ─────────────────────────────────────────────────────────────

function StatusPanel({ status, updatedAt }: { status: QnapBackupStatus; updatedAt: string }) {
  const m = status.metrics;
  const kind = scoreKind(status.score);

  return (
    <Panel title="Backup-Status">
      {/* Hero: Score + LED + Summary */}
      <div className="mb-3 flex items-center gap-3">
        <Tooltip
          title="Gesamt-Score des Backup-Systems (0..100)"
          source="/api/v1/qnapbackup/status"
          thresholds="≥70 = gruen · 40–69 = gelb · <40 = rot"
          updatedAt={updatedAt}
        >
          <span className={`text-3xl font-bold tabular-nums ${SCORE_COLORS[kind]}`}>
            {status.score}
          </span>
        </Tooltip>
        <div className="flex flex-col gap-0.5">
          <Tooltip
            title={`Status: ${status.ok ? "OK" : "Nicht OK"}`}
            source="/api/v1/qnapbackup/status"
            thresholds="gruen = ok · rot = Fehler"
            updatedAt={updatedAt}
          >
            <span className="flex items-center gap-1.5">
              <StatusDot status={status.ok ? "ok" : "error"} size="lg" />
              <span className={`text-xs font-medium ${status.ok ? "text-status-ok" : "text-status-error"}`}>
                {status.ok ? "OK" : "Fehler"}
              </span>
            </span>
          </Tooltip>
          <span className="text-xs text-fg-muted">{status.summary}</span>
        </div>
      </div>

      {/* Metriken */}
      <div className="flex flex-col gap-0">
        <KV
          label="Letztes Backup"
          value={backupTimeLabel(m.last_backup_at)}
          tip={`Zeitpunkt des letzten Backups: ${m.last_backup_at ?? "unbekannt"}`}
          source="/api/v1/qnapbackup/status"
          updatedAt={updatedAt}
        />
        <KV
          label="Backup-Dauer"
          value={fmtDuration(m.last_backup_duration_seconds)}
          tip="Dauer des letzten Backup-Laufs"
          source="/api/v1/qnapbackup/status"
          updatedAt={updatedAt}
        />
        <KV
          label="Backup-Größe"
          value={formatBytes(m.last_backup_size_bytes)}
          tip="Übertragene Datenmenge im letzten Backup"
          source="/api/v1/qnapbackup/status"
          updatedAt={updatedAt}
        />
        <KV
          label="Freigaben"
          value={
            m.shares_ok != null && m.shares_total != null
              ? `${m.shares_ok} / ${m.shares_total}`
              : "-"
          }
          tip="Anzahl erfolgreich gesicherter Freigaben (OK / Gesamt)"
          thresholds="alle OK = gruen · Teile fehlgeschlagen = rot"
          source="/api/v1/qnapbackup/status"
          updatedAt={updatedAt}
        />
        <KV
          label="Freier Speicher"
          value={
            m.free_space_bytes != null
              ? `${formatBytes(m.free_space_bytes)} (${formatPercent(m.free_space_percent)})`
              : "-"
          }
          tip="Verfügbarer Speicherplatz auf dem Backup-Ziel"
          thresholds="≥20 % = gruen · 10–19 % = gelb · <10 % = rot"
          source="/api/v1/qnapbackup/status"
          updatedAt={updatedAt}
        />
        <KV
          label="Replica Postgres"
          value={
            m.replica_oberon_postgres_ok != null ? (
              <span className="flex items-center gap-1.5">
                <StatusDot status={m.replica_oberon_postgres_ok ? "ok" : "error"} />
                <span className={m.replica_oberon_postgres_ok ? "text-status-ok" : "text-status-error"}>
                  {m.replica_oberon_postgres_ok ? "OK" : "Fehler"}
                </span>
              </span>
            ) : "-"
          }
          tip="Replikations-Status der Oberon-Postgres-Datenbank"
          thresholds="OK = gruen · Fehler = rot"
          source="/api/v1/qnapbackup/status"
          updatedAt={updatedAt}
        />
        <KV
          label="Replica-Lag"
          value={fmtDuration(m.replica_oberon_postgres_lag_seconds)}
          tip="Replikations-Verzögerung der Postgres-DB in Sekunden"
          thresholds="<300s = normal · ≥300s = Warnung (orange)"
          source="/api/v1/qnapbackup/status"
          updatedAt={updatedAt}
        />
        <KV
          label="Fehler (24h)"
          value={
            m.errors_24h != null ? (
              <span className={m.errors_24h > 0 ? "text-status-error font-semibold" : ""}>
                {m.errors_24h}
              </span>
            ) : "-"
          }
          tip="Anzahl Backup-Fehler in den letzten 24 Stunden"
          thresholds="0 = gruen · >0 = rot"
          source="/api/v1/qnapbackup/status"
          updatedAt={updatedAt}
        />
      </div>

      {/* Fehler-Box */}
      {status.error && (
        <div className="mt-2 rounded border border-status-error/30 bg-status-error/10 px-2 py-1 text-xs text-status-error">
          {status.error}
        </div>
      )}
    </Panel>
  );
}

// ─── Backup-Historie ─────────────────────────────────────────────────────────

function BackupRow({ item, updatedAt }: { item: QnapBackupRecentItem; updatedAt: string }) {
  const kind = backupStatusKind(item.status);
  return (
    <tr className="border-t border-white/5 hover:bg-bg-subtle/30 transition-colors">
      <td className="py-2 px-3 text-xs text-fg-muted font-mono">
        <Tooltip
          title={`Backup-ID: ${item.id} · Start: ${item.started_at}`}
          source="/api/v1/qnapbackup/backups/recent"
          updatedAt={updatedAt}
        >
          <span>{backupTimeLabel(item.started_at)}</span>
        </Tooltip>
      </td>
      <td className="py-2 px-3 text-xs text-fg">
        <Tooltip
          title={`Dauer: ${fmtDuration(item.duration_seconds)}`}
          source="/api/v1/qnapbackup/backups/recent"
          updatedAt={updatedAt}
        >
          <span>{fmtDuration(item.duration_seconds)}</span>
        </Tooltip>
      </td>
      <td className="py-2 px-3 text-xs text-fg">
        <Tooltip
          title={`Übertragen: ${formatBytes(item.bytes_transferred)}`}
          source="/api/v1/qnapbackup/backups/recent"
          updatedAt={updatedAt}
        >
          <span>{formatBytes(item.bytes_transferred)}</span>
        </Tooltip>
      </td>
      <td className="py-2 px-3">
        <Tooltip
          title={`Status: ${item.status}${item.warnings.length > 0 ? ` · ${item.warnings.length} Warnung(en)` : ""}`}
          source="/api/v1/qnapbackup/backups/recent"
          thresholds="success/ok = gruen · partial/warn = gelb · failed = rot"
          updatedAt={updatedAt}
        >
          <span className="flex items-center gap-1.5">
            <StatusDot status={kind} />
            <span
              className={`text-xs ${
                kind === "ok" ? "text-status-ok" :
                kind === "warn" ? "text-status-warn" : "text-status-error"
              }`}
            >
              {item.status}
            </span>
            {item.warnings.length > 0 && (
              <span className="text-xxs text-status-warn">({item.warnings.length})</span>
            )}
          </span>
        </Tooltip>
      </td>
      <td className="py-2 px-3 text-xs text-fg-muted">
        <Tooltip
          title={`Gesicherte Freigabe: ${item.share || "—"}`}
          source="/api/v1/qnapbackup/backups/recent"
          updatedAt={updatedAt}
        >
          <span className="font-mono">{item.share || "—"}</span>
        </Tooltip>
      </td>
    </tr>
  );
}

function BackupsPanel({ items, updatedAt }: { items: QnapBackupRecentItem[]; updatedAt: string }) {
  return (
    <Panel title="Backup-Historie (letzte 20)">
      {items.length === 0 ? (
        <p className="py-4 text-center text-sm text-fg-muted">
          Noch keine Backups gelistet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-xxs uppercase tracking-wide text-fg-subtle">
                <th className="py-1 px-3">Start</th>
                <th className="py-1 px-3">Dauer</th>
                <th className="py-1 px-3">Übertragen</th>
                <th className="py-1 px-3">Status</th>
                <th className="py-1 px-3">Freigabe</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <BackupRow key={item.id} item={item} updatedAt={updatedAt} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

// ─── Score-Drilldown "Warum dieser Score?" ──────────────────────────────────

function ScoreBreakdownPanel({ status }: { status: QnapBackupStatus }) {
  const factors = evalScoreFactors(status.metrics);
  const issues = factors.filter((f) => f.state !== "ok");
  const sorted = [...factors].sort((a, b) => rankState(b.state) - rankState(a.state));

  return (
    <Panel title="Warum dieser Score?">
      <p className="mb-2 text-xs text-fg-muted">
        Score <strong className="text-fg">{status.score}/100</strong> —{" "}
        {issues.length === 0
          ? "alle Faktoren grün."
          : `gedrückt durch: ${issues.map((i) => i.label).join(", ")}.`}
      </p>
      <div className="flex flex-col gap-1.5">
        {sorted.map((f) => (
          <Tooltip
            key={f.label}
            title={`${f.label}: ${f.detail}`}
            source="/api/v1/qnapbackup/status"
            block
          >
            <div className="flex items-center gap-2 text-xs">
              <FactorDot state={f.state} />
              <span className="w-36 shrink-0 text-fg">{f.label}</span>
              <span
                className={
                  f.state === "ok"
                    ? "text-fg-muted"
                    : f.state === "warn"
                      ? "text-status-warn"
                      : "text-status-error"
                }
              >
                {f.detail}
              </span>
            </div>
          </Tooltip>
        ))}
      </div>
      <p className="mt-2 text-xxs text-fg-subtle">
        Faktoren spiegeln qnapbackups Bewertungs-Heuristik (compute_status_score). Maßgeblich
        ist der von qnapbackup gelieferte Score.
      </p>
    </Panel>
  );
}

// ─── Haupt-Komponente ─────────────────────────────────────────────────────────

export function QnapBackupFeature() {
  const now = new Date().toISOString();

  const statusQuery = useQuery({
    queryKey: ["qnapbackup", "status"],
    queryFn: () => api.qnapbackup.getStatus(),
    refetchInterval: 15_000,
    retry: 1,
  });

  const recentQuery = useQuery({
    queryKey: ["qnapbackup", "backups-recent"],
    queryFn: () => api.qnapbackup.getBackupsRecent(20),
    refetchInterval: 15_000,
    retry: 1,
  });

  const updatedAt = formatRelative(
    statusQuery.dataUpdatedAt ? new Date(statusQuery.dataUpdatedAt).toISOString() : now,
  );

  const isLoading = statusQuery.isLoading || recentQuery.isLoading;

  return (
    <div className="flex flex-col" data-testid="qnapbackup">
      <Breadcrumb />

      <div className="flex flex-col gap-4 p-4">
        {/* Titelzeile + Web-UI-Button */}
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-lg font-semibold text-fg">qnapbackup</h1>
          <Tooltip
            title="Öffnet das qnapbackup Web-UI im Browser (Port :9000)"
            source="http://192.168.200.71:9000"
          >
            <a
              href="http://192.168.200.71:9000"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded border border-white/10 bg-bg-panel px-3 py-1.5 text-sm text-fg
                         hover:bg-bg-subtle transition-colors"
              data-testid="webui-link"
            >
              Web-UI öffnen →
            </a>
          </Tooltip>
        </div>

        {/* Lade-Zustand */}
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-fg-muted">
            <LoadingSpinner />
            <span>Lade Backup-Status…</span>
          </div>
        )}

        {/* Fehler-Zustand */}
        {statusQuery.isError && !statusQuery.data && (
          <div className="rounded border border-status-error/30 bg-status-error/10 px-3 py-2 text-sm text-status-error">
            Status nicht erreichbar — qnapbackup API antwortet nicht.
          </div>
        )}

        {/* Status-Panel */}
        {statusQuery.data && (
          <StatusPanel status={statusQuery.data} updatedAt={updatedAt} />
        )}

        {/* Score-Drilldown: warum nicht 100? */}
        {statusQuery.data && <ScoreBreakdownPanel status={statusQuery.data} />}

        {/* Backup-Historie */}
        {recentQuery.data && (
          <BackupsPanel items={recentQuery.data.items} updatedAt={updatedAt} />
        )}

        {recentQuery.isError && (
          <div className="rounded border border-status-warn/30 bg-status-warn/10 px-3 py-2 text-sm text-status-warn">
            Backup-Historie nicht erreichbar.
          </div>
        )}
      </div>

      <PageBadge id="qnapbackup" />
    </div>
  );
}

export default QnapBackupFeature;
