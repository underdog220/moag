// Settings-Tab — 5 Sektionen: Hubs, Cluster, Pipeline, Auth, Diagnose.
// Quelle: docs/gui-briefings/G_settings.md, docs/ARCHITEKTUR_GUI.md §6.
//
// Verhalten:
//  - Lade Settings via api.getSettings()
//  - Lokaler Form-State (draft); Save-Button erst aktiv wenn dirty
//  - POST /api/settings + /api/settings/hubs persistiert; Backend pusht
//    danach WS-Event "settings_changed" -> andere Tabs reloaden
//  - Reset-Button mit Confirm-Dialog setzt auf DEFAULT_SETTINGS

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "../../components/Card";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { PageBadge } from "../../components/PageBadge";
import { api, ApiError } from "../../lib/api";
import { BUILD_HASH, BUILD_TS } from "../../lib/env";
import { qk } from "../../lib/queryKeys";
import type { Settings, VotingStrategy, WsEvent } from "../../lib/types";
import { useWebSocket } from "../../lib/ws";
import { ConfirmDialog } from "./ConfirmDialog";
import { DEFAULT_SETTINGS, KNOWN_ENGINES } from "./defaults";
import { HubListEditor, isValidHubUrl } from "./HubListEditor";
import { Toggle } from "./Toggle";

const STRATEGIES: { value: VotingStrategy; label: string; hint: string }[] = [
  { value: "consensus", label: "consensus", hint: "Mehrheit der Engines stimmt ueberein" },
  { value: "best", label: "best", hint: "Beste Konfidenz pro Wort" },
  { value: "majority", label: "majority", hint: "Einfache Mehrheit ohne Quality-Score" },
];

/** Token-Validation: leer ODER >= 4 Zeichen. */
function isValidToken(token: string | null): boolean {
  if (token == null || token === "") return true;
  return token.trim().length >= 4;
}

/** Equality-Check fuer Dirty-State (struktureller JSON-Vergleich). */
function settingsEqual(a: Settings, b: Settings): boolean {
  // active_env + settings_path werden vom Backend gesetzt, nicht vom User editiert
  const stripA = { ...a, active_env: undefined, settings_path: undefined };
  const stripB = { ...b, active_env: undefined, settings_path: undefined };
  return JSON.stringify(stripA) === JSON.stringify(stripB);
}

