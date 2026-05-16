// JobDetailPanel — Container fuer das Job-Detail-Feature.
// - Laedt Job-Detail, Recognized-Text, A/B-Vergleich (lazy)
// - Tab-Switcher: Uebersicht | Text | PII | Konsens | A/B
// - PDF-Preview links + Heatmap-Overlay + Tab-spezifischer Content rechts
// - Ref-Sync: Click auf PII-Item -> PdfPreview.goToPage(...)
// - A/B-Tab nur sichtbar wenn ab_compare_available=true ODER backend liefert available=true
//
// Ist auf der Route /jobs/:jobId in JobsPage eingebettet (siehe features/job-queue/index.tsx).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { Card } from "../../components/Card";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { EmptyState } from "../../components/EmptyState";
import { formatDateTime, formatLatency } from "../../lib/format";
import type {
  AbCompareResult,
  JobDetail,
  RecognizedTextDocument,
} from "../../lib/types";

import { AbCompareView } from "./AbCompareView";
import { ConfidenceHeatmap } from "./ConfidenceHeatmap";
import { DoctypeBadge } from "./DoctypeBadge";
import { EngineConsensusHeatmap } from "./EngineConsensusHeatmap";
import { PdfPreview, type PdfPreviewHandle } from "./PdfPreview";
import { PiiList } from "./PiiList";
import { RecognizedText } from "./RecognizedText";
import { RoutingTrace } from "./RoutingTrace";
import { isMockMode } from "../../lib/env";

type TabKey = "overview" | "text" | "pii" | "consensus" | "ab";

const TAB_LABELS: Record<TabKey, string> = {
  overview: "Uebersicht",
  text: "Text",
  pii: "PII",
  consensus: "Konsens",
  ab: "A/B",
};

export interface JobDetailPanelProps {
  jobId: string;
}

interface AsyncState<T> {
  data?: T;
  loading: boolean;
  error?: string;
}

