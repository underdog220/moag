// Contract — Oberon API-Kontrakt und Capabilities + Classification-Guide.
// Datenquellen:
//   GET /api/v1/oberon/contract/capabilities  → Capabilities-Liste (oben)
//   GET /api/v1/oberon/contract/classification-guide → Classification-Guide (unten)

import { useQuery } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import { qk } from "../../../lib/queryKeys";
import { PageBadge } from "../../../components/PageBadge";
import { LoadingSpinner } from "../../../components/LoadingSpinner";
import { EmptyState } from "../../../components/EmptyState";
import { Tooltip } from "../../../components/Tooltip";

// ── Typ-Helfer fuer Classification-Guide ──────────────────────────────────────

interface AllowlistEntry {
  subtype: string;
  description: string;
  evidenceExamples?: string[];
  exampleId?: string;
  legalNote?: string;
}

interface DenyEntry {
  doctypePattern: string;
  reason: string;
  alternative?: string;
}

interface ClassificationGuide {
  contractVersion?: string;
  legalBasis?: string;
  publicationAllowlist?: AllowlistEntry[];
  denyList?: DenyEntry[];
  decisionTree?: Record<string, string>;
}

export function ContractPage() {
  // ── Capabilities-Query ────────────────────────────────────────────────────
  const { data, isLoading, error, dataUpdatedAt } = useQuery({
    queryKey: qk.oberon.contract,
    queryFn: () => api.oberon.getContractCapabilities(),
    refetchInterval: 120_000,
  });

  // ── Classification-Guide-Query ────────────────────────────────────────────
  const {
    data: guideData,
    isLoading: guideLoading,
    error: guideError,
    refetch: guideRefetch,
  } = useQuery({
    queryKey: [...qk.oberon.contract, "classification-guide"],
    queryFn: () => api.oberon.getContractClassificationGuide(),
    staleTime: 24 * 60 * 60 * 1000, // 24h
    refetchInterval: false,
  });

  const updatedAt = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString("de-DE") : "–";
  const isStub = (data as any)?.stub === true;

  // Capabilities koennen als Array oder Objekt mit capabilities-Feld kommen
  const capabilities: any[] = Array.isArray(data)
    ? data
    : Array.isArray((data as any)?.capabilities)
      ? (data as any).capabilities
      : [];

  const guide = guideData as ClassificationGuide | undefined;
  const guideIsStub = (guideData as any)?.stub === true;

  return (
    <div className="p-4" data-testid="oberon-contract-page">
      <h2 className="mb-4 text-base font-semibold text-fg">API-Kontrakt</h2>

      {/* ── Capabilities-Liste ─────────────────────────────────────────────── */}
      {isLoading && <LoadingSpinner label="Lade Kontrakt-Daten..." />}
      {error && <div className="text-sm text-status-error">Fehler: {(error as Error).message}</div>}

      {!isLoading && !error && (
        <>
          {isStub ? (
            <EmptyState title="Kein Zugriff" description={(data as any).message} />
          ) : capabilities.length === 0 ? (
            <div className="rounded border border-white/10 bg-bg-panel p-4">
              <p className="text-sm text-fg-muted mb-2">Kontrakt-Rohdaten:</p>
              <pre className="overflow-auto rounded bg-bg-elevated p-3 text-xs text-fg">
                {JSON.stringify(data, null, 2)}
              </pre>
            </div>
          ) : (
            <div className="space-y-1">
              {capabilities.map((cap: any, i: number) => (
                <div
                  key={cap.name ?? cap.path ?? i}
                  className="flex items-center gap-3 rounded border border-white/5 bg-bg-panel px-3 py-2 text-xs"
                >
                  <Tooltip
                    title={cap.description ?? cap.name ?? cap.path}
                    source="GET /api/v1/oberon/contract/capabilities"
                    updatedAt={`Zuletzt: ${updatedAt}`}
                  >
                    <span className="shrink-0 rounded border border-white/10 bg-bg-elevated px-1 py-0.5 font-mono text-fg-muted">
                      {cap.method ?? "GET"}
                    </span>
                  </Tooltip>
                  <span className="flex-1 font-mono text-fg">{cap.path ?? cap.name}</span>
                  {cap.requires_auth && (
                    <Tooltip
                      title="Dieser Endpoint erfordert Authentifizierung (Bearer Token)"
                      source="GET /api/v1/oberon/contract/capabilities"
                      updatedAt={`Zuletzt: ${updatedAt}`}
                    >
                      <span className="text-fg-subtle">Auth</span>
                    </Tooltip>
                  )}
                  {cap.version && (
                    <span className="tabular-nums text-fg-subtle">v{cap.version}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Classification-Guide ───────────────────────────────────────────── */}
      <section className="classification-guide mt-8" data-testid="classification-guide-section">
        <div className="mb-3 flex items-center gap-2">
          <h3 className="text-sm font-semibold text-fg">Classification-Guide</h3>
          <Tooltip
            title="DSGVO-Klassifizierungs-Leitfaden: welche Dokument-Subtypes publiziert werden dürfen (Allowlist), welche nicht (Deny-List) und wie die Entscheidung getroffen wird (Decision-Tree). Rechtsbasis: DSGVO Art. 5(1)(c)."
            source="GET /api/v1/oberon/contract/classification-guide"
            updatedAt="Cache: 24h"
          >
            <span className="cursor-help rounded bg-bg-elevated px-1.5 py-0.5 text-xs text-fg-muted">
              ?
            </span>
          </Tooltip>
          {guide?.contractVersion && (
            <span className="text-xs text-fg-subtle tabular-nums">
              v{guide.contractVersion}
            </span>
          )}
        </div>

        {guideLoading && <LoadingSpinner label="Lade Classification-Guide..." />}

        {guideError && !guideLoading && (
          <div
            className="flex items-center gap-3 rounded border border-status-error/30 bg-bg-panel px-3 py-2 text-sm"
            data-testid="classification-guide-error"
          >
            <span className="text-status-error">
              Classification-Guide nicht verfügbar
            </span>
            <span className="text-xs text-fg-muted">
              {(guideError as Error).message}
            </span>
            <button
              className="ml-auto rounded border border-white/10 px-2 py-0.5 text-xs text-fg hover:bg-bg-elevated"
              onClick={() => void guideRefetch()}
            >
              Nochmals laden
            </button>
          </div>
        )}

        {!guideLoading && !guideError && guideIsStub && (
          <EmptyState
            title="Classification-Guide nicht verfügbar"
            description={(guideData as any).message}
          />
        )}

        {!guideLoading && !guideError && !guideIsStub && guide && (
          <div className="space-y-5" data-testid="classification-guide-content">
            {/* Legal-Basis */}
            {guide.legalBasis && (
              <p className="text-xs text-fg-muted italic">{guide.legalBasis}</p>
            )}

            {/* Publication-Allowlist */}
            {Array.isArray(guide.publicationAllowlist) && guide.publicationAllowlist.length > 0 && (
              <div data-testid="classification-guide-allowlist">
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">
                  Publikations-Allowlist
                </h4>
                <div className="space-y-1">
                  {guide.publicationAllowlist.map((entry) => (
                    <div
                      key={entry.subtype}
                      className="flex items-start gap-3 rounded border border-white/5 bg-bg-panel px-3 py-2 text-xs"
                      data-testid={`allowlist-entry-${entry.subtype}`}
                    >
                      <Tooltip
                        title={[
                          entry.legalNote ? `Rechtsbasis: ${entry.legalNote}` : null,
                          entry.evidenceExamples?.length
                            ? `Beispiele: ${entry.evidenceExamples.join(", ")}`
                            : null,
                          entry.exampleId ? `Beispiel-ID: ${entry.exampleId}` : null,
                        ]
                          .filter(Boolean)
                          .join(" | ") || entry.description}
                        source="GET /api/v1/oberon/contract/classification-guide"
                        updatedAt="Cache: 24h"
                      >
                        <span className="shrink-0 rounded border border-status-ok/30 bg-status-ok/10 px-1.5 py-0.5 font-mono text-status-ok">
                          {entry.subtype}
                        </span>
                      </Tooltip>
                      <span className="flex-1 text-fg">{entry.description}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Deny-List */}
            {Array.isArray(guide.denyList) && guide.denyList.length > 0 && (
              <div data-testid="classification-guide-denylist">
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">
                  Deny-List
                </h4>
                <table className="w-full text-xs" data-testid="deny-list-table">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="py-1 pr-3 text-left text-fg-subtle">Muster</th>
                      <th className="py-1 pr-3 text-left text-fg-subtle">Grund</th>
                      <th className="py-1 text-left text-fg-subtle">Alternative</th>
                    </tr>
                  </thead>
                  <tbody>
                    {guide.denyList.map((entry) => (
                      <tr
                        key={entry.doctypePattern}
                        className="border-b border-white/5 hover:bg-bg-elevated"
                        data-testid={`deny-entry-${entry.doctypePattern}`}
                      >
                        <td className="py-1.5 pr-3 font-mono text-status-error">
                          {entry.doctypePattern}
                        </td>
                        <td className="py-1.5 pr-3 text-fg">{entry.reason}</td>
                        <td className="py-1.5 text-fg-muted">{entry.alternative ?? "–"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Decision-Tree */}
            {guide.decisionTree && Object.keys(guide.decisionTree).length > 0 && (
              <div data-testid="classification-guide-decision-tree">
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">
                  Entscheidungsbaum
                </h4>
                <div className="space-y-1">
                  {Object.entries(guide.decisionTree).map(([question, answer]) => (
                    <div
                      key={question}
                      className="rounded border border-white/5 bg-bg-panel px-3 py-2 text-xs"
                      data-testid={`decision-tree-entry-${question}`}
                    >
                      <p className="font-medium text-fg">{question}</p>
                      <p className="mt-0.5 text-fg-muted">{answer}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      <PageBadge id="oberon.contract" />
    </div>
  );
}

export default ContractPage;
