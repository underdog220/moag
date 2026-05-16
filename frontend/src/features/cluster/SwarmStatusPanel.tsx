// SwarmStatusPanel — Modul H3 (Phase 4 Welle 1).
// Zeigt den Schwarm-Cluster-Status des aktuellen OCRexpert-Default-Hubs:
//   - "Mein Hub" — mode, epoch, priority, instance_id
//   - "Peers"    — Tabelle der bekannten Voll-OctoBosse
//   - "Master"   — primary_id + last_election
//   - "Election" — cooldown + Trigger-Button (Operator-only)
//
// Daten aus /api/cluster/{status,peers}; Refresh alle 5 s via React-Query.
// Trigger-Button ruft /api/cluster/election/trigger (Operator-Token Pflicht).

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "../../components/Card";
import { StatusDot } from "../../components/StatusDot";
import { api, ApiError } from "../../lib/api";
import { qk } from "../../lib/queryKeys";
import { formatDateTime, formatRelative } from "../../lib/format";
import type { ClusterMode, ClusterPeer, ClusterStatus } from "../../lib/types";

export interface SwarmStatusPanelProps {
  refetchIntervalMs?: number;
}

// ── Helper: Mode → Pill-Style ────────────────────────────────────────────

function ModePill({ mode }: { mode: string }) {
  const m = mode as ClusterMode | string;
  let cls = "bg-status-neutral/20 text-fg-muted";
  if (m === "primary") cls = "bg-status-ok/20 text-status-ok";
  else if (m === "replica") cls = "bg-status-info/20 text-status-info";
  else if (m === "proxy") cls = "bg-status-warn/20 text-status-warn";
  else if (m === "standalone") cls = "bg-status-neutral/30 text-fg";
  return (
    <span
      data-testid="mode-pill"
      data-mode={mode}
      className={`inline-flex items-center rounded px-1.5 py-0.5 font-mono text-xxs uppercase tracking-wider ${cls}`}
    >
      {mode}
    </span>
  );
}

function OnlineBadge({ online }: { online: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      <StatusDot status={online ? "ok" : "error"} size="sm" />
      <span className="text-xs text-fg-muted">{online ? "online" : "offline"}</span>
    </span>
  );
}

// ── Sub-Components ───────────────────────────────────────────────────────

function MyHubBox({ status }: { status: ClusterStatus }) {
  return (
    <Card title="Mein Hub" data-testid="swarm-my-hub">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt className="text-fg-muted">Mode</dt>
        <dd>
          <ModePill mode={status.mode} />
        </dd>
        <dt className="text-fg-muted">Epoch</dt>
        <dd className="font-mono">{status.epoch}</dd>
        <dt className="text-fg-muted">Priority</dt>
        <dd className="font-mono">{status.priority}</dd>
        <dt className="text-fg-muted">Instance-ID</dt>
        <dd className="font-mono text-xs">{status.instance_id}</dd>
        {status.hostname && (
          <>
            <dt className="text-fg-muted">Hostname</dt>
            <dd>{status.hostname}</dd>
          </>
        )}
        {status.site_id && (
          <>
            <dt className="text-fg-muted">Site</dt>
            <dd className="font-mono text-xs">{status.site_id}</dd>
          </>
        )}
        <dt className="text-fg-muted">Nodes</dt>
        <dd className="font-mono">{status.node_count}</dd>
        <dt className="text-fg-muted">Compute-Score</dt>
        <dd className="font-mono">{status.compute_score}</dd>
      </dl>
    </Card>
  );
}

// ── Hub-0.9.3-Feature-Felder ─────────────────────────────────────────────

function HubFeaturesBox({ status }: { status: ClusterStatus }) {
  const eligible =
    status.election_eligible == null ? "—" : status.election_eligible ? "Ja" : "Nein";
  const threshold =
    status.load_threshold_percent == null
      ? "—"
      : `${status.load_threshold_percent}%`;
  const modeAware =
    status.mode_aware_routing_enabled == null
      ? "—"
      : status.mode_aware_routing_enabled
      ? "Ja"
      : "Nein";

  return (
    <Card title="Hub-Funktionen" data-testid="swarm-hub-features">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt className="text-fg-muted">Election-Eligible</dt>
        <dd data-testid="hub-election-eligible" className="font-mono">
          {eligible}
        </dd>
        <dt className="text-fg-muted">Load-Threshold</dt>
        <dd data-testid="hub-load-threshold" className="font-mono">
          {threshold}
        </dd>
        <dt className="text-fg-muted">Mode-Aware-Routing</dt>
        <dd data-testid="hub-mode-aware-routing" className="font-mono">
          {modeAware}
        </dd>
      </dl>
    </Card>
  );
}

