// Hub-Liste-Editor: Tabelle mit Add/Delete, Default-Radio, Test-Reachability.
// Speichert via api.updateHubs() + api.setDefaultHub() (Subagent A).

import { useState } from "react";
import { api } from "../../lib/api";
import type { HubConfig } from "../../lib/types";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { StatusDot } from "../../components/StatusDot";

export interface HubListEditorProps {
  hubs: HubConfig[];
  defaultHubId: string;
  onChangeHubs: (next: HubConfig[]) => void;
  onChangeDefault: (id: string) => void;
}

interface TestState {
  status: "idle" | "running" | "ok" | "error";
  latencyMs?: number;
  error?: string;
}

const URL_RE = /^https?:\/\/.+/i;

/** Pruefung Hub-URL: muss mit http:// oder https:// beginnen. */
export function isValidHubUrl(url: string): boolean {
  return URL_RE.test(url.trim());
}

/** Erreichbarkeits-Test ueber Backend-Proxy POST /api/cluster/hubs/test —
 *  umgeht Browser-CORS, da der Server den /health-Probe ausfuehrt. */
async function probeHub(url: string, token?: string | null): Promise<TestState> {
  try {
    const res = await api.testHub({ url, token: token ?? undefined });
    if (res.ok) {
      return { status: "ok", latencyMs: res.latency_ms ?? undefined };
    }
    return { status: "error", error: res.error ?? "Hub nicht erreichbar" };
  } catch (e) {
    const err = e as Error;
    return { status: "error", error: err.message || "Backend-Proxy fehlgeschlagen" };
  }
}