export function SettingsTab() {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: qk.settings,
    queryFn: () => api.getSettings(),
    staleTime: 30_000,
  });

  const [draft, setDraft] = useState<Settings | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState<string | null>(null);

  // WS-Listener: Backend pusht "settings_changed" nach jedem POST /api/settings.
  // Wir invalidieren den Settings-Query (und Hubs/Nodes), damit andere Tabs
  // beim Re-Mount frische Daten holen — Akzeptanz-Kriterium 10.
  const onWsEvent = useCallback(
    (ev: WsEvent) => {
      if (ev.type !== "settings_changed") return;
      // Nur invalidieren wenn das Event NICHT von unserem eigenen Save kommt
      // (Save updated den lokalen draft schon direkt). Der Cache-Refresh sorgt
      // dafuer, dass Dashboard/Jobs/Charts beim naechsten Render aktuelle
      // Hub-/Voting-Settings bekommen.
      queryClient.invalidateQueries({ queryKey: qk.settings });
      queryClient.invalidateQueries({ queryKey: qk.cluster.hubs });
      queryClient.invalidateQueries({ queryKey: qk.cluster.nodes });
    },
    [queryClient]
  );
  useWebSocket({ onEvent: onWsEvent });

  // Initial draft befuellen wenn Daten da sind
  useEffect(() => {
    if (settingsQuery.data && !draft) {
      setDraft(settingsQuery.data);
    }
  }, [settingsQuery.data, draft]);

  const dirty = useMemo(() => {
    if (!draft || !settingsQuery.data) return false;
    return !settingsEqual(draft, settingsQuery.data);
  }, [draft, settingsQuery.data]);

  if (settingsQuery.isLoading) {
    return (
      <div className="p-6">
        <LoadingSpinner size="md" label="Settings laden ..." />
      </div>
    );
  }
  if (settingsQuery.isError || !draft) {
    const err = settingsQuery.error as ApiError | undefined;
    return (
      <div className="p-6">
        <Card title="Fehler beim Laden der Settings">
          <p className="text-sm text-status-error">
            {err?.message || "Unbekannter Fehler"}
          </p>
          <button
            type="button"
            onClick={() => settingsQuery.refetch()}
            className="mt-3 rounded bg-brand px-3 py-1.5 text-sm font-semibold text-white
                       hover:bg-brand-hover"
          >
            Erneut versuchen
          </button>
        </Card>
      </div>
    );
  }

  const tokenValid = isValidToken(draft.api_token);
  const hubsValid = draft.hubs.length > 0 && draft.hubs.every((h) => isValidHubUrl(h.url));
  const canSave = dirty && tokenValid && hubsValid && !saving;

  const update = (patch: Partial<Settings>) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
    setSaveOk(null);
  };

  const toggleEngine = (engine: string) => {
    const set = new Set(draft.voting_engines);
    if (set.has(engine)) set.delete(engine);
    else set.add(engine);
    update({ voting_engines: Array.from(set) });
  };

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setSaveError(null);
    setSaveOk(null);
    try {
      // Hubs separat persistieren wenn Liste/Reihenfolge sich geaendert hat
      const initial = settingsQuery.data!;
      const hubsChanged =
        JSON.stringify(initial.hubs) !== JSON.stringify(draft.hubs);
      if (hubsChanged) {
        await api.updateHubs(draft.hubs);
      }
      // Default-Hub explizit setzen wenn Wechsel
      if (initial.default_hub_id !== draft.default_hub_id) {
        await api.setDefaultHub(draft.default_hub_id);
      }
      // Restliche Felder via PATCH
      const patch: Partial<Settings> = {
        cluster_enabled: draft.cluster_enabled,
        voting_engines: draft.voting_engines,
        voting_strategy: draft.voting_strategy,
        fallback_to_local: draft.fallback_to_local,
        api_token: draft.api_token,
        pipeline_log_enabled: draft.pipeline_log_enabled,
        doctype_text_gewicht: draft.doctype_text_gewicht,
        doctype_layout_gewicht: draft.doctype_layout_gewicht,
      };
      const next = await api.updateSettings(patch);
      setDraft(next);
      setSaveOk("Gespeichert.");
      // React-Query Cache aktualisieren, damit andere Tabs frisches Settings sehen
      settingsQuery.refetch();
    } catch (e) {
      const err = e as Error;
      setSaveError(err.message || "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setResetOpen(false);
    setDraft({
      ...DEFAULT_SETTINGS,
      active_env: draft.active_env,
      settings_path: draft.settings_path,
    });
    setSaveOk(null);
  };

  const textWeight = draft.doctype_text_gewicht;
  const layoutWeight = Math.round((1 - textWeight) * 100) / 100;
  const setTextWeight = (v: number) => {
    const t = Math.max(0, Math.min(1, v));
    update({ doctype_text_gewicht: t, doctype_layout_gewicht: Math.round((1 - t) * 100) / 100 });
  };
  const tokenLen = (draft.api_token ?? "").length;

  return (
    <div className="space-y-4 p-4">
      {/* Header mit Save-Status */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-fg">Einstellungen</h1>
          <p className="text-xs text-fg-muted">
            Hubs, Cluster, Pipeline, Auth, Diagnose. Aenderungen wirken nach Speichern.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saveOk && <span className="text-xs text-status-ok">{saveOk}</span>}
          {saveError && (
            <span className="text-xs text-status-error" data-testid="save-error">
              {saveError}
            </span>
          )}
          <button
            type="button"
            disabled={!canSave}
            onClick={handleSave}
            data-testid="save-button"
            className={`rounded px-4 py-1.5 text-sm font-semibold transition
                        ${
                          canSave
                            ? "bg-brand text-white hover:bg-brand-hover"
                            : "cursor-not-allowed bg-bg-elevated text-fg-subtle"
                        }`}
          >
            {saving ? "Speichern ..." : dirty ? "Speichern" : "Gespeichert"}
          </button>
        </div>
      </div>

      {/* Sektion 1 — Hubs */}
      <Card
        title="1. Hubs"
        description="Liste aller bekannten OctoBoss-Hubs. Default-Hub wird fuer Cluster-Calls genutzt."
      >
        <HubListEditor
          hubs={draft.hubs}
          defaultHubId={draft.default_hub_id}
          onChangeHubs={(hubs) => {
            // Wenn Default-Hub geloescht wurde, ersten als neuen Default setzen
            const ids = hubs.map((h) => h.id);
            const def = ids.includes(draft.default_hub_id)
              ? draft.default_hub_id
              : (hubs[0]?.id ?? "");
            update({ hubs, default_hub_id: def });
          }}
          onChangeDefault={(id) => update({ default_hub_id: id })}
        />
        {!hubsValid && (
          <p className="mt-2 text-xs text-status-error">
            Mindestens eine URL ist ungueltig (muss http:// oder https:// sein).
          </p>
        )}
      </Card>

      {/* Sektion 2 — Cluster */}
      <Card
        title="2. Cluster"
        description="Multi-Engine-Voting + Fallback-Verhalten."
      >
        <div className="space-y-4">
          <Toggle
            checked={draft.cluster_enabled}
            onChange={(v) => update({ cluster_enabled: v })}
            label="Cluster aktiv"
            description="Wenn aus, laeuft alles lokal ohne Hub-Verteilung."
            testId="toggle-cluster-enabled"
          />

          <div>
            <h4 className="mb-2 text-sm font-semibold text-fg">Voting-Engines</h4>
            <div className="flex flex-wrap gap-2" role="group" aria-label="voting-engines">
              {KNOWN_ENGINES.map((engine) => {
                const active = draft.voting_engines.includes(engine);
                return (
                  <button
                    key={engine}
                    type="button"
                    role="checkbox"
                    aria-checked={active}
                    onClick={() => toggleEngine(engine)}
                    data-testid={`engine-${engine}`}
                    className={`rounded-full border px-3 py-1 text-xs transition
                                ${
                                  active
                                    ? "border-brand bg-brand/20 text-brand"
                                    : "border-white/10 bg-bg-elevated text-fg-muted hover:text-fg"
                                }`}
                  >
                    {engine}
                  </button>
                );
              })}
            </div>
            {draft.voting_engines.length === 0 && (
              <p className="mt-1 text-xs text-status-warn">
                Keine Engine ausgewaehlt — Cluster waehlt automatisch.
              </p>
            )}
          </div>

          <div>
            <h4 className="mb-2 text-sm font-semibold text-fg">Voting-Strategie</h4>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="voting-strategy">
              {STRATEGIES.map((s) => (
                <label
                  key={s.value}
                  className={`flex cursor-pointer items-center gap-2 rounded border px-3 py-1.5
                              ${
                                draft.voting_strategy === s.value
                                  ? "border-brand bg-brand/10"
                                  : "border-white/10 bg-bg-elevated"
                              }`}
                >
                  <input
                    type="radio"
                    name="voting-strategy"
                    value={s.value}
                    checked={draft.voting_strategy === s.value}
                    onChange={() => update({ voting_strategy: s.value })}
                    className="accent-brand"
                  />
                  <span className="text-sm">
                    <span className="font-mono">{s.label}</span>
                    <span className="ml-2 text-xs text-fg-muted">{s.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <Toggle
            checked={draft.fallback_to_local}
            onChange={(v) => update({ fallback_to_local: v })}
            label="Lokaler Fallback bei Hub-Ausfall"
            description="Wenn alle Hubs unerreichbar: lokale Pipeline statt Fehlschlag."
            testId="toggle-fallback-local"
          />
        </div>
      </Card>

      {/* Sektion 3 — Pipeline */}
      <Card
        title="3. Pipeline"
        description="Diagnose-Logging + Doctype-Klassifikator-Gewichte."
      >
        <div className="space-y-4">
          <Toggle
            checked={draft.pipeline_log_enabled}
            onChange={(v) => update({ pipeline_log_enabled: v })}
            label="Pipeline-Logging aktiv"
            description="Pflicht aus globaler CLAUDE.md fuer Diagnose; pro Schritt strukturiertes JSON."
            testId="toggle-pipeline-log"
          />

          <div>
            <h4 className="mb-2 text-sm font-semibold text-fg">
              Doctype-Gewichte (Two-Stage-Klassifikator)
            </h4>
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-3">
                <label htmlFor="text-weight" className="w-32 text-fg-muted">
                  Text-Gewicht
                </label>
                <input
                  id="text-weight"
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={textWeight}
                  onChange={(e) => setTextWeight(Number(e.target.value))}
                  data-testid="text-weight-slider"
                  className="flex-1 accent-brand"
                />
                <span className="w-12 text-right font-mono">{textWeight.toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-32 text-fg-muted">Layout-Gewicht</span>
                <span className="flex-1 text-fg-muted">(automatisch = 1 - Text)</span>
                <span className="w-12 text-right font-mono">{layoutWeight.toFixed(2)}</span>
              </div>
              <p className="text-fg-muted">
                Wirkt als ENV-Override auf{" "}
                <code className="font-mono">OCREXPERT_DOCTYPE_TEXT_GEWICHT</code> +{" "}
                <code className="font-mono">OCREXPERT_DOCTYPE_LAYOUT_GEWICHT</code>.
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Sektion 4 — Auth */}
      <Card
        title="4. Auth"
        description="API-Token fuer authentifizierte Hub-Endpoints."
      >
        <div className="space-y-2">
          <label className="block text-xs text-fg-muted">API-Token</label>
          <div className="flex items-center gap-2">
            <input
              type={showToken ? "text" : "password"}
              value={draft.api_token ?? ""}
              onChange={(e) => update({ api_token: e.target.value || null })}
              placeholder="optional, mind. 4 Zeichen"
              data-testid="api-token-input"
              className={`w-full max-w-md rounded border px-2 py-1 font-mono text-sm
                          ${tokenValid ? "border-white/10 bg-bg" : "border-status-error bg-bg"}`}
            />
            <button
              type="button"
              onClick={() => setShowToken((v) => !v)}
              data-testid="api-token-toggle"
              className="rounded border border-white/10 bg-bg-elevated px-2 py-1 text-xs hover:bg-bg-elevated/70"
            >
              {showToken ? "Verbergen" : "Anzeigen"}
            </button>
            <span className="text-xs text-fg-subtle">
              {tokenLen > 0 ? `${tokenLen} Zeichen` : "leer"}
            </span>
          </div>
          {!tokenValid && (
            <p className="text-xs text-status-error">
              Token muss mindestens 4 Zeichen haben (oder leer sein).
            </p>
          )}
          <p className="text-xs text-fg-muted">
            Wird an Hub mitgeschickt fuer authentifizierte Endpoints (X-SonOfSETI-Token).
          </p>
        </div>
      </Card>

      {/* Sektion 5 — Diagnose */}
      <Card
        title="5. Diagnose"
        description="Aktive ENV, Settings-Pfad, Build-Info."
      >
        <div className="space-y-3 text-xs">
          <div>
            <h4 className="mb-1 font-semibold text-fg">Aktive Environment-Variablen</h4>
            {draft.active_env && Object.keys(draft.active_env).length > 0 ? (
              <table className="w-full font-mono">
                <tbody>
                  {Object.entries(draft.active_env).map(([k, v]) => (
                    <tr key={k} className="border-t border-white/5">
                      <td className="py-1 pr-2 text-fg-muted">{k}</td>
                      <td className="py-1 text-fg">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-fg-muted">Keine relevanten ENV-Werte gesetzt.</p>
            )}
          </div>

          <div>
            <h4 className="mb-1 font-semibold text-fg">Pfade + Build</h4>
            <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 font-mono">
              <dt className="text-fg-muted">Settings-Datei:</dt>
              <dd className="break-all text-fg">
                {draft.settings_path ?? "(unbekannt)"}
              </dd>
              <dt className="text-fg-muted">Build-Hash:</dt>
              <dd className="text-fg">{BUILD_HASH}</dd>
              <dt className="text-fg-muted">Build-Time:</dt>
              <dd className="text-fg">{BUILD_TS}</dd>
            </dl>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={() => setResetOpen(true)}
              data-testid="reset-button"
              className="rounded border border-status-error/40 bg-status-error/10 px-3 py-1.5
                         text-xs font-semibold text-status-error hover:bg-status-error/20"
            >
              Reset auf Defaults
            </button>
          </div>
        </div>
      </Card>

      <ConfirmDialog
        open={resetOpen}
        title="Auf Defaults zuruecksetzen?"
        message="Setzt alle Hubs auf VDR/NAS/Test zurueck und stellt Cluster/Pipeline/Auth auf Werkseinstellungen. Erst nach 'Speichern' wirksam."
        confirmLabel="Zuruecksetzen"
        destructive
        onConfirm={handleReset}
        onCancel={() => setResetOpen(false)}
      />

      <PageBadge id="gui.settings" />
    </div>
  );
}

export default SettingsTab;