function useAsync<T>(loader: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ loading: true });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true });
    loader()
      .then((data) => {
        if (cancelled) return;
        setState({ data, loading: false });
      })
      .catch((e) => {
        if (cancelled) return;
        const msg = e instanceof ApiError ? `${e.status} ${e.message}` : (e as Error).message;
        setState({ loading: false, error: msg });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}

export function JobDetailPanel({ jobId }: JobDetailPanelProps) {
  const pdfRef = useRef<PdfPreviewHandle>(null);
  const [tab, setTab] = useState<TabKey>("overview");
  const [pdfPage, setPdfPage] = useState(1);
  const [pdfTotal, setPdfTotal] = useState(0);
  const [pdfLayout, setPdfLayout] = useState<{
    width: number;
    height: number;
    scale: number;
  } | null>(null);
  const [heatmapOn, setHeatmapOn] = useState(false);

  const detail = useAsync<JobDetail>(() => api.getJob(jobId), [jobId]);
  const text = useAsync<RecognizedTextDocument>(() => api.getJobText(jobId), [jobId]);
  // A/B nur laden wenn der Detail-Job das Flag setzt — sonst liefert das Backend
  // {"available": false} und wir bekommen einen Stub. Das ist OK, kostet aber einen Roundtrip.
  const abAvailableHint = detail.data?.ab_compare_available === true;
  const ab = useAsync<AbCompareResult>(
    async () => {
      if (!abAvailableHint) {
        // Nicht laden, leeren Stub zurueckgeben
        return { available: false, reason: "Job ohne --ab-compare gestartet" };
      }
      return api.getAbCompare(jobId);
    },
    [jobId, abAvailableHint],
  );

  const pdfUrl = useMemo(() => {
    if (!jobId) return null;
    if (isMockMode()) return null; // Im Mock-Modus kein echtes PDF — Pseudo-Seiten
    return api.getJobPdfUrl(jobId);
  }, [jobId]);

  // PII-Click -> springt im PDF zur Stelle, schaltet ggf. Heatmap an
  const handlePiiNavigate = useCallback((page: number, bbox?: [number, number, number, number]) => {
    pdfRef.current?.goToPage(page, bbox);
    setHeatmapOn(true);
  }, []);

  const handleWordClick = useCallback(
    (page: number, bbox: [number, number, number, number] | undefined) => {
      pdfRef.current?.goToPage(page, bbox);
    },
    [],
  );

  const onPageChange = useCallback((page: number, total: number) => {
    setPdfPage(page);
    setPdfTotal(total);
  }, []);

  const onLayoutChange = useCallback(
    (info: { width: number; height: number; scale: number }) => {
      setPdfLayout(info);
    },
    [],
  );

  // Aktuelle Seite fuer Heatmap
  const currentTextPage = useMemo(() => {
    if (!text.data) return undefined;
    return text.data.pages.find((p) => p.page === pdfPage);
  }, [text.data, pdfPage]);

  // Tabs dynamisch — A/B-Tab nur wenn verfuegbar
  const availableTabs: TabKey[] = useMemo(() => {
    const base: TabKey[] = ["overview", "text", "pii", "consensus"];
    if (abAvailableHint || ab.data?.available) base.push("ab");
    return base;
  }, [abAvailableHint, ab.data?.available]);

  if (detail.loading) {
    return (
      <Card title="Job-Detail">
        <div data-testid="job-detail-loading" className="flex items-center gap-2 p-4 text-sm text-fg-muted">
          <LoadingSpinner /> Lade Job {jobId} ...
        </div>
      </Card>
    );
  }

  if (detail.error || !detail.data) {
    return (
      <Card title="Job-Detail">
        <div
          data-testid="job-detail-error"
          role="alert"
          className="rounded border border-status-error/40 bg-status-error/10 p-3 text-xs text-status-error"
        >
          Job konnte nicht geladen werden: {detail.error ?? "unbekannter Fehler"}
        </div>
      </Card>
    );
  }

  const job = detail.data;

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <span className="font-mono text-xs text-fg-muted">{job.job_id}</span>
          <span className="truncate">{job.filename}</span>
        </span>
      }
      description={
        <span className="flex flex-wrap items-center gap-2 text-xxs text-fg-muted">
          <span>Status:</span>
          <span
            data-testid="job-detail-status"
            className={`font-mono ${
              job.status === "done"
                ? "text-status-ok"
                : job.status === "failed"
                  ? "text-status-error"
                  : job.status === "running"
                    ? "text-status-warn"
                    : "text-fg-muted"
            }`}
          >
            {job.status}
          </span>
          <span>·</span>
          <span>{job.page_total} Seite{job.page_total === 1 ? "" : "n"}</span>
          <span>·</span>
          <span>{formatDateTime(job.started_at)}</span>
          {job.finished_at && (
            <>
              <span>&rarr;</span>
              <span>{formatDateTime(job.finished_at)}</span>
            </>
          )}
        </span>
      }
      actions={
        <Link
          to="/jobs"
          data-testid="job-detail-back"
          className="rounded border border-white/10 px-2 py-1 text-xxs text-fg hover:bg-bg-elevated"
        >
          &lsaquo; Zurueck zur Liste
        </Link>
      }
      bodyClassName="flex flex-col gap-3"
    >
      {/* Tab-Bar */}
      <div data-testid="job-detail-tabs" role="tablist" className="flex flex-wrap gap-1 border-b border-white/5">
        {availableTabs.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            data-testid={`job-detail-tab-${t}`}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-xs transition-colors ${
              tab === t
                ? "border-b-2 border-brand text-fg"
                : "text-fg-muted hover:text-fg"
            }`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Inhalt: PDF links, Tab-Content rechts (auf >= md side-by-side) */}
      <div className="grid gap-3 md:grid-cols-2">
        {/* Linke Spalte: PDF-Preview + Heatmap-Overlay-Toggle */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs uppercase tracking-wide text-fg-muted">Vorschau</h3>
            <label className="flex items-center gap-2 text-xxs text-fg-muted">
              <input
                type="checkbox"
                data-testid="heatmap-toggle"
                checked={heatmapOn}
                onChange={(e) => setHeatmapOn(e.target.checked)}
                className="accent-brand"
                disabled={text.data?.is_native === true}
              />
              Confidence-Heatmap
              {text.data?.is_native && (
                <span title="Native PDF — keine Confidence verfuegbar" className="text-fg-subtle">
                  (nativ)
                </span>
              )}
            </label>
          </div>
          <div className="relative inline-block max-w-full overflow-auto rounded border border-white/5 bg-bg-elevated p-2">
            <div className="relative inline-block">
              <PdfPreview
                ref={pdfRef}
                url={pdfUrl}
                onPageChange={onPageChange}
                onLayoutChange={onLayoutChange}
                mock={isMockMode()}
                mockPageCount={Math.max(1, job.page_total || (text.data?.pages?.length ?? 1))}
              />
              {pdfLayout && (
                <div className="pointer-events-none absolute left-2 top-8">
                  <ConfidenceHeatmap
                    page={currentTextPage}
                    scale={pdfLayout.scale}
                    width={pdfLayout.width}
                    height={pdfLayout.height}
                    visible={heatmapOn}
                    isNative={text.data?.is_native === true}
                  />
                </div>
              )}
            </div>
          </div>
          <div className="text-xxs text-fg-muted" data-testid="job-detail-page-info">
            Seite {pdfPage} von {pdfTotal || job.page_total || 0}
          </div>
        </div>

        {/* Rechte Spalte: Tab-spezifischer Content */}
        <div className="flex flex-col gap-3">
          {tab === "overview" && (
            <div data-testid="job-detail-overview" className="flex flex-col gap-3">
              <DoctypeBadge
                doctype={job.doctype}
                confidence={job.doctype_confidence}
                textScore={job.doctype_text_score}
                layoutScore={job.doctype_layout_score}
                alternatives={job.doctype_alternatives}
              />
              <div className="rounded border border-white/5 bg-bg-elevated p-3 text-xs text-fg">
                <div className="mb-1 text-xxs uppercase tracking-wide text-fg-muted">
                  Engines
                </div>
                <div className="flex flex-wrap gap-1">
                  {(job.engines_used ?? []).map((e) => (
                    <span
                      key={e}
                      className="rounded bg-brand/20 px-1.5 py-0.5 font-mono text-brand"
                    >
                      {e}
                    </span>
                  ))}
                  {(job.engines_used ?? []).length === 0 && (
                    <span className="text-fg-muted">(keine)</span>
                  )}
                </div>
                <div className="mb-1 mt-2 text-xxs uppercase tracking-wide text-fg-muted">
                  Nodes
                </div>
                <div className="flex flex-wrap gap-1">
                  {(job.nodes_used ?? []).map((n) => (
                    <span
                      key={n}
                      className="rounded bg-status-info/20 px-1.5 py-0.5 font-mono text-status-info"
                    >
                      {n}
                    </span>
                  ))}
                  {(job.nodes_used ?? []).length === 0 && (
                    <span className="text-fg-muted">(keine)</span>
                  )}
                </div>
                {job.consensus_score != null && (
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="text-fg-muted">Consensus-Score</span>
                    <span className="font-mono text-fg">
                      {(job.consensus_score * 100).toFixed(1)} %
                    </span>
                  </div>
                )}
                {job.error && (
                  <div className="mt-2 rounded border border-status-error/40 bg-status-error/10 px-2 py-1 text-xs text-status-error">
                    {job.error}
                  </div>
                )}
              </div>
              <RoutingTrace doctype={job.doctype} trace={job.routing_trace} />
            </div>
          )}

          {tab === "text" && (
            <div data-testid="job-detail-text" className="flex flex-col gap-2">
              {text.loading && (
                <div className="text-xs text-fg-muted">Lade Text ...</div>
              )}
              {text.error && (
                <div role="alert" className="text-xs text-status-error">
                  {text.error}
                </div>
              )}
              <RecognizedText
                doc={text.data}
                page={pdfPage}
                onWordClick={handleWordClick}
              />
            </div>
          )}

          {tab === "pii" && (
            <div data-testid="job-detail-pii">
              <PiiList findings={job.pii_findings} onNavigate={handlePiiNavigate} />
            </div>
          )}

          {tab === "consensus" && (
            <div data-testid="job-detail-consensus" className="flex flex-col gap-3">
              <EngineConsensusHeatmap
                data={job.engine_consensus_per_page}
                engines={job.engines_used}
              />
              <div className="text-xxs text-fg-muted">
                Wert: Konfidenz pro Engine pro Seite (0..100). Niedrig = rot, hoch = gruen.
              </div>
            </div>
          )}

          {tab === "ab" && (
            <div data-testid="job-detail-ab">
              <AbCompareView data={ab.data} loading={ab.loading} error={ab.error ?? null} />
            </div>
          )}
        </div>
      </div>

      {/* Performance-Footer: Latenz auf einen Blick */}
      {job.routing_trace && job.routing_trace.length > 0 && (
        <div className="mt-1 flex items-center justify-end gap-3 text-xxs text-fg-muted">
          <span>Avg-Latenz</span>
          <span className="font-mono text-fg">
            {formatLatency(
              job.routing_trace.reduce((a, b) => a + b.latency_ms, 0) /
                job.routing_trace.length,
            )}
          </span>
        </div>
      )}
    </Card>
  );
}

export default JobDetailPanel;

// Re-Export-fallback fuer Konsumenten die ohne jobId rendern
export function JobDetailEmpty() {
  return (
    <EmptyState
      title="Kein Job ausgewaehlt"
      description="Klick einen Job in der Liste links an, um Details zu sehen."
    />
  );
}
