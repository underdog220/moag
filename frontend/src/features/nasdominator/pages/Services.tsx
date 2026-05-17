// NasDominator — Services-Seite (Critical-Services-Tabelle).
// Quelle: GET /api/v1/nasdominator/services
// Aktion: nasdominator.services.refresh

import { useQuery } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import { PageBadge } from "../../../components/PageBadge";
import { Tooltip } from "../../../components/Tooltip";
import { StatusDot, type StatusKind } from "../../../components/StatusDot";
import { LoadingSpinner } from "../../../components/LoadingSpinner";
import { EmptyState } from "../../../components/EmptyState";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import type { NasDomService } from "../../../lib/types";
import { useState } from "react";

const QUERY_KEY = ["nasdominator", "services"];

function serviceStatusKind(status: string): StatusKind {
  return ["up", "running", "ok", "healthy"].includes(status.toLowerCase()) ? "ok" : "error";
}

function ServiceRow({ svc }: { svc: NasDomService }) {
  const kind = serviceStatusKind(svc.status);
  return (
    <tr className="border-t border-white/5 hover:bg-bg-subtle/30 transition-colors">
      <td className="py-2 px-3 text-sm text-fg font-medium">{svc.name}</td>
      <td className="py-2 px-3">
        <Tooltip
          title={`Service-Status: ${svc.status}`}
          source="/api/v1/nasdominator/services"
          thresholds="up/running/ok/healthy = gruen · alles andere = rot"
        >
          <span className="flex items-center gap-1.5">
            <StatusDot status={kind} />
            <span className={`text-xs ${kind === "ok" ? "text-status-ok" : "text-status-error"}`}>
              {svc.status}
            </span>
          </span>
        </Tooltip>
      </td>
    </tr>
  );
}

export function ServicesPage() {
  const [refreshPending, setRefreshPending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => api.nasdominator.getServices(),
    refetchInterval: 30_000,
    retry: 1,
  });

  const handleRefreshConfirm = async () => {
    setConfirmOpen(false);
    setRefreshPending(true);
    try {
      await api.triggerAction("nasdominator.services.refresh");
      await refetch();
    } finally {
      setRefreshPending(false);
    }
  };

  const services = data?.services ?? [];
  const authRequired = data?.auth_required ?? false;

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <Tooltip
          title="Kritische Services die NasDominator ueberwacht (Oberon, OctoBoss, Postgres, ...)"
          source="/api/v1/nasdominator/services"
        >
          <h2 className="text-base font-semibold text-fg">Critical Services</h2>
        </Tooltip>

        <Tooltip
          title="Service-Status-Refresh triggern — NasDominator fragt alle Services sofort neu ab"
          source="/api/v1/actions/nasdominator.services.refresh/trigger"
          thresholds="Dauert ca. 5s"
        >
          <button
            onClick={() => setConfirmOpen(true)}
            disabled={refreshPending || authRequired}
            className="rounded border border-white/10 bg-bg-panel px-3 py-1.5 text-xs
                       text-fg hover:bg-bg-subtle disabled:opacity-40 disabled:cursor-not-allowed
                       transition-colors"
          >
            {refreshPending ? "Wird aktualisiert..." : "Status aktualisieren"}
          </button>
        </Tooltip>
      </div>

      {authRequired && (
        <div className="rounded border border-status-warn/30 bg-status-warn/10 px-3 py-2 text-sm text-status-warn">
          NasDominator erfordert Anmeldung. Keine Credentials in MOAG-Settings konfiguriert.
          Service-Daten nicht verfuegbar.
        </div>
      )}

      {isLoading && <LoadingSpinner />}

      {!isLoading && error && (
        <EmptyState
          icon="!"
          title="Fehler beim Laden"
          description={String(error)}
        />
      )}

      {!isLoading && !error && services.length === 0 && !authRequired && (
        <EmptyState
          icon="~"
          title="Keine Services"
          description="NasDominator liefert keine ueberwachten Services."
        />
      )}

      {!isLoading && services.length > 0 && (
        <div className="overflow-hidden rounded border border-white/10 bg-bg-panel">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10 bg-bg-subtle">
                <th className="py-2 px-3 text-left text-xs font-medium text-fg-muted uppercase tracking-wider">
                  Service
                </th>
                <th className="py-2 px-3 text-left text-xs font-medium text-fg-muted uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {services.map((svc, i) => (
                <ServiceRow key={svc.name ?? i} svc={svc} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data?.fetched_at && (
        <p className="text-xxs text-fg-subtle text-right">
          Letzte Abfrage: {new Date(data.fetched_at).toLocaleTimeString("de-DE")}
        </p>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Service-Status aktualisieren?"
        message="NasDominator fragt alle ueberwachten Services sofort neu ab (~5s)."
        onConfirm={handleRefreshConfirm}
        onCancel={() => setConfirmOpen(false)}
      />

      <PageBadge id="nasdominator.services" />
    </div>
  );
}

export default ServicesPage;
