// AlertCenter — zentrale Ansicht aller aktiven Alerts (critical + warning).
// Datenquelle: /api/v1/alerts (Polling 15s). Alerts sind quittierbar (Acknowledge),
// Quittierung wird serverseitig persistiert und erlischt, wenn sich der Alert-Zustand
// aendert (anderer Key). Erreichbar ueber den Alert-Counter in der TopBar.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { qk } from "../../lib/queryKeys";
import { PageBadge } from "../../components/PageBadge";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import type { Alert, AlertSeverity } from "../../lib/types";

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const sec = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (sec < 60) return `vor ${sec}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `vor ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `vor ${h} h`;
  return `vor ${Math.round(h / 24)} d`;
}

const SEV: Record<
  AlertSeverity,
  { label: string; dot: string; text: string; border: string; bg: string }
> = {
  critical: {
    label: "Kritisch",
    dot: "bg-status-error",
    text: "text-status-error",
    border: "border-status-error/30",
    bg: "bg-status-error/10",
  },
  warning: {
    label: "Warnung",
    dot: "bg-status-warn",
    text: "text-status-warn",
    border: "border-status-warn/30",
    bg: "bg-status-warn/10",
  },
};

function AlertCard({
  alert,
  onAck,
  onUnack,
  busy,
}: {
  alert: Alert;
  onAck: (key: string) => void;
  onUnack: (key: string) => void;
  busy: boolean;
}) {
  const sev = SEV[alert.severity];
  return (
    <li
      className={`rounded border ${sev.border} ${alert.acknowledged ? "bg-bg-panel opacity-70" : sev.bg} p-3`}
      data-testid={`alert-${alert.system_id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-2 w-2 shrink-0 rounded-full ${sev.dot}`}
              aria-hidden="true"
            />
            <span
              className={`text-xxs font-semibold uppercase ${sev.text}`}
              title={`Severity: ${sev.label}. Quelle: /api/v1/alerts (severity-Feld). critical = System nicht erreichbar (ok=false), warning = erreichbar aber Score < 50.`}
            >
              {sev.label}
            </span>
            <Link
              to={`/${alert.system_id}`}
              className="truncate font-semibold text-fg hover:text-brand"
              title={`Zum ${alert.system_name}-Drilldown`}
            >
              {alert.system_name}
            </Link>
            <span className="text-xxs text-fg-subtle">· {alert.group}</span>
          </div>

          <p className="mt-1 text-sm text-fg-muted">{alert.summary}</p>

          {alert.error && (
            <p
              className="mt-1 break-words font-mono text-xxs text-fg-subtle"
              title="Fehlertext aus dem Adapter (error-Feld)"
            >
              {alert.error}
            </p>
          )}

          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xxs text-fg-subtle">
            <span title="Health-Score des Systems (0..100). Quelle: /api/v1/alerts.score">
              Score{" "}
              <span className={`font-semibold tabular-nums ${sev.text}`}>{alert.score}</span>
            </span>
            <span title={`Letzter Adapter-Abruf: ${alert.fetched_at}`}>
              {relativeTime(alert.fetched_at)}
            </span>
            {alert.acknowledged && alert.acknowledged_at && (
              <span
                className="text-fg-muted"
                title={`Quittiert am ${alert.acknowledged_at}. Quelle: /api/v1/alerts.acknowledged_at`}
              >
                ✓ quittiert {relativeTime(alert.acknowledged_at)}
              </span>
            )}
          </div>
        </div>

        <div className="shrink-0">
          {alert.acknowledged ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onUnack(alert.key)}
              className="rounded border border-white/10 bg-bg-panel px-2 py-1 text-xxs text-fg-muted
                         hover:bg-bg-subtle hover:border-white/20 disabled:opacity-50"
              title="Quittierung aufheben — Alert wieder als offen markieren (POST /api/v1/alerts/{key}/unack)"
            >
              Wieder öffnen
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => onAck(alert.key)}
              className="rounded border border-white/10 bg-bg-panel px-2 py-1 text-xxs text-fg
                         hover:bg-bg-subtle hover:border-white/20 disabled:opacity-50"
              title="Als gesehen markieren — quittiert den Alert (POST /api/v1/alerts/{key}/ack). Persistiert bis der Zustand sich ändert."
            >
              Quittieren
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

export function AlertCenter() {
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: qk.alerts,
    queryFn: () => api.getAlerts(),
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    retry: 1,
  });

  const ackMut = useMutation({
    mutationFn: (key: string) => api.ackAlert(key),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.alerts }),
  });
  const unackMut = useMutation({
    mutationFn: (key: string) => api.unackAlert(key),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.alerts }),
  });
  const busy = ackMut.isPending || unackMut.isPending;

  const alerts = data?.alerts ?? [];
  const critical = alerts.filter((a) => a.severity === "critical");
  const warning = alerts.filter((a) => a.severity === "warning");

  return (
    <div className="min-h-full p-4 pb-12" data-testid="alert-center">
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-fg">Alert-Center</h1>
        <p className="mt-1 text-base text-fg-muted">
          Aktive Probleme aller Sub-Systeme. Quelle:{" "}
          <span className="font-mono text-sm">/api/v1/alerts</span> · aktualisiert alle 15s.
        </p>
        {data && (
          <div className="mt-2 flex flex-wrap gap-3 text-sm" data-testid="alert-summary">
            <span
              className="text-status-error"
              title="Anzahl kritischer Alerts (System nicht erreichbar, ok=false)"
            >
              {data.critical_count} kritisch
            </span>
            <span
              className="text-status-warn"
              title="Anzahl Warnungen (erreichbar, aber Score < 50)"
            >
              {data.warning_count} Warnungen
            </span>
            <span className="text-fg-subtle" title="Davon bereits quittiert">
              {data.acknowledged_count} quittiert
            </span>
          </div>
        )}
      </header>

      {isLoading && alerts.length === 0 && <LoadingSpinner label="Lade Alerts..." />}

      {error && alerts.length === 0 && (
        <div className="rounded border border-status-error/30 bg-status-error/10 p-4 text-sm text-status-error">
          Fehler beim Laden der Alerts: {(error as Error).message}
        </div>
      )}

      {!isLoading && !error && alerts.length === 0 && (
        <div
          className="rounded border border-status-ok/30 bg-status-ok/10 p-6 text-center"
          data-testid="alert-empty"
        >
          <p className="text-base font-semibold text-status-ok">Alles grün</p>
          <p className="mt-1 text-sm text-fg-muted">
            Keine aktiven Alerts — alle Sub-Systeme erreichbar und gesund.
          </p>
        </div>
      )}

      {critical.length > 0 && (
        <section className="mb-8" data-testid="alert-group-critical">
          <h2 className="mb-3 text-base font-semibold uppercase tracking-wide text-status-error">
            Kritisch ({critical.length})
          </h2>
          <ul className="space-y-2">
            {critical.map((a) => (
              <AlertCard
                key={a.key}
                alert={a}
                onAck={ackMut.mutate}
                onUnack={unackMut.mutate}
                busy={busy}
              />
            ))}
          </ul>
        </section>
      )}

      {warning.length > 0 && (
        <section className="mb-8" data-testid="alert-group-warning">
          <h2 className="mb-3 text-base font-semibold uppercase tracking-wide text-status-warn">
            Warnungen ({warning.length})
          </h2>
          <ul className="space-y-2">
            {warning.map((a) => (
              <AlertCard
                key={a.key}
                alert={a}
                onAck={ackMut.mutate}
                onUnack={unackMut.mutate}
                busy={busy}
              />
            ))}
          </ul>
        </section>
      )}

      <PageBadge id="alerts" />
    </div>
  );
}

export default AlertCenter;
