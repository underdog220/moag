// ClusterIntentSection — Versions-, Override- und Modul-Drift-Sicht pro Hub.
// Wird innerhalb der HubCard in ManifestHealth.tsx eingebettet.
//
// Architektur-Aussage: "Cluster-Intent sichtbar und steuerbar machen".
//
// Sub-Sektionen (in dieser Reihenfolge):
//   1. Core: Default-Version + Versions-Liste + Default-Tausch-Button
//   2. Core-Overrides: Tabelle mit Pin/Unpin pro Node
//   3. Bootstrapper: gleiches Layout wie Core, aber Versions-API noch fehlt
//      ⇒ Schreib-Aktionen disabled bis OctoBoss-CR 2026-05-23 durch ist
//   4. Module-Drift: Matrix Node × Modul × Version mit Drift-Anzeige
//
// Schreib-Operationen brauchen ConfirmDialog (ADR-007).
// Default-Tausch zusaetzlich Panopticor-Pretest GREEN (Hart-Block).

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import { Tooltip } from "../../../components/Tooltip";

// ── Typen ─────────────────────────────────────────────────────────────────────

export interface CoreVersionEntry {
  version: string;
  sha256?: string;
  size_bytes?: number;
  released?: string;
}

export interface BootstrapperVersionEntry extends CoreVersionEntry {
  url?: string;
}

export interface OverrideEntry {
  node_id: string;
  version: string;
}

export interface CoreInventory {
  default: string;
  versions: CoreVersionEntry[];
  overrides: OverrideEntry[];
  asset_inventory_versions: string[];
  supports_versions_api: boolean;
  error?: string | null;
}

export interface BootstrapperInventory {
  default: string;
  versions: BootstrapperVersionEntry[];
  overrides: OverrideEntry[];
  supports_versions_api: boolean;
  cr_pending?: string;
  available: boolean;
  sha256: string;
  size_bytes: number;
  error?: string | null;
}

export interface NodeModuleEntry {
  name: string;
  version: string;
  status: string;
}

export interface NodeWithModules {
  node_id: string;
  hostname: string;
  connected: boolean;
  node_pool: string;
  modules: NodeModuleEntry[];
}

export interface ModulesDrift {
  module: string;
  versions: Record<string, string[]>;
  version_count: number;
}

export interface ModulesInventory {
  by_node: NodeWithModules[];
  drift: ModulesDrift[];
  node_count: number;
  module_count: number;
  error?: string | null;
}

export interface HubInventory {
  core: CoreInventory;
  bootstrapper: BootstrapperInventory;
  modules: ModulesInventory;
}

export interface ManifestInventoryAll {
  schema: "manifest-inventory-v1";
  active_hub_id: string;
  hubs: Array<{
    id: string;
    url: string;
    is_active: boolean;
    inventory: HubInventory | null;
    error: string | null;
  }>;
}

// ── Default-Flip-Dialog ───────────────────────────────────────────────────────

type Verdict = "pending" | "green" | "red";

interface DefaultFlipDialogProps {
  open: boolean;
  hubId: string;
  targetVersion: string;
  currentDefault: string;
  onClose: () => void;
  onApplied: () => void;
}

interface ImpactPreviewData {
  target_version: string;
  hub_id: string;
  nodes_total: number;
  nodes_affected: number;
  nodes_pinned: number;
  overrides: OverrideEntry[];
  current_default: string;
}

interface PretestStatusData {
  spec_id: string;
  spec_path: string;
  verdict: Verdict;
  details?: unknown;
}

