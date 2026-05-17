// Custos Findings-Seite — Compliance-Findings mit Severity-Filter + Drill

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import { qk } from "../../../lib/queryKeys";
import { PageBadge } from "../../../components/PageBadge";
import { LoadingSpinner } from "../../../components/LoadingSpinner";
import { EmptyState } from "../../../components/EmptyState";
import { Tooltip } from "../../../components/Tooltip";
import type { CustosFinding } from "../../../lib/types";

type Severity = "ALL" | "CRIT" | "WARN" | "INFO";
type Status = "ALL" | "OFFEN" | "IN_ARBEIT" | "GELOEST" | "IRRELEVANT";

const SEVERITY_LABEL: Record<string, string> = {
  CRIT: "Kritisch",
  WARN: "Warnung",
  INFO: "Info",
};

const SEVERITY_COLOR: Record<string, string> = {
  CRIT: "text-status-error",
  WARN: "text-status-warn",
  INFO: "text-fg-muted",
};

function SeverityBadge({ schwere }: { schwere: string }) {
  return (
    <span className={`text-xs font-semibold ${SEVERITY_COLOR[schwere] ?? "text-fg-muted"}`}>
      {SEVERITY_LABEL[schwere] ?? schwere}
    </span>
  );
}

function FindingRow({
  finding,
  expanded,
  onToggle,
}: {
  finding: CustosFinding;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded border border-white/5 bg-bg-panel">
      <button
        type="button"
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <SeverityBadge schwere={finding.schwere} />
        <span className="flex-1 truncate text-sm text-fg">{finding.titel}</span>
        <Tooltip
          title="Status dieses Findings"
          source="/api/v1/custos/findings"
        >
          <span className="rounded bg-white/5 px-2 py-0.5 text-xs text-fg-muted">
            {finding.status}
          </span>
        </Tooltip>
        <Tooltip
          title="Zugehörige Compliance-Regel"
          source="/api/v1/custos/findings"
        >
          <span className="text-xs text-fg-subtle">{finding.regel_id}</span>
        </Tooltip>
        <span className="ml-1 text-fg-subtle">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="border-t border-white/5 px-4 py-3 text-sm text-fg-muted">
          <p className="mb-2">{finding.beschreibung}</p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <dt className="text-fg-subtle">Quelle</dt>
            <dd>{finding.quelle_app}</dd>
            <dt className="text-fg-subtle">Entität-Typ</dt>
            <dd>{finding.entitaet_typ}</dd>
            <dt className="text-fg-subtle">Priorität</dt>
            <dd>{Number(finding.prioritaet_score).toFixed(2)}</dd>
            <dt className="text-fg-subtle">Entdeckt</dt>
            <dd>{new Date(finding.entdeckt_am).toLocaleString("de-DE")}</dd>
            {finding.user_feedback && (
              <>
                <dt className="text-fg-subtle">Feedback</dt>
                <dd>{finding.user_feedback}</dd>
              </>
            )}
          </dl>
        </div>
      )}
    </div>
  );
}

export function FindingsPage() {
  const [severity, setSeverity] = useState<Severity>("ALL");
  const [status, setStatus] = useState<Status>("OFFEN");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const params = new URLSearchParams({ limit: "100" });
  if (severity !== "ALL") params.set("severity", severity);
  if (status !== "ALL") params.set("status", status);

  const { data, isLoading, error } = useQuery({
    queryKey: qk.custos.findings(severity, status),
    queryFn: () => api.custos.getFindings({ severity: severity !== "ALL" ? severity : undefined, status: status !== "ALL" ? status : undefined }),
    refetchInterval: 60_000,
  });

  const findings: CustosFinding[] = Array.isArray(data) ? data : [];

  return (
    <div className="flex flex-col gap-4 p-4" data-testid="custos-findings">
      {/* Filter */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-xs text-fg-muted" htmlFor="severity-filter">
            Schwere
          </label>
          <select
            id="severity-filter"
            value={severity}
            onChange={(e) => setSeverity(e.target.value as Severity)}
            className="rounded border border-white/10 bg-bg-panel px-2 py-1 text-xs text-fg"
          >
            <option value="ALL">Alle</option>
            <option value="CRIT">Kritisch</option>
            <option value="WARN">Warnung</option>
            <option value="INFO">Info</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-fg-muted" htmlFor="status-filter">
            Status
          </label>
          <select
            id="status-filter"
            value={status}
            onChange={(e) => setStatus(e.target.value as Status)}
            className="rounded border border-white/10 bg-bg-panel px-2 py-1 text-xs text-fg"
          >
            <option value="ALL">Alle</option>
            <option value="OFFEN">Offen</option>
            <option value="IN_ARBEIT">In Arbeit</option>
            <option value="GELOEST">Gelöst</option>
            <option value="IRRELEVANT">Irrelevant</option>
          </select>
        </div>
        {data && (
          <Tooltip
            title="Anzahl angezeigter Findings nach Filterung"
            source="/api/v1/custos/findings"
          >
            <span className="ml-auto text-xs text-fg-muted">{findings.length} Ergebnisse</span>
          </Tooltip>
        )}
      </div>

      {/* Inhalt */}
      {isLoading && <LoadingSpinner label="Lade Findings..." />}
      {error && (
        <div className="text-sm text-status-error">
          Fehler: {(error as Error).message}
        </div>
      )}
      {!isLoading && !error && findings.length === 0 && (
        <EmptyState
          title="Keine Findings"
          description="Für die gewählten Filter wurden keine Compliance-Findings gefunden."
        />
      )}
      {!isLoading && findings.length > 0 && (
        <div className="space-y-2">
          {findings.map((f) => (
            <FindingRow
              key={f.id}
              finding={f}
              expanded={expandedId === f.id}
              onToggle={() => setExpandedId(expandedId === f.id ? null : f.id)}
            />
          ))}
        </div>
      )}

      <PageBadge id="custos.findings" />
    </div>
  );
}

export default FindingsPage;
