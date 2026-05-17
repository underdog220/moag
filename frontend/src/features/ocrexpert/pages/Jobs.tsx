// OCRexpert Jobs-Seite — Phase 1.5: OCR-Pipeline-Trigger aus MOAG.
//
// Aufbau:
//   1. Pfad-Eingabe-Card (oben): Linux-Pfad oder UNC-Pfad eingeben,
//      OCR starten, Ergebnis direkt anzeigen.
//   2. Job-Queue (unten): bestehende OCRexpert-Job-Liste (aus job-queue Feature).
//
// Datenquelle Upload-Card: POST /api/v1/ocrexpert/process
// Datenquelle Jobs: /api/v1/jobs/* (bestehende Logik)

import { useCallback, useRef, useState } from "react";
import { PageBadge } from "../../../components/PageBadge";
import { Tooltip } from "../../../components/Tooltip";
import { api } from "../../../lib/api";
import { uncToLinux, isUncPath } from "../../../lib/path_mapping";
import type { OcrexpertProcessResponse } from "../../../lib/types";
import JobQueuePage from "../../job-queue";

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

function formatDurationMs(ms: number | undefined): string {
  if (ms == null) return "–";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

// ─── ResultAnzeige ────────────────────────────────────────────────────────────

interface ProcessResult {
  data?: OcrexpertProcessResponse;
  error?: string;
  durationMs?: number;
}

function ResultPanel({ result }: { result: ProcessResult }) {
  const [expanded, setExpanded] = useState(false);
  const preRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const text = result.data ? JSON.stringify(result.data, null, 2) : result.error ?? "";
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      if (preRef.current) {
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(preRef.current);
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
  }, [result]);

  if (result.error) {
    return (
      <div
        data-testid="process-error"
        className="rounded border border-status-error/30 bg-status-error/10 px-3 py-2 text-sm text-status-error"
      >
        Fehler: {result.error}
      </div>
    );
  }

  if (!result.data) return null;

  const { n_chars, doctype, text, pfad, duration_ms } = result.data;

  return (
    <div
      data-testid="process-result"
      className="flex flex-col gap-3 rounded border border-white/10 bg-bg-panel p-4"
    >
      {/* Kennzahlen-Leiste */}
      <div className="flex flex-wrap gap-4 text-sm">
        <Tooltip
          title="Anzahl erkannter Zeichen im Dokument"
          source="/api/v1/ocrexpert/process"
          thresholds=">0 = Text erkannt"
        >
          <span className="flex items-center gap-1.5">
            <span className="text-fg-muted">Zeichen:</span>
            <span
              className={`font-semibold ${n_chars > 0 ? "text-status-ok" : "text-fg-muted"}`}
            >
              {n_chars.toLocaleString("de-DE")}
            </span>
          </span>
        </Tooltip>

        {doctype && (
          <Tooltip
            title={`Erkannter Dokumenttyp: ${doctype}`}
            source="/api/v1/ocrexpert/process"
          >
            <span className="flex items-center gap-1.5">
              <span className="text-fg-muted">Doctype:</span>
              <span className="rounded bg-brand/15 px-1.5 py-0.5 text-xs font-medium text-brand">
                {doctype}
              </span>
            </span>
          </Tooltip>
        )}

        <Tooltip
          title="Dauer des OCR-Laufs (serverseitig + Netzwerk)"
          source="/api/v1/ocrexpert/process"
        >
          <span className="flex items-center gap-1.5">
            <span className="text-fg-muted">Dauer:</span>
            <span className="text-fg">{formatDurationMs(duration_ms ?? result.durationMs)}</span>
          </span>
        </Tooltip>
      </div>

      {/* Text-Vorschau (erste 300 Zeichen) */}
      {text && (
        <div>
          <h4 className="mb-1 text-xs font-medium text-fg-muted">Text-Vorschau</h4>
          <p className="whitespace-pre-wrap rounded bg-bg-elevated px-3 py-2 font-mono text-xs text-fg-muted leading-relaxed">
            {text.slice(0, 300)}
            {text.length > 300 && (
              <span className="text-fg-subtle italic"> … ({text.length} Zeichen gesamt)</span>
            )}
          </p>
        </div>
      )}

      {/* Klappbarer Payload */}
      <div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-fg-muted transition-colors hover:text-fg"
          aria-expanded={expanded}
        >
          <span className="select-none">{expanded ? "▾" : "▸"}</span>
          Vollstaendige Response
        </button>

        {expanded && (
          <div className="relative mt-2">
            <Tooltip title="Response als JSON in die Zwischenablage kopieren (fuer KI-Diagnose)" source="/api/v1/ocrexpert/process">
              <button
                type="button"
                onClick={() => void handleCopy()}
                className="absolute right-2 top-2 rounded border border-white/10 bg-bg-elevated
                           px-2 py-0.5 text-xs text-fg-muted transition-colors hover:text-fg"
              >
                {copied ? "Kopiert!" : "Kopieren"}
              </button>
            </Tooltip>
            <pre
              ref={preRef}
              data-testid="process-payload"
              className="max-h-64 overflow-y-auto rounded border border-white/10 bg-bg-elevated
                         p-3 pt-8 font-mono text-xs text-fg-muted leading-relaxed"
            >
              {JSON.stringify(result.data, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* Quell-Pfad */}
      <p className="text-xs text-fg-subtle">
        Quelle: <code className="font-mono">{pfad}</code>
      </p>
    </div>
  );
}

// ─── Pfad-Eingabe-Card ────────────────────────────────────────────────────────

function ProcessCard() {
  const DEFAULT_PFAD = "/mnt/qnap_public/Dokumente/test.pdf";

  const [pfadInput, setPfadInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ProcessResult | null>(null);

  // UNC-Erkennung: wenn User UNC-Pfad eingibt, Button-Label anpassen
  const isUnc = isUncPath(pfadInput);
  const resolvedPfad = pfadInput.trim() ? uncToLinux(pfadInput.trim()) : DEFAULT_PFAD;

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading(true);
      setResult(null);
      const t0 = Date.now();
      try {
        const data = await api.ocrexpert.process(resolvedPfad);
        setResult({ data, durationMs: Date.now() - t0 });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setResult({ error: msg, durationMs: Date.now() - t0 });
      } finally {
        setLoading(false);
      }
    },
    [resolvedPfad],
  );

  return (
    <div className="rounded border border-white/10 bg-bg-panel p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-fg">OCR starten</h3>
        <Tooltip
          title="Startet einen synchronen OCR-Lauf. Ruft POST /api/v1/ocrexpert/process auf."
          source="/api/v1/ocrexpert/process"
          thresholds="Timeout: 60s"
        >
          <span className="text-xs text-fg-subtle cursor-help select-none">?</span>
        </Tooltip>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-3">
        {/* Pfad-Eingabe */}
        <div className="flex flex-col gap-1.5">
          <Tooltip
            title="Linux-Pfad oder Windows-UNC-Pfad zur PDF-Datei. UNC-Pfade werden automatisch konvertiert."
            source="/api/v1/ocrexpert/process"
          >
            <label className="text-xs font-medium text-fg-muted" htmlFor="ocr-pfad-input">
              Pfad zur Datei
            </label>
          </Tooltip>
          <input
            id="ocr-pfad-input"
            data-testid="ocr-pfad-input"
            type="text"
            value={pfadInput}
            onChange={(e) => setPfadInput(e.target.value)}
            placeholder={DEFAULT_PFAD}
            disabled={loading}
            className="w-full rounded border border-white/10 bg-bg-elevated px-3 py-2
                       font-mono text-xs text-fg placeholder:text-fg-subtle
                       focus:outline-none focus:ring-1 focus:ring-brand/50
                       disabled:cursor-not-allowed disabled:opacity-50"
          />
          {/* UNC-Konversions-Hinweis */}
          {isUnc && (
            <p className="text-xs text-status-ok">
              UNC erkannt — wird umgewandelt zu:{" "}
              <code className="font-mono">{resolvedPfad}</code>
            </p>
          )}
          {!pfadInput && (
            <p className="text-xs text-fg-subtle italic">
              Leer lassen fuer Default-Testpfad:{" "}
              <code className="font-mono">{DEFAULT_PFAD}</code>
            </p>
          )}
        </div>

        {/* Submit-Button */}
        <Tooltip
          title={`OCR-Lauf starten gegen: ${resolvedPfad}. Timeout: 60s.`}
          source="/api/v1/ocrexpert/process"
        >
          <button
            type="submit"
            data-testid="ocr-start-button"
            disabled={loading}
            className="self-start rounded border border-brand/40 bg-brand/10 px-4 py-2
                       text-sm font-medium text-brand transition-colors
                       hover:bg-brand/20 hover:border-brand/60
                       disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "OCR laeuft…" : "OCR starten"}
          </button>
        </Tooltip>
      </form>

      {/* Ergebnis-Bereich */}
      {result && (
        <div className="mt-4">
          <ResultPanel result={result} />
        </div>
      )}
    </div>
  );
}

// ─── Jobs-Page ────────────────────────────────────────────────────────────────

export function JobsPage() {
  return (
    <div className="flex flex-col gap-6 p-4">
      {/* Upload-/Process-Card */}
      <ProcessCard />

      {/* Bestehende Job-Queue */}
      <div>
        <h3 className="mb-3 text-sm font-medium text-fg-muted">
          Job-Queue
        </h3>
        <JobQueuePage />
      </div>

      <PageBadge id="ocrexpert.jobs" />
    </div>
  );
}

export default JobsPage;
