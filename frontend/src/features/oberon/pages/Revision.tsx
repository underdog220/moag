// Revision — DSGVO-Revisions-Workbench.
// Zeigt den Oberon-Document-Store: pro Dokument-Session Original UND
// (von Oberon) anonymisierte Fassung nebeneinander, damit ein Revisor die
// Anonymisierung gegenpruefen und ein Verdikt (geprueft/beanstandet) setzen kann.
//
// Datenquellen:
//   GET  /api/v1/oberon/revision/documents                       → Session-Liste
//   GET  /api/v1/oberon/revision/documents/{sessionId}/{datei}   → Datei-Text
//   GET  /api/v1/oberon/revision/verdicts                        → MOAG-lokale Verdikte
//   POST /api/v1/oberon/revision/verdict                         → Verdikt setzen

import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import { qk } from "../../../lib/queryKeys";
import type { RevisionDocument, RevisionVerdictRecord } from "../../../lib/types";
import { PageBadge } from "../../../components/PageBadge";
import { LoadingSpinner } from "../../../components/LoadingSpinner";
import { EmptyState } from "../../../components/EmptyState";
import { Tooltip } from "../../../components/Tooltip";
import { Panel, Chip, ErrorBanner, relTime } from "../_oberon_ui";
import { diffLines, type DiffLine } from "../_diff";

const LIST_SOURCE = "GET /api/v1/oberon/revision/documents";
// Obergrenze gerenderter Listeneintraege (Performance bei vielen Dokumenten).
const MAX_RENDER = 200;

// Synchronisiertes Scrollen mehrerer Panels: scrollt man eins, ziehen die
// anderen proportional mit (fuer den direkten Vergleich Original<->anonymisiert).
function useSyncScroll() {
  const panes = useRef<Map<string, HTMLElement>>(new Map());
  const lock = useRef<string | null>(null);

  const register = (key: string) => (el: HTMLElement | null) => {
    if (el) panes.current.set(key, el);
    else panes.current.delete(key);
  };

  const onScroll = (key: string) => (e: { currentTarget: HTMLElement }) => {
    // Nur die Quelle des aktuellen Scroll-Vorgangs darf die anderen treiben
    // (verhindert die Rueckkopplungs-Schleife beim programmatischen Setzen).
    if (lock.current && lock.current !== key) return;
    lock.current = key;
    const src = e.currentTarget;
    const denom = src.scrollHeight - src.clientHeight;
    const ratio = denom > 0 ? src.scrollTop / denom : 0;
    panes.current.forEach((el, k) => {
      if (k === key) return;
      const d = el.scrollHeight - el.clientHeight;
      el.scrollTop = ratio * d;
    });
    if (typeof window !== "undefined" && window.requestAnimationFrame) {
      window.requestAnimationFrame(() => { lock.current = null; });
    } else {
      lock.current = null;
    }
  };

  return { register, onScroll };
}

function rescanTone(status: string | null | undefined): "ok" | "error" | "neutral" {
  if (!status) return "neutral";
  if (status.toLowerCase() === "ok") return "ok";
  if (status.toLowerCase() === "leak") return "error";
  return "neutral";
}

function verdictTone(v: string | null | undefined): "ok" | "error" | "warn" | "neutral" {
  if (v === "geprueft") return "ok";
  if (v === "beanstandet") return "error";
  return "neutral";
}

function verdictLabel(v: string | null | undefined): string {
  if (v === "geprueft") return "geprüft";
  if (v === "beanstandet") return "beanstandet";
  return "offen";
}

function anonymizedFile(doc: RevisionDocument | undefined): string | null {
  if (!doc) return null;
  if (doc.hatOberonAnonymisiert) return "oberon_anonymisiert.txt";
  if (doc.hatAnonymizedText) return "anonymisiert.txt";
  return null;
}

function originalFile(doc: RevisionDocument | undefined): string | null {
  if (!doc) return null;
  if (doc.hatOriginalText) return "original.txt";
  return null;
}

function clientAnonFile(doc: RevisionDocument | undefined): string | null {
  if (!doc) return null;
  if (doc.hatAnonymizedText) return "anonymisiert.txt";
  return null;
}

