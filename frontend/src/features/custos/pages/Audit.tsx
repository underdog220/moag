// Custos Audit-Seite — welche Regeln wann liefen, mit Dauer

import { useQuery } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import { qk } from "../../../lib/queryKeys";
import { PageBadge } from "../../../components/PageBadge";
import { LoadingSpinner } from "../../../components/LoadingSpinner";
import { EmptyState } from "../../../components/EmptyState";
import { Tooltip } from "../../../components/Tooltip";
import type { CustosAuditEintrag } from "../../../lib/types";

function AuditRow({ eintrag }: { eintrag: CustosAuditEintrag }) {
  const letzterLauf = eintrag.letzter_lauf
    ? new Date(eintrag.letzter_lauf).toLocaleString("de-DE")
    : "—";

  return (
    <div className="flex items-center gap-4 rounded border border-white/5 bg-bg-panel px-4 py-3">
      <Tooltip
        title={eintrag.aktiv ? "Regel ist aktiv" : "Regel deaktiviert"}
        source="/api/v1/custos/audit"
      >
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${
            eintrag.aktiv ? "bg-status-ok" : "bg-fg-subtle"
          }`}
        />
      </Tooltip>

      <Tooltip
        title="Regel-ID aus Custos"
        source="/api/v1/custos/audit"
      >
        <span className="w-36 shrink-0 truncate text-xs font-mono text-fg-muted">
          {eintrag.regel_id}
        </span>
      </Tooltip>

      <Tooltip
        title="Zeitpunkt des letzten Engine-Laufs fuer diese Regel"
        source="/api/v1/custos/audit"
        updatedAt={eintrag.letzter_lauf ? `Letzter Lauf: ${letzterLauf}` : undefined}
      >
        <span className="flex-1 text-sm text-fg">
          {letzterLauf}
        </span>
      </Tooltip>

      <Tooltip
        title="Konfiguriertes Laufintervall in Minuten"
        source="/api/v1/custos/audit"
      >
        <span className="text-xs text-fg-subtle">
          alle {eintrag.laufintervall_minuten} min
        </span>
      </Tooltip>
    </div>
  );
}

export function AuditPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: qk.custos.audit,
    queryFn: () => api.custos.getAudit({ limit: 100 }),
    refetchInterval: 30_000,
  });

  const eintraege: CustosAuditEintrag[] = Array.isArray(data?.regeln) ? data.regeln : [];
  const countAktiv: number = data?.count_aktiv ?? 0;
  const countGesamt: number = data?.count_gesamt ?? 0;

  return (
    <div className="flex flex-col gap-4 p-4" data-testid="custos-audit">
      {/* Kopfzeile */}
      {!isLoading && !error && (
        <div className="flex gap-4 text-xs text-fg-muted">
          <Tooltip
            title="Anzahl aktiver Compliance-Regeln"
            source="/api/v1/custos/audit"
          >
            <span>Aktiv: <strong className="text-fg">{countAktiv}</strong></span>
          </Tooltip>
          <Tooltip
            title="Gesamtanzahl registrierter Regeln"
            source="/api/v1/custos/audit"
          >
            <span>Gesamt: <strong className="text-fg">{countGesamt}</strong></span>
          </Tooltip>
        </div>
      )}

      {isLoading && <LoadingSpinner label="Lade Audit-Daten..." />}
      {error && (
        <div className="text-sm text-status-error">
          Fehler: {(error as Error).message}
        </div>
      )}
      {!isLoading && !error && eintraege.length === 0 && (
        <EmptyState
          title="Keine Audit-Daten"
          description="Noch keine Engine-Läufe aufgezeichnet."
        />
      )}
      {!isLoading && eintraege.length > 0 && (
        <div className="space-y-2">
          {eintraege.map((e) => (
            <AuditRow key={e.regel_id} eintrag={e} />
          ))}
        </div>
      )}

      <PageBadge id="custos.audit" />
    </div>
  );
}

export default AuditPage;