function DefaultFlipDialog({
  open,
  hubId,
  targetVersion,
  currentDefault,
  onClose,
  onApplied,
}: DefaultFlipDialogProps) {
  const [specId, setSpecId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const queryClient = useQueryClient();

  // 1) Impact-Vorschau
  const impact = useQuery({
    queryKey: ["manifest", "impact", hubId, targetVersion],
    queryFn: () =>
      api.octoboss.getCoreDefaultImpact(targetVersion, hubId) as Promise<ImpactPreviewData>,
    enabled: open,
    refetchOnWindowFocus: false,
  });

  // 2) Pretest-Status (gepollt, wenn ein specId gesetzt ist)
  const pretest = useQuery({
    queryKey: ["manifest", "pretest", specId],
    queryFn: () => api.octoboss.getManifestPretestStatus(specId!) as Promise<PretestStatusData>,
    enabled: !!specId,
    refetchInterval: (q) => {
      const verdict = (q.state.data as PretestStatusData | undefined)?.verdict;
      return verdict && verdict !== "pending" ? false : 3000;
    },
  });

  // 3) Pretest starten
  const startPretest = useMutation({
    mutationFn: () =>
      api.octoboss.startManifestPretest({
        target_version: targetVersion,
        hub_id: hubId,
        target_kind: "core",
      }) as Promise<PretestStatusData>,
    onSuccess: (data) => setSpecId(data.spec_id),
  });

  // 4) Apply (Default-Tausch)
  const apply = useMutation({
    mutationFn: () =>
      api.octoboss.setCoreDefault({
        version: targetVersion,
        hub_id: hubId,
        pretest_run_id: specId!,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["octoboss", "manifest-inventory"] });
      queryClient.invalidateQueries({ queryKey: ["octoboss", "manifest-health-all"] });
      onApplied();
      onClose();
    },
  });

  if (!open) return null;

  const verdict: Verdict = pretest.data?.verdict ?? "pending";
  const canApply = !!specId && verdict === "green" && confirmed && !apply.isPending;

  return (
    <div
      data-testid="default-flip-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="default-flip-title"
        className="relative w-full max-w-2xl rounded-xl border border-status-error/30 bg-bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 rounded-t-xl border-b border-white/10 bg-status-error/10 px-5 py-4">
          <span aria-hidden="true" className="text-xl text-status-error">⚠</span>
          <h2 id="default-flip-title" className="text-base font-semibold text-status-error">
            Default-Version global tauschen
          </h2>
        </div>

        {/* Body */}
        <div className="space-y-4 px-5 py-4 text-sm text-fg-muted">
          {/* Versions-Tausch-Kontext */}
          <div className="rounded border border-white/10 bg-bg-elevated p-3">
            <p className="mb-1 text-xs font-semibold text-fg-muted">Was sich aendert</p>
            <p className="font-mono text-fg">
              Hub <span className="text-status-warn">{hubId}</span>:{" "}
              <span className="text-status-error">{currentDefault || "(unbekannt)"}</span>
              {" → "}
              <span className="text-status-ok">{targetVersion}</span>
            </p>
          </div>

          {/* Impact-Vorschau */}
          {impact.isLoading && <p className="text-fg-subtle">Lade Betroffenheit...</p>}
          {impact.data && (
            <div className="rounded border border-white/10 bg-bg-elevated p-3" data-testid="default-flip-impact">
              <p className="mb-2 text-xs font-semibold text-fg-muted">Cluster-Betroffenheit</p>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-xs text-fg-subtle">Nodes total</p>
                  <p className="text-2xl font-bold tabular-nums text-fg">{impact.data.nodes_total}</p>
                </div>
                <div>
                  <Tooltip title="Diese Nodes haben kein Override und werden auf die neue Default-Version umgestellt." source="/api/v1/manifest/admin/core/default/impact">
                    <p className="cursor-help text-xs text-status-warn">Werden umgestellt</p>
                  </Tooltip>
                  <p className="text-2xl font-bold tabular-nums text-status-warn">{impact.data.nodes_affected}</p>
                </div>
                <div>
                  <Tooltip title="Diese Nodes haben einen Override gesetzt und bleiben auf ihrer gepinnten Version." source="/api/v1/manifest/admin/core/default/impact">
                    <p className="cursor-help text-xs text-fg-subtle">Gepinnt (bleiben)</p>
                  </Tooltip>
                  <p className="text-2xl font-bold tabular-nums text-fg-subtle">{impact.data.nodes_pinned}</p>
                </div>
              </div>
            </div>
          )}

          {/* Pretest-Block */}
          <div className="rounded border border-white/10 bg-bg-elevated p-3" data-testid="default-flip-pretest">
            <p className="mb-2 text-xs font-semibold text-fg-muted">Panopticor-Pretest (Pflicht)</p>
            {!specId && (
              <>
                <p className="mb-2 text-xs text-fg-subtle">
                  Default-Tausch ist hart blockiert bis Panopticor-Pretest GREEN meldet.
                </p>
                <button
                  type="button"
                  onClick={() => startPretest.mutate()}
                  disabled={startPretest.isPending}
                  className="rounded border border-status-warn/40 bg-status-warn/10 px-3 py-2 text-xs font-semibold text-status-warn
                    hover:bg-status-warn/20 disabled:opacity-50 min-h-[44px]"
                >
                  {startPretest.isPending ? "Pretest wird angelegt..." : "Pretest anfordern"}
                </button>
              </>
            )}
            {specId && (
              <div className="space-y-2">
                <p className="font-mono text-xs text-fg-subtle break-all">spec_id: {specId}</p>
                {pretest.data?.spec_path && (
                  <p className="font-mono text-xs text-fg-subtle break-all">{pretest.data.spec_path}</p>
                )}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-fg-muted">Verdict:</span>
                  <span
                    data-testid="pretest-verdict"
                    className={
                      verdict === "green"
                        ? "rounded border border-status-ok/40 bg-status-ok/10 px-2 py-0.5 text-xs font-semibold text-status-ok"
                        : verdict === "red"
                        ? "rounded border border-status-error/40 bg-status-error/10 px-2 py-0.5 text-xs font-semibold text-status-error"
                        : "rounded border border-status-warn/40 bg-status-warn/10 px-2 py-0.5 text-xs font-semibold text-status-warn animate-pulse"
                    }
                  >
                    {verdict === "green" ? "✓ GREEN" : verdict === "red" ? "✗ RED" : "⋯ pending"}
                  </span>
                </div>
                {verdict === "red" && (
                  <p className="text-xs text-status-error">
                    Pretest hat RED gemeldet — Default-Tausch bleibt blockiert. Pretest-Spec pruefen.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Doppel-Confirm-Checkbox */}
          {verdict === "green" && (
            <label className="flex items-start gap-3 rounded border border-status-error/30 bg-status-error/10 p-3 text-sm cursor-pointer">
              <input
                type="checkbox"
                data-testid="default-flip-confirm-checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 h-5 w-5 cursor-pointer accent-status-error"
              />
              <span className="text-fg">
                Verstanden: Diese Aktion stellt{" "}
                <strong className="text-status-error">{impact.data?.nodes_affected ?? "?"} Nodes</strong>
                {" "}auf die neue Default-Version um. Nodes mit Override bleiben unveraendert.
              </span>
            </label>
          )}

          {/* Apply-Fehler */}
          {apply.isError && (
            <p className="text-xs text-status-error">
              Fehler beim Apply: {(apply.error as Error).message}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-white/10 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 bg-bg-subtle px-4 py-3 text-sm font-medium text-fg-muted min-h-[44px] hover:border-white/20 hover:text-fg"
          >
            Abbrechen
          </button>
          <button
            type="button"
            data-testid="default-flip-apply"
            onClick={() => apply.mutate()}
            disabled={!canApply}
            className="rounded-lg bg-status-error px-4 py-3 text-sm font-semibold text-white min-h-[44px] hover:bg-status-error/80 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ⚠ Default global tauschen
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Override-Pin-Dialog (Pinning) ─────────────────────────────────────────────

interface PinDialogProps {
  open: boolean;
  hubId: string;
  nodeId: string;
  currentPin: string | null;
  availableVersions: string[];
  onClose: () => void;
}

function PinDialog({ open, hubId, nodeId, currentPin, availableVersions, onClose }: PinDialogProps) {
  const [version, setVersion] = useState(currentPin || availableVersions[0] || "");
  const queryClient = useQueryClient();

  const setPin = useMutation({
    mutationFn: () => api.octoboss.setCoreOverride({ node_id: nodeId, version, hub_id: hubId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["octoboss", "manifest-inventory"] });
      onClose();
    },
  });

  const unpin = useMutation({
    mutationFn: () => api.octoboss.deleteCoreOverride({ node_id: nodeId, hub_id: hubId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["octoboss", "manifest-inventory"] });
      onClose();
    },
  });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="alertdialog"
        className="relative w-full max-w-md rounded-xl border border-white/10 bg-bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-white/10 bg-bg-subtle px-5 py-4">
          <h2 className="text-base font-semibold text-fg">
            Node-Pinning {currentPin ? "aendern" : "setzen"}
          </h2>
        </div>
        <div className="space-y-3 px-5 py-4 text-sm">
          <p className="font-mono text-xs text-fg-subtle break-all">node_id: {nodeId}</p>
          {currentPin && (
            <p className="text-xs text-fg-muted">
              Aktueller Pin: <span className="font-mono text-status-warn">{currentPin}</span>
            </p>
          )}
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-fg-muted">Neue Pin-Version</span>
            <select
              data-testid="pin-version-select"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              className="w-full rounded border border-white/20 bg-bg-elevated px-3 py-2 text-sm text-fg min-h-[44px]"
            >
              {availableVersions.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex justify-between gap-2 border-t border-white/10 px-5 py-4">
          {currentPin && (
            <button
              type="button"
              data-testid="pin-unpin"
              onClick={() => unpin.mutate()}
              disabled={unpin.isPending}
              className="rounded border border-status-error/30 bg-status-error/10 px-3 py-2 text-sm font-semibold text-status-error min-h-[44px] hover:bg-status-error/20 disabled:opacity-50"
            >
              Pinning entfernen
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-white/10 bg-bg-subtle px-4 py-3 text-sm font-medium text-fg-muted min-h-[44px] hover:text-fg"
            >
              Abbrechen
            </button>
            <button
              type="button"
              data-testid="pin-apply"
              onClick={() => setPin.mutate()}
              disabled={!version || setPin.isPending}
              className="rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-white min-h-[44px] hover:bg-brand/80 disabled:opacity-50"
            >
              Pin setzen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Versions-Panel (Core oder Bootstrapper) ───────────────────────────────────

interface VersionsPanelProps {
  title: string;
  hubId: string;
  currentDefault: string;
  versions: Array<{ version: string; sha256?: string; size_bytes?: number }>;
  supportsAdmin: boolean; // false ⇒ Default-Tausch-Button disabled
  crPending?: string;
  error?: string | null;
}

function VersionsPanel({
  title,
  hubId,
  currentDefault,
  versions,
  supportsAdmin,
  crPending,
  error,
}: VersionsPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [flipTarget, setFlipTarget] = useState<string | null>(null);

  const hasMany = versions.length > 1;

  return (
    <div className="rounded border border-white/10 bg-bg-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-3">
          <Tooltip title={`${title}: Soll-Versions-Steuerung. default_version + alle bekannten Versionen.`} source="/api/v1/manifest/inventory">
            <h3 className="text-sm font-semibold text-fg">{title}</h3>
          </Tooltip>
          <Tooltip title="Aktive Default-Version — neue Nodes ohne Override bekommen diese." source="/api/v1/manifest/inventory">
            <code className="rounded bg-bg-elevated px-2 py-0.5 text-xs font-mono text-status-ok">
              {currentDefault || "(leer)"}
            </code>
          </Tooltip>
        </div>
        {!supportsAdmin && crPending && (
          <Tooltip title={`Versions-Listen-API + Admin-Endpoints fehlen — wartet auf OctoBoss-CR ${crPending}`} source={`C:\\code\\OctoBoss\\requests\\open\\${crPending}.md`}>
            <span className="rounded border border-status-warn/30 bg-status-warn/10 px-2 py-0.5 text-xs text-status-warn">
              CR pending
            </span>
          </Tooltip>
        )}
      </div>

      {error && (
        <div className="px-4 py-2 text-xs text-status-error">{error}</div>
      )}

      {versions.length === 0 && !error && (
        <div className="px-4 py-2 text-xs text-fg-subtle">Keine Versionen verfuegbar.</div>
      )}

      {versions.length > 0 && (
        <div>
          {hasMany && (
            <button
              type="button"
              data-testid={`versions-toggle-${title.toLowerCase().replace(/[^a-z]/g, "-")}`}
              onClick={() => setExpanded((e) => !e)}
              className="flex w-full items-center justify-between px-4 py-2 text-left text-xs text-fg-muted hover:bg-bg-elevated/40"
            >
              <span>{versions.length} bekannte Version{versions.length !== 1 ? "en" : ""}</span>
              <span>{expanded ? "▲" : "▼"}</span>
            </button>
          )}
          {(expanded || !hasMany) && (
            <ul className="divide-y divide-white/5">
              {versions.map((v) => {
                const isDefault = v.version === currentDefault;
                return (
                  <li key={v.version} className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
                    <code
                      className={`font-mono ${isDefault ? "font-semibold text-status-ok" : "text-fg"}`}
                    >
                      {isDefault && <span aria-hidden="true" className="mr-1">★</span>}
                      {v.version}
                    </code>
                    {v.sha256 && (
                      <Tooltip title={`SHA256: ${v.sha256}`} source="/api/v1/manifest/inventory">
                        <code className="font-mono text-xs text-fg-subtle">
                          {v.sha256.slice(0, 12)}…
                        </code>
                      </Tooltip>
                    )}
                    {!!v.size_bytes && (
                      <span className="text-xs text-fg-subtle">
                        {(v.size_bytes / 1024).toFixed(1)} KiB
                      </span>
                    )}
                    {!isDefault && supportsAdmin && (
                      <button
                        type="button"
                        data-testid={`versions-set-default-${v.version}`}
                        onClick={() => setFlipTarget(v.version)}
                        className="ml-auto rounded border border-status-warn/40 bg-status-warn/10 px-2 py-1 text-xs text-status-warn hover:bg-status-warn/20 min-h-[32px]"
                      >
                        Default tauschen
                      </button>
                    )}
                    {!isDefault && !supportsAdmin && (
                      <Tooltip title="Default-Tausch braucht OctoBoss-Admin-API — CR ausstehend." source="/api/v1/manifest/inventory">
                        <span className="ml-auto text-xs text-fg-subtle">Default-Tausch erst nach CR</span>
                      </Tooltip>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <DefaultFlipDialog
        open={!!flipTarget}
        hubId={hubId}
        targetVersion={flipTarget || ""}
        currentDefault={currentDefault}
        onClose={() => setFlipTarget(null)}
        onApplied={() => setFlipTarget(null)}
      />
    </div>
  );
}

// ── Overrides-Tabelle ─────────────────────────────────────────────────────────

interface OverridesTableProps {
  title: string;
  hubId: string;
  overrides: OverrideEntry[];
  availableVersions: string[];
  liveNodes: NodeWithModules[];
  supportsAdmin: boolean;
  crPending?: string;
}

function OverridesTable({
  title,
  hubId,
  overrides,
  availableVersions,
  liveNodes,
  supportsAdmin,
  crPending,
}: OverridesTableProps) {
  const [pinDialog, setPinDialog] = useState<{ nodeId: string; current: string | null } | null>(null);

  // Vereinige live-Nodes + override-IDs (manche Overrides koennen Offline-Nodes betreffen)
  const overrideMap = new Map(overrides.map((o) => [o.node_id, o.version]));
  const ids = new Set<string>();
  liveNodes.forEach((n) => ids.add(n.node_id));
  overrideMap.forEach((_, k) => ids.add(k));
  const rows = Array.from(ids).map((id) => {
    const node = liveNodes.find((n) => n.node_id === id);
    return {
      node_id: id,
      hostname: node?.hostname ?? "(offline)",
      connected: node?.connected ?? false,
      override_version: overrideMap.get(id) || null,
    };
  });

  rows.sort((a, b) => {
    if (!!a.override_version === !!b.override_version) return a.hostname.localeCompare(b.hostname);
    return a.override_version ? -1 : 1;
  });

  return (
    <div className="rounded border border-white/10 bg-bg-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <h3 className="text-sm font-semibold text-fg">{title}</h3>
        <span className="text-xs text-fg-subtle">
          {overrides.length} Override{overrides.length !== 1 ? "s" : ""} · {liveNodes.length} Nodes live
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-3 text-xs text-fg-subtle">Keine Nodes bekannt.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-bg-elevated/40 text-xs text-fg-muted">
              <tr>
                <th className="px-4 py-2 text-left">Node</th>
                <th className="px-4 py-2 text-left">Pin (Override)</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-right">Aktion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((row) => (
                <tr key={row.node_id} data-testid={`override-row-${row.node_id}`}>
                  <td className="px-4 py-2">
                    <div className="font-mono text-xs text-fg">{row.hostname}</div>
                    <div className="font-mono text-xs text-fg-subtle break-all">{row.node_id}</div>
                  </td>
                  <td className="px-4 py-2">
                    {row.override_version ? (
                      <code className="rounded bg-status-warn/10 px-2 py-0.5 font-mono text-xs text-status-warn">
                        {row.override_version}
                      </code>
                    ) : (
                      <span className="text-xs text-fg-subtle">– (folgt Default)</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <span className={row.connected ? "text-status-ok" : "text-fg-subtle"}>
                      {row.connected ? "● online" : "○ offline"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    {supportsAdmin ? (
                      <button
                        type="button"
                        data-testid={`override-pin-${row.node_id}`}
                        onClick={() => setPinDialog({ nodeId: row.node_id, current: row.override_version })}
                        className="rounded border border-white/20 bg-bg-elevated px-2 py-1 text-xs text-fg-muted hover:text-fg min-h-[32px]"
                      >
                        {row.override_version ? "aendern" : "festverankern"}
                      </button>
                    ) : (
                      <Tooltip title={`Pinning braucht OctoBoss-Admin-API — CR ${crPending ?? "ausstehend"}`} source="/api/v1/manifest/inventory">
                        <span className="text-xs text-fg-subtle">Pin erst nach CR</span>
                      </Tooltip>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PinDialog
        open={!!pinDialog}
        hubId={hubId}
        nodeId={pinDialog?.nodeId || ""}
        currentPin={pinDialog?.current ?? null}
        availableVersions={availableVersions}
        onClose={() => setPinDialog(null)}
      />
    </div>
  );
}

// ── Modul-Drift-Sektion ───────────────────────────────────────────────────────

function ModulesDriftSection({ modules }: { modules: ModulesInventory }) {
  if (modules.error) {
    return (
      <div className="rounded border border-status-error/30 bg-status-error/10 px-4 py-3 text-xs text-status-error">
        Module-Sicht nicht verfuegbar: {modules.error}
      </div>
    );
  }

  return (
    <div className="rounded border border-white/10 bg-bg-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-3">
          <Tooltip title="Pro Node installierte SonOfSETI-Module mit Versionen. Drift = Modul laeuft auf >= 2 Versionen im Cluster." source="/api/v1/manifest/inventory">
            <h3 className="text-sm font-semibold text-fg">Module / Plugins im Cluster</h3>
          </Tooltip>
        </div>
        <span className="text-xs text-fg-subtle">
          {modules.node_count} Nodes · {modules.module_count} Module
          {modules.drift.length > 0 && (
            <span className="ml-2 rounded bg-status-warn/10 px-2 py-0.5 text-status-warn">
              {modules.drift.length} Drift
            </span>
          )}
        </span>
      </div>

      {/* Drift-Box (wenn vorhanden) */}
      {modules.drift.length > 0 && (
        <div className="border-b border-white/5 px-4 py-3" data-testid="drift-list">
          <p className="mb-2 text-xs font-semibold text-status-warn">Versions-Drift im Cluster</p>
          <ul className="space-y-1.5">
            {modules.drift.map((d) => (
              <li key={d.module} className="text-xs text-fg-muted">
                <code className="font-mono text-fg">{d.module}</code> auf{" "}
                <span className="text-status-warn">{d.version_count} verschiedenen Versionen</span>:
                <ul className="ml-4 mt-0.5 list-disc">
                  {Object.entries(d.versions).map(([ver, nodes]) => (
                    <li key={ver}>
                      <code className="text-status-warn">{ver}</code> auf {nodes.length} Node{nodes.length !== 1 ? "s" : ""}{" "}
                      <span className="font-mono text-fg-subtle">({nodes.join(", ")})</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Module-by-Node-Liste */}
      <div className="divide-y divide-white/5">
        {modules.by_node.length === 0 ? (
          <p className="px-4 py-3 text-xs text-fg-subtle">Keine Nodes mit Modulen.</p>
        ) : (
          modules.by_node.map((node) => (
            <div key={node.node_id} className="px-4 py-2.5" data-testid={`modules-node-${node.node_id}`}>
              <div className="mb-1.5 flex items-center gap-2">
                <span className={node.connected ? "text-status-ok" : "text-fg-subtle"}>
                  {node.connected ? "●" : "○"}
                </span>
                <span className="font-mono text-xs text-fg">{node.hostname || node.node_id}</span>
                <span className="text-xs text-fg-subtle">({node.modules.length} Module)</span>
              </div>
              {node.modules.length === 0 ? (
                <p className="text-xs text-fg-subtle ml-5">Keine Module gemeldet.</p>
              ) : (
                <ul className="ml-5 flex flex-wrap gap-2">
                  {node.modules.map((m) => (
                    <li
                      key={`${node.node_id}:${m.name}`}
                      className="rounded border border-white/10 bg-bg-elevated px-2 py-0.5 text-xs"
                    >
                      <code className="text-fg">{m.name}</code>
                      <span className="ml-1.5 font-mono text-fg-subtle">v{m.version}</span>
                      <span
                        className={
                          m.status === "running"
                            ? "ml-1.5 text-status-ok"
                            : m.status === "stopped"
                            ? "ml-1.5 text-fg-subtle"
                            : "ml-1.5 text-status-warn"
                        }
                      >
                        ({m.status})
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Haupt-Sektion ─────────────────────────────────────────────────────────────

export function ClusterIntentSection({ inventory, hubId }: { inventory: HubInventory; hubId: string }) {
  const coreVersions = inventory.core.versions.map((v) => v.version);

  return (
    <div className="flex flex-col gap-4">
      {/* Core */}
      <VersionsPanel
        title="Core-Versionen"
        hubId={hubId}
        currentDefault={inventory.core.default}
        versions={inventory.core.versions}
        supportsAdmin={inventory.core.supports_versions_api}
        error={inventory.core.error}
      />

      <OverridesTable
        title="Core: Node-Pinning"
        hubId={hubId}
        overrides={inventory.core.overrides}
        availableVersions={coreVersions}
        liveNodes={inventory.modules.by_node}
        supportsAdmin={inventory.core.supports_versions_api}
      />

      {/* Bootstrapper (heute disabled bis CR durch) */}
      <VersionsPanel
        title="Bootstrapper-Versionen"
        hubId={hubId}
        currentDefault={inventory.bootstrapper.default}
        versions={inventory.bootstrapper.versions}
        supportsAdmin={inventory.bootstrapper.supports_versions_api}
        crPending={inventory.bootstrapper.cr_pending}
        error={inventory.bootstrapper.error}
      />

      <OverridesTable
        title="Bootstrapper: Node-Pinning"
        hubId={hubId}
        overrides={inventory.bootstrapper.overrides}
        availableVersions={inventory.bootstrapper.versions.map((v) => v.version)}
        liveNodes={inventory.modules.by_node}
        supportsAdmin={inventory.bootstrapper.supports_versions_api}
        crPending={inventory.bootstrapper.cr_pending}
      />

      {/* Module-Drift */}
      <ModulesDriftSection modules={inventory.modules} />
    </div>
  );
}

export default ClusterIntentSection;
