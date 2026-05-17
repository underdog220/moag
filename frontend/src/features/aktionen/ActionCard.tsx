// ActionCard — Karte für eine einzelne ausführbare Aktion.
// DRY-Komponente: wird sowohl auf /aktionen als auch im jeweiligen Drilldown wiederverwendet.
// Props: {action, onResult?} — exportierbar für Phase-2-Drilldown-Integration.

import { useState } from "react";
import type { Action, ActionTriggerResponse } from "../../lib/types";
import { api } from "../../lib/api";
import { Tooltip } from "../../components/Tooltip";
import { ConfirmDialog } from "../../components/ConfirmDialog";

// Kategorie → Badge-Farbe
const CATEGORY_COLOR: Record<Action["category"], string> = {
  diagnose:  "bg-brand/15 text-brand border-brand/30",
  config:    "bg-fg-subtle/15 text-fg-muted border-fg-subtle/30",
  operation: "bg-status-warn/15 text-status-warn border-status-warn/30",
};

// Kategorie → Lesbares Label
const CATEGORY_LABEL: Record<Action["category"], string> = {
  diagnose:  "Diagnose",
  config:    "Konfiguration",
  operation: "Operation",
};

export interface ActionCardProps {
  action: Action;
  /** Optionaler Callback nach erfolgreichem Trigger — für Drilldown-Integration */
  onResult?: (result: ActionTriggerResponse) => void;
}