export function HubListEditor({
  hubs,
  defaultHubId,
  onChangeHubs,
  onChangeDefault,
}: HubListEditorProps) {
  const [tests, setTests] = useState<Record<string, TestState>>({});
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<HubConfig>({ id: "", name: "", url: "" });
  const [draftError, setDraftError] = useState<string | null>(null);

  const runTest = async (hub: HubConfig) => {
    setTests((t) => ({ ...t, [hub.id]: { status: "running" } }));
    const result = await probeHub(hub.url, hub.token);
    setTests((t) => ({ ...t, [hub.id]: result }));
  };

  const removeHub = (id: string) => {
    if (hubs.length <= 1) return; // Mindestens ein Hub bleibt erhalten
    onChangeHubs(hubs.filter((h) => h.id !== id));
  };

  const submitNewHub = () => {
    setDraftError(null);
    const id = draft.id.trim();
    const name = draft.name.trim();
    const url = draft.url.trim();
    if (!id || !name || !url) {
      setDraftError("ID, Name und URL sind Pflichtfelder.");
      return;
    }
    if (!isValidHubUrl(url)) {
      setDraftError("URL muss mit http:// oder https:// beginnen.");
      return;
    }
    if (hubs.some((h) => h.id === id)) {
      setDraftError(`ID '${id}' existiert bereits.`);
      return;
    }
    onChangeHubs([...hubs, { id, name, url }]);
    setDraft({ id: "", name: "", url: "" });
    setAdding(false);
  };

  const cancelAdd = () => {
    setAdding(false);
    setDraft({ id: "", name: "", url: "" });
    setDraftError(null);
  };

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded border border-white/5">
        <table className="w-full text-sm" data-testid="hub-table">
          <thead className="bg-bg-elevated/60 text-xs uppercase tracking-wide text-fg-muted">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Default</th>
              <th className="px-3 py-2 text-left font-semibold">ID</th>
              <th className="px-3 py-2 text-left font-semibold">Name</th>
              <th className="px-3 py-2 text-left font-semibold">URL</th>
              <th className="px-3 py-2 text-left font-semibold">Test</th>
              <th className="px-3 py-2 text-right font-semibold"></th>
            </tr>
          </thead>
          <tbody>
            {hubs.map((hub) => {
              const test = tests[hub.id] ?? { status: "idle" };
              const isDefault = hub.id === defaultHubId;
              return (
                <tr
                  key={hub.id}
                  data-testid={`hub-row-${hub.id}`}
                  className="border-t border-white/5 hover:bg-bg-elevated/30"
                >
                  <td className="px-3 py-2">
                    <input
                      type="radio"
                      name="defaultHub"
                      checked={isDefault}
                      onChange={() => onChangeDefault(hub.id)}
                      aria-label={`Hub ${hub.id} als Default`}
                      className="accent-brand"
                    />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{hub.id}</td>
                  <td className="px-3 py-2">{hub.name}</td>
                  <td className="px-3 py-2 font-mono text-xs text-fg-muted">{hub.url}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => runTest(hub)}
                        disabled={test.status === "running"}
                        className="rounded border border-white/10 bg-bg-elevated px-2 py-1 text-xs
                                   hover:bg-bg-elevated/70 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {test.status === "running" ? (
                          <LoadingSpinner size="sm" inline label="..." />
                        ) : (
                          "Test"
                        )}
                      </button>
                      {test.status === "ok" && (
                        <span className="flex items-center gap-1 text-xs text-status-ok">
                          <StatusDot status="ok" size="sm" />
                          {test.latencyMs} ms
                        </span>
                      )}
                      {test.status === "error" && (
                        <span
                          className="flex items-center gap-1 text-xs text-status-error"
                          title={test.error}
                        >
                          <StatusDot status="error" size="sm" />
                          {test.error}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => removeHub(hub.id)}
                      disabled={hubs.length <= 1}
                      title={
                        hubs.length <= 1
                          ? "Mindestens ein Hub muss konfiguriert bleiben"
                          : "Hub entfernen"
                      }
                      aria-label={`Hub ${hub.id} entfernen`}
                      className="rounded border border-white/10 px-2 py-1 text-xs text-status-error
                                 hover:bg-status-error/10 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      Entfernen
                    </button>
                  </td>
                </tr>
              );
            })}
            {hubs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-xs text-fg-muted">
                  Keine Hubs konfiguriert.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!adding && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded border border-white/10 bg-bg-elevated px-3 py-1.5 text-sm
                     text-fg hover:bg-bg-elevated/70"
        >
          + Hub hinzufuegen
        </button>
      )}

      {adding && (
        <div
          data-testid="hub-add-form"
          className="space-y-2 rounded-md border border-white/10 bg-bg-elevated/40 p-3"
        >
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <label className="text-xs">
              <span className="block text-fg-muted">ID</span>
              <input
                type="text"
                value={draft.id}
                onChange={(e) => setDraft({ ...draft, id: e.target.value })}
                placeholder="z.B. lab"
                className="w-full rounded border border-white/10 bg-bg px-2 py-1 font-mono"
              />
            </label>
            <label className="text-xs">
              <span className="block text-fg-muted">Name</span>
              <input
                type="text"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="z.B. Lab-Hub"
                className="w-full rounded border border-white/10 bg-bg px-2 py-1"
              />
            </label>
            <label className="text-xs">
              <span className="block text-fg-muted">URL</span>
              <input
                type="text"
                value={draft.url}
                onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                placeholder="http://192.168.x.x:8765"
                className="w-full rounded border border-white/10 bg-bg px-2 py-1 font-mono"
              />
            </label>
          </div>
          {draftError && (
            <p
              data-testid="hub-add-error"
              role="alert"
              className="text-xs text-status-error"
            >
              {draftError}
            </p>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={submitNewHub}
              className="rounded bg-brand px-3 py-1 text-xs font-semibold text-white hover:bg-brand-hover"
            >
              Hub anlegen
            </button>
            <button
              type="button"
              onClick={cancelAdd}
              className="rounded border border-white/10 px-3 py-1 text-xs text-fg-muted hover:text-fg"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default HubListEditor;