function MasterBox({ status }: { status: ClusterStatus }) {
  const election = status.last_election;
  return (
    <Card title="Master" data-testid="swarm-master">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt className="text-fg-muted">Primary-ID</dt>
        <dd className="font-mono text-xs" data-testid="master-primary-id">
          {status.primary_id ?? "—"}
        </dd>
        {status.primary_address && (
          <>
            <dt className="text-fg-muted">Address</dt>
            <dd className="font-mono text-xs">{status.primary_address}</dd>
          </>
        )}
        <dt className="text-fg-muted">Letzte Election</dt>
        <dd>
          {election?.timestamp
            ? formatDateTime(election.timestamp)
            : "—"}
        </dd>
        <dt className="text-fg-muted">Winner</dt>
        <dd className="font-mono text-xs">
          {election?.winner_id ?? "—"}
        </dd>
        <dt className="text-fg-muted">Reason</dt>
        <dd className="text-xs">{election?.reason ?? "—"}</dd>
      </dl>
    </Card>
  );
}

function PeersTable({ peers }: { peers: ClusterPeer[] }) {
  // Sortierung: erst Mode (primary > replica > proxy > standalone),
  // dann nach online-Flag (online vor offline).
  const modeOrder: Record<string, number> = {
    primary: 0,
    replica: 1,
    proxy: 2,
    standalone: 3,
  };
  const sorted = [...peers].sort((a, b) => {
    const mo =
      (modeOrder[a.mode] ?? 99) - (modeOrder[b.mode] ?? 99);
    if (mo !== 0) return mo;
    if (a.online !== b.online) return a.online ? -1 : 1;
    return a.instance_id.localeCompare(b.instance_id);
  });

  if (sorted.length === 0) {
    return (
      <Card title="Peers" data-testid="swarm-peers">
        <p className="text-sm text-fg-muted">Keine Peers bekannt.</p>
      </Card>
    );
  }

  return (
    <Card title={`Peers (${sorted.length})`} data-testid="swarm-peers">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wider text-fg-muted">
              <th className="px-2 py-1 text-left">Hostname</th>
              <th className="px-2 py-1 text-left">URL</th>
              <th className="px-2 py-1 text-left">Mode</th>
              <th className="px-2 py-1 text-left">Online</th>
              <th className="px-2 py-1 text-left">Last Beacon</th>
              <th className="px-2 py-1 text-right">Epoch</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr
                key={p.instance_id}
                data-testid={`peer-row-${p.instance_id}`}
                className="border-t border-white/5"
              >
                <td className="px-2 py-1 font-medium">
                  {p.hostname ?? <span className="text-fg-muted">(unbekannt)</span>}
                </td>
                <td className="px-2 py-1 font-mono text-xs text-fg-muted">{p.url}</td>
                <td className="px-2 py-1">
                  <ModePill mode={p.mode} />
                </td>
                <td className="px-2 py-1">
                  <OnlineBadge online={p.online} />
                </td>
                <td className="px-2 py-1 text-xs text-fg-muted">
                  {p.last_beacon ? formatRelative(p.last_beacon) : "—"}
                </td>
                <td className="px-2 py-1 text-right font-mono">{p.epoch}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ElectionSection({
  status,
  hasOperatorToken,
}: {
  status: ClusterStatus;
  hasOperatorToken: boolean;
}) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const cooldown = status.last_election?.cooldown_remaining_s ?? 0;
  const cooldownActive = cooldown > 0;

  const m = useMutation({
    mutationFn: () => api.triggerElection("operator manual trigger from GUI"),
    onSuccess: (data) => {
      setFeedback(
        data.accepted
          ? `Election ausgeloest (${data.election_id ?? "ohne ID"}).`
          : `Election abgelehnt: ${data.message ?? "—"}`
      );
      qc.invalidateQueries({ queryKey: qk.cluster.swarmStatus });
      qc.invalidateQueries({ queryKey: qk.cluster.swarmPeers });
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof ApiError
          ? `${err.status}: ${err.message}`
          : (err as Error)?.message ?? "Unbekannter Fehler";
      setFeedback(`Fehler: ${msg}`);
    },
    onSettled: () => {
      setConfirm(false);
    },
  });

  const buttonDisabled =
    m.isPending || cooldownActive || !hasOperatorToken;

  return (
    <Card title="Election" data-testid="swarm-election">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt className="text-fg-muted">Cooldown</dt>
        <dd
          className="font-mono"
          data-testid="election-cooldown"
        >
          {cooldownActive ? `${cooldown.toFixed(0)} s verbleibend` : "frei"}
        </dd>
      </dl>

      <div className="mt-4 space-y-2">
        {!hasOperatorToken && (
          <p className="text-xs text-fg-muted" data-testid="no-token-hint">
            Trigger benoetigt einen Operator-Token in den Einstellungen.
          </p>
        )}

        {!confirm ? (
          <button
            type="button"
            data-testid="trigger-election-btn"
            disabled={buttonDisabled}
            onClick={() => setConfirm(true)}
            className={`rounded border border-white/10 px-3 py-1.5 text-sm font-medium transition-colors ${
              buttonDisabled
                ? "cursor-not-allowed bg-bg-subtle text-fg-muted"
                : "bg-status-warn/20 text-status-warn hover:bg-status-warn/30"
            }`}
          >
            Election ausloesen
          </button>
        ) : (
          <div
            data-testid="election-confirm-dialog"
            className="space-y-2 rounded border border-status-warn/40 bg-status-warn/5 p-3"
          >
            <p className="text-sm text-fg">
              Master-Election wirklich ausloesen? Das kann kurzzeitig zu
              Failover-Aktivitaet im Schwarm fuehren.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                data-testid="trigger-election-confirm"
                onClick={() => m.mutate()}
                disabled={m.isPending}
                className="rounded bg-status-warn px-3 py-1 text-xs font-medium text-bg hover:bg-status-warn/80"
              >
                {m.isPending ? "Sende ..." : "Ja, ausloesen"}
              </button>
              <button
                type="button"
                data-testid="trigger-election-cancel"
                onClick={() => setConfirm(false)}
                disabled={m.isPending}
                className="rounded border border-white/10 px-3 py-1 text-xs text-fg-muted hover:text-fg"
              >
                Abbrechen
              </button>
            </div>
          </div>
        )}

        {feedback && (
          <p
            data-testid="election-feedback"
            className="rounded bg-bg-subtle px-2 py-1 text-xs text-fg"
          >
            {feedback}
          </p>
        )}
      </div>
    </Card>
  );
}

// ── Hauptkomponente ──────────────────────────────────────────────────────

export function SwarmStatusPanel({
  refetchIntervalMs = 5_000,
}: SwarmStatusPanelProps = {}) {
  const statusQ = useQuery({
    queryKey: qk.cluster.swarmStatus,
    queryFn: () => api.getSwarmStatus(),
    refetchInterval: refetchIntervalMs,
    staleTime: 1_000,
  });

  const peersQ = useQuery({
    queryKey: qk.cluster.swarmPeers,
    queryFn: () => api.getSwarmPeers(),
    refetchInterval: refetchIntervalMs,
    staleTime: 1_000,
  });

  // Operator-Token-Heuristik: wir holen die Settings einmal und pruefen
  // ob api_token gesetzt ist. Token-Wert selbst lesen wir nicht — UI
  // kennt nur "ja/nein".
  const settingsQ = useQuery({
    queryKey: qk.settings,
    queryFn: () => api.getSettings(),
    staleTime: 30_000,
  });
  const hasOperatorToken = Boolean(settingsQ.data?.api_token);

  if (statusQ.isLoading) {
    return (
      <div
        data-testid="swarm-loading"
        className="p-6 text-sm text-fg-muted"
      >
        Schwarm-Status wird geladen ...
      </div>
    );
  }

  if (statusQ.isError || !statusQ.data) {
    return (
      <div
        data-testid="swarm-error"
        className="m-4 rounded border border-status-error/40 bg-status-error/10 p-4 text-sm text-status-error"
      >
        Schwarm-Status konnte nicht geladen werden:{" "}
        {(statusQ.error as Error)?.message ?? "unbekannter Fehler"}.
      </div>
    );
  }

  const status = statusQ.data;
  const peers = peersQ.data?.peers ?? [];

  return (
    <div className="space-y-4 p-4" data-testid="swarm-status-panel">
      <div className="grid gap-4 md:grid-cols-2">
        <MyHubBox status={status} />
        <MasterBox status={status} />
      </div>
      <HubFeaturesBox status={status} />
      <PeersTable peers={peers} />
      <ElectionSection
        status={status}
        hasOperatorToken={hasOperatorToken}
      />
    </div>
  );
}

export default SwarmStatusPanel;