function useFileText(sessionId: string | null, datei: string | null) {
  return useQuery({
    queryKey: qk.oberon.revisionFile(sessionId ?? "-", datei ?? "-"),
    queryFn: async () => {
      const res = await api.oberon.getRevisionFile(sessionId as string, datei as string);
      if ((res as any)?.stub) return null;
      return res.content ?? "";
    },
    enabled: !!sessionId && !!datei,
  });
}

export function RevisionPage() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);

  // Filter-/Ansicht-State
  const [search, setSearch] = useState("");
  const [verdictFilter, setVerdictFilter] = useState<string>("alle");
  const [piiFilter, setPiiFilter] = useState<string>("alle");
  const [showClient, setShowClient] = useState(false);
  const [showDiff, setShowDiff] = useState(true);
  const [viewMode, setViewMode] = useState<"text" | "pdf">("text");
  const sync = useSyncScroll();

  const { data, isLoading, error, dataUpdatedAt } = useQuery({
    queryKey: qk.oberon.revisionList,
    queryFn: () => api.oberon.getRevisionDocuments(),
    refetchInterval: 30_000,
  });

  const { data: verdictsData } = useQuery({
    queryKey: qk.oberon.revisionVerdicts,
    queryFn: () => api.oberon.getRevisionVerdicts(),
    refetchInterval: 60_000,
  });
  const verdicts: Record<string, RevisionVerdictRecord> =
    (verdictsData as any)?.verdicts ?? {};

  const verdictMutation = useMutation({
    mutationFn: (vars: { session_id: string; verdict: "geprueft" | "beanstandet" | "offen" }) =>
      api.oberon.setRevisionVerdict(vars),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.oberon.revisionVerdicts }),
  });

  const updatedAt = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString("de-DE") : "–";
  const isStub = !!(data as any)?.stub;
  const allDocuments: RevisionDocument[] = useMemo(
    () => (isStub ? [] : ((data as any)?.documents ?? [])),
    [data, isStub],
  );

  // Filter anwenden
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allDocuments.filter((d) => {
      if (q) {
        const hay = `${d.filename ?? ""} ${d.clientId ?? ""} ${d.documentType ?? ""} ${d.sessionId}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (piiFilter === "mit" && !d.oberonPiiFound) return false;
      if (piiFilter === "ohne" && d.oberonPiiFound) return false;
      if (verdictFilter !== "alle") {
        const v = verdicts[d.sessionId]?.verdict;
        if (verdictFilter === "offen" && v) return false;
        if (verdictFilter !== "offen" && v !== verdictFilter) return false;
      }
      return true;
    });
  }, [allDocuments, search, piiFilter, verdictFilter, verdicts]);

  const rendered = filtered.slice(0, MAX_RENDER);
  const truncated = filtered.length - rendered.length;

  const effectiveSelected =
    selected ?? (rendered.length > 0 ? rendered[0].sessionId : null);
  const selectedDoc = allDocuments.find((d) => d.sessionId === effectiveSelected);
  const currentVerdict = effectiveSelected ? verdicts[effectiveSelected]?.verdict : undefined;

  const origDatei = originalFile(selectedDoc);
  const anonDatei = anonymizedFile(selectedDoc);
  const clientDatei = showClient ? clientAnonFile(selectedDoc) : null;

  const orig = useFileText(effectiveSelected, origDatei);
  const anon = useFileText(effectiveSelected, anonDatei);
  const client = useFileText(effectiveSelected, clientDatei);

  // Diff zwischen Original und Oberon-Anonymisiert (nur wenn Toggle aktiv).
  const diff = useMemo(() => {
    if (!showDiff || orig.data == null || anon.data == null) return null;
    return diffLines(orig.data, anon.data);
  }, [showDiff, orig.data, anon.data]);

  function setVerdict(v: "geprueft" | "beanstandet" | "offen") {
    if (!effectiveSelected) return;
    verdictMutation.mutate({ session_id: effectiveSelected, verdict: v });
  }

  const inputCls =
    "rounded border border-white/10 bg-bg-elevated px-3 py-2 text-fg min-h-[44px] text-sm";

  return (
    <div className="p-4" data-testid="oberon-revision-page">
      <h2 className="mb-1 text-base font-semibold text-fg">DSGVO-Revision</h2>
      <p className="mb-4 text-xs text-fg-muted">
        Aufbewahrte Dokumente aus dem Oberon-Document-Store — Original gegen anonymisierte
        Fassung pruefen und als geprüft/beanstandet markieren.
      </p>

      {/* Filter-Leiste */}
      <Panel title="Filter" className="mb-4">
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Tooltip title="Freitext: Dateiname, Client, Doctype, Session-ID" source={LIST_SOURCE} updatedAt={`Zuletzt: ${updatedAt}`}>
            <input
              type="text"
              placeholder="Suche (Datei/Client/Doctype)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={inputCls}
              data-testid="revision-search"
            />
          </Tooltip>
          <Tooltip title="Nach Revisions-Verdikt filtern" source="GET /api/v1/oberon/revision/verdicts">
            <select value={verdictFilter} onChange={(e) => setVerdictFilter(e.target.value)} className={inputCls}>
              <option value="alle">Verdikt: alle</option>
              <option value="offen">offen</option>
              <option value="geprueft">geprüft</option>
              <option value="beanstandet">beanstandet</option>
            </select>
          </Tooltip>
          <Tooltip title="Nach PII-Befund filtern" source={LIST_SOURCE}>
            <select value={piiFilter} onChange={(e) => setPiiFilter(e.target.value)} className={inputCls}>
              <option value="alle">PII: alle</option>
              <option value="mit">mit PII</option>
              <option value="ohne">ohne PII</option>
            </select>
          </Tooltip>
          <label className="flex items-center gap-1.5 text-xs text-fg-muted">
            <input type="checkbox" checked={showClient} onChange={(e) => setShowClient(e.target.checked)} />
            3. Spalte (Client-Fassung)
          </label>
          <label className="flex items-center gap-1.5 text-xs text-fg-muted">
            <input type="checkbox" checked={showDiff} onChange={(e) => setShowDiff(e.target.checked)} data-testid="revision-diff-toggle" />
            Unterschiede hervorheben
          </label>
          {/* Ansicht Text/PDF */}
          <Tooltip title="Zwischen Text-Vergleich und PDF-Ansicht (Original vs. geschwaerzt) umschalten" source="GET /api/v1/oberon/revision/documents/{id}/{datei}/raw">
            <span className="inline-flex overflow-hidden rounded border border-white/10" data-testid="revision-viewmode">
              {(["text", "pdf"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setViewMode(m)}
                  className={`px-3 py-2 text-xs font-medium min-h-[44px] ${
                    viewMode === m ? "bg-brand/15 text-brand" : "text-fg-muted hover:bg-white/5"
                  }`}
                >
                  {m === "text" ? "Text" : "PDF"}
                </button>
              ))}
            </span>
          </Tooltip>
        </div>
      </Panel>

      {isLoading && <LoadingSpinner label="Lade Revisions-Dokumente..." />}
      {error && <ErrorBanner message={(error as Error).message} />}

      {!isLoading && !error && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(18rem,22rem)_1fr]">
          {/* Linke Spalte: Session-Liste */}
          <Panel
            title={`Dokumente (${filtered.length}${filtered.length !== allDocuments.length ? ` / ${allDocuments.length}` : ""})`}
            data-testid="revision-list"
          >
            {rendered.length === 0 ? (
              <EmptyState
                title="Keine Dokumente"
                description={
                  isStub
                    ? "Kein Oberon-Token konfiguriert."
                    : allDocuments.length === 0
                      ? "Keine aufbewahrten Dokument-Sessions im Document-Store."
                      : "Kein Dokument passt zum Filter."
                }
              />
            ) : (
              <div className="max-h-[34rem] space-y-1.5 overflow-y-auto pr-1">
                {rendered.map((doc) => {
                  const active = doc.sessionId === effectiveSelected;
                  const v = verdicts[doc.sessionId]?.verdict;
                  return (
                    <button
                      key={doc.sessionId}
                      type="button"
                      onClick={() => setSelected(doc.sessionId)}
                      data-testid={`revision-item-${doc.sessionId}`}
                      className={`block w-full rounded border px-3 py-2 text-left transition-colors min-h-[44px] ${
                        active ? "border-brand/40 bg-brand/10" : "border-white/5 bg-bg-elevated/30 hover:bg-white/5"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-fg">
                          {doc.filename || doc.sessionId}
                        </span>
                        <span className="ml-auto shrink-0">
                          <Chip tone={verdictTone(v)}>{verdictLabel(v)}</Chip>
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xxs text-fg-muted">
                        {doc.clientId && <span className="font-mono">{doc.clientId}</span>}
                        {doc.documentType && <span>· {doc.documentType}</span>}
                        {doc.timestamp && <span className="ml-auto">{relTime(doc.timestamp)}</span>}
                      </div>
                      {doc.oberonPiiTypes && doc.oberonPiiTypes.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {doc.oberonPiiTypes.slice(0, 6).map((t) => (
                            <span key={t} className="rounded border border-status-warn/30 bg-status-warn/10 px-1 py-0.5 text-xxs font-semibold text-status-warn">
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </button>
                  );
                })}
                {truncated > 0 && (
                  <p className="px-1 pt-2 text-center text-xxs text-fg-subtle">
                    {truncated} weitere ausgeblendet — Filter/Suche nutzen.
                  </p>
                )}
              </div>
            )}
          </Panel>

          {/* Rechte Spalte */}
          <div className="flex flex-col gap-4">
            {!selectedDoc ? (
              <Panel title="Vergleich">
                <EmptyState
                  title="Kein Dokument gewaehlt"
                  description="Waehle links eine Dokument-Session, um Original und anonymisierte Fassung zu vergleichen."
                />
              </Panel>
            ) : (
              <>
                {/* Befund + Verdikt */}
                <Panel title="PII-Befund & Verdikt" data-testid="revision-befund">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1 text-sm">
                    <Tooltip title="Hat Oberons eigener Scan personenbezogene Daten gefunden?" source={LIST_SOURCE} updatedAt={`Zuletzt: ${updatedAt}`}>
                      <span className="text-fg">
                        PII gefunden:{" "}
                        <span className={selectedDoc.oberonPiiFound ? "text-status-warn" : "text-status-ok"}>
                          {selectedDoc.oberonPiiFound ? "ja" : "nein"}
                        </span>
                      </span>
                    </Tooltip>
                    {selectedDoc.rescanStatus && (
                      <Tooltip title={`Re-Scan der anonymisierten Fassung: "${selectedDoc.rescanStatus}". "leak" = nach Anonymisierung noch PII erkannt.`} source={LIST_SOURCE} updatedAt={`Zuletzt: ${updatedAt}`}>
                        <span>Re-Scan: <Chip tone={rescanTone(selectedDoc.rescanStatus)}>{selectedDoc.rescanStatus}</Chip></span>
                      </Tooltip>
                    )}
                    {typeof selectedDoc.seitenGesamt === "number" && (
                      <span className="text-xs text-fg-muted">
                        {selectedDoc.seitenMitPii ?? 0}/{selectedDoc.seitenGesamt} Seiten mit PII
                      </span>
                    )}
                  </div>

                  {selectedDoc.oberonPiiTypes && selectedDoc.oberonPiiTypes.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {selectedDoc.oberonPiiTypes.map((t) => (
                        <Tooltip key={t} title={`Erkannter PII-Typ: ${t}`} source={LIST_SOURCE} updatedAt={`Zuletzt: ${updatedAt}`}>
                          <span className="rounded border border-status-warn/30 bg-status-warn/10 px-1.5 py-0.5 text-xxs font-semibold text-status-warn">{t}</span>
                        </Tooltip>
                      ))}
                    </div>
                  )}

                  {/* Verdikt-Zeile */}
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
                    <span className="text-xs text-fg-muted">Verdikt:</span>
                    <Chip tone={verdictTone(currentVerdict)}>{verdictLabel(currentVerdict)}</Chip>
                    {verdicts[effectiveSelected ?? ""]?.reviewed_at && (
                      <span className="text-xxs text-fg-subtle">{relTime(verdicts[effectiveSelected ?? ""]?.reviewed_at)}</span>
                    )}
                    <div className="ml-auto flex gap-2">
                      <Tooltip title="Dokument als korrekt anonymisiert markieren (MOAG-lokal gespeichert)" source="POST /api/v1/oberon/revision/verdict">
                        <button
                          type="button"
                          onClick={() => setVerdict("geprueft")}
                          disabled={verdictMutation.isPending}
                          data-testid="verdict-geprueft"
                          className="rounded border border-status-ok/40 px-3 py-2 text-xs font-medium text-status-ok hover:bg-status-ok/10 min-h-[44px] disabled:opacity-50"
                        >
                          Als geprüft
                        </button>
                      </Tooltip>
                      <Tooltip title="Dokument beanstanden (Anonymisierung unzureichend)" source="POST /api/v1/oberon/revision/verdict">
                        <button
                          type="button"
                          onClick={() => setVerdict("beanstandet")}
                          disabled={verdictMutation.isPending}
                          data-testid="verdict-beanstandet"
                          className="rounded border border-status-error/40 px-3 py-2 text-xs font-medium text-status-error hover:bg-status-error/10 min-h-[44px] disabled:opacity-50"
                        >
                          Beanstanden
                        </button>
                      </Tooltip>
                      {currentVerdict && (
                        <Tooltip title="Verdikt zuruecksetzen (wieder offen)" source="POST /api/v1/oberon/revision/verdict">
                          <button
                            type="button"
                            onClick={() => setVerdict("offen")}
                            disabled={verdictMutation.isPending}
                            className="rounded border border-white/15 px-3 py-2 text-xs font-medium text-fg-muted hover:bg-white/5 min-h-[44px] disabled:opacity-50"
                          >
                            Zurücksetzen
                          </button>
                        </Tooltip>
                      )}
                    </div>
                  </div>
                  <p className="mt-2 text-xxs text-fg-subtle">
                    Verdikt wird vorerst MOAG-lokal gespeichert (Migration nach Oberon via CR
                    2026-06-18-moag-dsgvo-revision-verdikt-retention).
                  </p>
                </Panel>

                {viewMode === "pdf" ? (
                  /* PDF-Ansicht: Original ↔ geschwaerzt */
                  selectedDoc.hatOriginalPdf || selectedDoc.hatRedactedPdf ? (
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2" data-testid="revision-pdf-view">
                      {selectedDoc.hatOriginalPdf && (
                        <PdfPanel title="Original (PDF)" url={api.oberon.revisionRawUrl(effectiveSelected as string, "original.pdf")} tone="original" />
                      )}
                      {selectedDoc.hatRedactedPdf && (
                        <PdfPanel title="Geschwärzt (PDF)" url={api.oberon.revisionRawUrl(effectiveSelected as string, "redacted.pdf")} tone="anon" />
                      )}
                    </div>
                  ) : (
                    <Panel title="PDF-Ansicht">
                      <EmptyState title="Kein PDF vorhanden" description="Diese Session hat keine PDF-Dateien — nutze die Text-Ansicht." />
                    </Panel>
                  )
                ) : (
                  <>
                    {/* Legende fuer die Diff-Farben + Hinweis Sync-Scroll */}
                    {showDiff && (
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xxs text-fg-muted">
                        <span className="inline-flex items-center gap-1">
                          <span className="inline-block h-3 w-3 rounded-sm bg-status-error/30 border border-status-error/40" />
                          im Original (enthielt PII)
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <span className="inline-block h-3 w-3 rounded-sm bg-status-ok/30 border border-status-ok/40" />
                          anonymisierte Ersetzung
                        </span>
                        <span className="text-fg-subtle">· Spalten scrollen synchron</span>
                      </div>
                    )}
                    {/* Side-by-Side Text */}
                    <div className={`grid grid-cols-1 gap-4 ${showClient && clientDatei ? "2xl:grid-cols-3" : "xl:grid-cols-2"}`}>
                      <TextPanel
                        title="Original"
                        datei={origDatei}
                        text={orig.data}
                        lines={diff?.left}
                        loading={orig.isLoading}
                        error={orig.error as Error | null}
                        sessionId={effectiveSelected}
                        tone="original"
                        registerScroll={sync.register("orig")}
                        onScroll={sync.onScroll("orig")}
                      />
                      {showClient && clientDatei && (
                        <TextPanel
                          title="Anonymisiert (Client)"
                          datei={clientDatei}
                          text={client.data}
                          loading={client.isLoading}
                          error={client.error as Error | null}
                          sessionId={effectiveSelected}
                          tone="anon"
                          registerScroll={sync.register("client")}
                          onScroll={sync.onScroll("client")}
                        />
                      )}
                      <TextPanel
                        title="Anonymisiert (Oberon)"
                        datei={anonDatei}
                        text={anon.data}
                        lines={diff?.right}
                        loading={anon.isLoading}
                        error={anon.error as Error | null}
                        sessionId={effectiveSelected}
                        tone="anon"
                        registerScroll={sync.register("anon")}
                        onScroll={sync.onScroll("anon")}
                      />
                    </div>
                    {diff?.skipped && (
                      <p className="text-xxs text-fg-subtle">
                        Diff übersprungen (Dokument zu groß) — Texte unmarkiert.
                      </p>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <PageBadge id="oberon.revision" />
    </div>
  );
}

function TextPanel({
  title,
  datei,
  text,
  lines,
  loading,
  error,
  sessionId,
  tone,
  registerScroll,
  onScroll,
}: {
  title: string;
  datei: string | null;
  text: string | null | undefined;
  lines?: DiffLine[];
  loading: boolean;
  error: Error | null;
  sessionId: string | null;
  tone: "original" | "anon";
  registerScroll?: (el: HTMLElement | null) => void;
  onScroll?: (e: { currentTarget: HTMLElement }) => void;
}) {
  const source = datei && sessionId
    ? `GET /api/v1/oberon/revision/documents/${sessionId}/${datei}`
    : "GET /api/v1/oberon/revision/documents/{id}/{datei}";
  const borderTone = tone === "anon" ? "border-status-ok/20" : "border-white/10";
  // Geaenderte Zeilen: im Original rot (enthielt PII), in der anonymisierten
  // Fassung gruen (die Ersetzung) — zwei klar unterscheidbare Farben.
  const changedBg = tone === "anon" ? "bg-status-ok/20" : "bg-status-error/20";
  return (
    <section className={`flex flex-col rounded-lg border ${borderTone} bg-bg-panel p-3`}>
      <div className="mb-2 flex items-center gap-2 border-b border-white/10 pb-1.5">
        <Tooltip title={`Fassung: ${title}`} source={source}>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">{title}</h3>
        </Tooltip>
        {datei && <span className="ml-auto font-mono text-xxs text-fg-subtle">{datei}</span>}
      </div>
      {!datei ? (
        <p className="py-6 text-center text-xs text-fg-muted">Keine {title}-Datei vorhanden.</p>
      ) : loading ? (
        <LoadingSpinner label="Lade Text..." />
      ) : error ? (
        <ErrorBanner message={error.message} />
      ) : text == null ? (
        <p className="py-6 text-center text-xs text-fg-muted">Kein Inhalt (Oberon-Token fehlt oder Datei leer).</p>
      ) : lines ? (
        <div
          ref={registerScroll}
          onScroll={onScroll}
          className="max-h-[28rem] overflow-auto font-mono text-xs leading-relaxed"
        >
          {lines.map((ln, i) => (
            <div
              key={i}
              className={`whitespace-pre-wrap break-words px-1 ${
                ln.changed ? `${changedBg} text-fg` : "text-fg"
              }`}
            >
              {ln.text || " "}
            </div>
          ))}
        </div>
      ) : (
        <pre
          ref={registerScroll as ((el: HTMLPreElement | null) => void) | undefined}
          onScroll={onScroll}
          className="max-h-[28rem] overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-fg"
        >
          {text || "(leer)"}
        </pre>
      )}
    </section>
  );
}

// PDF-Panel: rendert ein PDF nativ im Browser (<object>) mit Fallback-Link.
function PdfPanel({ title, url, tone }: { title: string; url: string; tone: "original" | "anon" }) {
  const borderTone = tone === "anon" ? "border-status-ok/20" : "border-white/10";
  return (
    <section className={`flex flex-col rounded-lg border ${borderTone} bg-bg-panel p-3`}>
      <div className="mb-2 flex items-center gap-2 border-b border-white/10 pb-1.5">
        <Tooltip title={`PDF-Fassung: ${title}`} source={url}>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">{title}</h3>
        </Tooltip>
        <a href={url} target="_blank" rel="noopener noreferrer" className="ml-auto text-xxs text-brand hover:underline">
          Neuer Tab ↗
        </a>
      </div>
      <object data={url} type="application/pdf" className="h-[32rem] w-full rounded bg-white/5" aria-label={title}>
        <p className="py-6 text-center text-xs text-fg-muted">
          PDF kann nicht eingebettet werden.{" "}
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">
            Im neuen Tab oeffnen
          </a>
          .
        </p>
      </object>
    </section>
  );
}

export default RevisionPage;