export function ActionCard({ action, onResult }: ActionCardProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ActionTriggerResponse | null>(null);
  const [triggerError, setTriggerError] = useState<string | null>(null);

  const isDisabled = !action.implemented || running;

  async function doTrigger() {
    setRunning(true);
    setResult(null);
    setTriggerError(null);
    try {
      const res = await api.triggerAction(action.action_id);
      setResult(res);
      onResult?.(res);
    } catch (err) {
      setTriggerError((err as Error).message ?? "Unbekannter Fehler");
    } finally {
      setRunning(false);
    }
  }

  function handleButtonClick() {
    if (action.requires_confirm) {
      setConfirmOpen(true);
    } else {
      void doTrigger();
    }
  }

  function handleConfirm() {
    setConfirmOpen(false);
    void doTrigger();
  }

  // Dauer-Hint für Tooltip
  const durationHint = action.estimated_duration_s != null
    ? `Geschätzte Dauer: ~${action.estimated_duration_s}s`
    : null;

  return (
    <>
      <div
        data-testid={`action-card-${action.action_id}`}
        className={`flex flex-col rounded-lg border p-4 transition-colors ${
          action.is_destructive
            ? "border-status-error/30 bg-status-error/5"
            : "border-white/10 bg-bg-panel"
        } ${!action.implemented ? "opacity-60" : ""}`}
      >
        {/* Header: Name + destruktiv-Icon */}
        <div className="mb-2 flex items-start gap-2">
          {action.is_destructive && (
            <span
              className="mt-0.5 shrink-0 text-base text-status-error"
              aria-label="Destruktive Aktion"
              title="Destruktiv — nicht rückgängig zu machen"
            >
              ⚠
            </span>
          )}
          <h3
            className={`text-sm font-semibold leading-tight ${
              action.is_destructive ? "text-status-error" : "text-fg"
            }`}
          >
            {action.name}
          </h3>
        </div>

        {/* Beschreibung */}
        <p className="mb-3 text-xs text-fg-muted leading-relaxed">
          {action.description}
        </p>

        {/* Badges: Kategorie + Sub-Area */}
        <div className="mb-3 flex flex-wrap gap-1.5">
          <span
            className={`inline-block rounded border px-1.5 py-0.5 text-xxs font-medium ${
              CATEGORY_COLOR[action.category]
            }`}
          >
            {CATEGORY_LABEL[action.category]}
          </span>
          {action.sub_area && (
            <span
              className="inline-block rounded border border-white/10 bg-bg-elevated
                         px-1.5 py-0.5 text-xxs text-fg-muted"
            >
              {action.sub_area}
            </span>
          )}
          {action.estimated_duration_s != null && (
            <span
              className="inline-block rounded border border-white/5 bg-bg-elevated
                         px-1.5 py-0.5 text-xxs text-fg-subtle"
            >
              ~{action.estimated_duration_s}s
            </span>
          )}
        </div>

        {/* Nicht-implementiert-Hinweis */}
        {!action.implemented && (
          <p className="mb-3 rounded border border-white/5 bg-bg-elevated px-2 py-1
                        text-xs italic text-fg-subtle">
            Phase X — noch nicht implementiert
          </p>
        )}

        {/* Ergebnis-Anzeige nach Trigger */}
        {result && (
          <div
            data-testid={`action-result-${action.action_id}`}
            className={`mb-3 rounded border px-3 py-2 text-xs ${
              result.status === "failed"
                ? "border-status-error/30 bg-status-error/10 text-status-error"
                : result.status === "not_implemented"
                  ? "border-white/10 bg-bg-elevated text-fg-muted"
                  : "border-status-ok/30 bg-status-ok/10 text-status-ok"
            }`}
          >
            <div className="flex items-center gap-1 font-medium">
              <span>
                {result.status === "failed"
                  ? "Fehler"
                  : result.status === "not_implemented"
                    ? "Nicht implementiert"
                    : result.status === "completed"
                      ? "Abgeschlossen"
                      : "Gestartet"}
              </span>
              {result.duration_ms != null && (
                <span className="text-fg-subtle">
                  ({result.duration_ms}ms)
                </span>
              )}
            </div>
            {result.result_summary && (
              <p className="mt-1 text-fg-muted">{result.result_summary}</p>
            )}
            {result.error && (
              <p className="mt-1 text-status-error">{result.error}</p>
            )}
          </div>
        )}

        {/* Netzwerk-Fehler (nicht action.error) */}
        {triggerError && !result && (
          <div
            data-testid={`action-error-${action.action_id}`}
            className="mb-3 rounded border border-status-error/30 bg-status-error/10
                       px-3 py-2 text-xs text-status-error"
          >
            {triggerError}
          </div>
        )}

        {/* Start-Button mit Tooltip (ADR-004 Pflicht) */}
        <div className="mt-auto">
          <Tooltip
            title={
              !action.implemented
                ? "Aktion noch nicht implementiert (Phase X)"
                : action.is_destructive
                  ? "Destruktive Aktion — Bestätigung erforderlich"
                  : action.requires_confirm
                    ? "Aktion erfordert Bestätigung"
                    : `${action.name} jetzt ausführen`
            }
            source={`POST /api/v1/actions/${action.action_id}/trigger`}
            updatedAt={durationHint ?? undefined}
            thresholds={
              action.is_destructive
                ? "Achtung: Diese Aktion kann nicht rückgängig gemacht werden"
                : undefined
            }
            position="top"
          >
            <button
              type="button"
              data-testid={`action-btn-${action.action_id}`}
              disabled={isDisabled}
              onClick={handleButtonClick}
              aria-busy={running}
              className={`w-full rounded-lg px-4 py-2 text-sm font-medium transition-colors
                          focus:outline-none focus:ring-2 ${
                            isDisabled
                              ? "cursor-not-allowed bg-bg-elevated text-fg-subtle"
                              : action.is_destructive
                                ? "bg-status-error text-white hover:bg-status-error/80 focus:ring-status-error/60"
                                : "bg-brand text-white hover:bg-brand/80 focus:ring-brand/60"
                          }`}
            >
              {running ? (
                <span className="inline-flex items-center gap-1.5 justify-center">
                  <span
                    className="h-3 w-3 animate-spin rounded-full border-2
                               border-white/30 border-t-white"
                    aria-hidden="true"
                  />
                  Läuft…
                </span>
              ) : (
                "Start"
              )}
            </button>
          </Tooltip>
        </div>
      </div>

      {/* ConfirmDialog — nur wenn requires_confirm */}
      <ConfirmDialog
        open={confirmOpen}
        title={action.is_destructive ? `Achtung: ${action.name}` : action.name}
        message={
          <>
            <p>{action.description}</p>
            {action.is_destructive && (
              <p className="mt-2 font-medium text-status-error">
                Diese Aktion ist destruktiv und kann nicht rückgängig gemacht werden.
              </p>
            )}
          </>
        }
        danger={action.is_destructive}
        confirmLabel="Jetzt ausführen"
        cancelLabel="Abbrechen"
        onConfirm={handleConfirm}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}

export default ActionCard;
