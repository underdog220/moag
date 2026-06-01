// OcrUploadPage — echter Datei-Upload an OCRexpert (multipart/form-data).
//
// MOAG-Backlog Phase 1.5b: ersetzt die alte Pfad-Eingabe (JSON {pfad}) durch
// einen echten File-Upload. Datenquelle: POST /api/v1/ocrexpert/upload.
//
// ADR-004: jeder Button / jede Zahl traegt einen <Tooltip> mit Datenquelle.
// PageBadge unten rechts (Pflicht globale CLAUDE.md).

import { useCallback, useRef, useState } from "react";
import { PageBadge } from "../../components/PageBadge";
import { Tooltip } from "../../components/Tooltip";
import {
  OCR_UPLOAD_ENDPOINT,
  uploadForOcr,
  type OcrUploadParams,
  type OcrUploadResponse,
} from "./ocrUploadApi";

// Lokale Byte-Formatierung (kein lib-Import — Parallel-Agent-Konfliktvermeidung).
function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const ALLOWED_HINT = "PDF, PNG, JPG, TIFF · max. 200 MB";

export function OcrUploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<OcrUploadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Verarbeitungs-Parameter
  const [output, setOutput] = useState<"raw" | "pdfa">("raw");
  const [profile, setProfile] = useState("generic");
  const [language, setLanguage] = useState("deu+eng");

  const inputRef = useRef<HTMLInputElement>(null);

  const pickFile = useCallback((f: File | null) => {
    setFile(f);
    setResult(null);
    setError(null);
  }, []);

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    pickFile(f);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0] ?? null;
    pickFile(f);
  }

  async function handleProcess() {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    const params: OcrUploadParams = { output, profile, language };
    try {
      const resp = await uploadForOcr(file, params);
      setResult(resp);
      if (!resp.ok) {
        setError(resp.error ?? "Unbekannter Fehler bei der Verarbeitung.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const ocrText = result?.ok ? result.result?.text ?? "" : "";

  return (
    <div className="min-h-full p-4 pb-16" data-testid="ocr-upload-page">
      {/* Header */}
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-fg">OCRexpert — Datei-Upload</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Datei direkt hochladen und per OCRexpert verarbeiten lassen (echter
          multipart-Upload statt Server-Pfad).
        </p>
      </header>

      {/* Drop-Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`relative mb-4 flex flex-col items-center justify-center rounded-xl
                    border-2 border-dashed px-6 py-10 text-center transition-colors
                    ${
                      dragging
                        ? "border-brand bg-brand/10"
                        : "border-white/15 bg-bg-elevated hover:border-white/25"
                    }`}
        aria-label="Datei hier ablegen oder auswählen"
      >
        <div className="mb-3 text-4xl text-fg-subtle" aria-hidden="true">
          ↑
        </div>
        <h2 className="text-base font-semibold text-fg">Datei ablegen</h2>
        <p className="mt-1 text-sm text-fg-muted">
          oder{" "}
          <label className="cursor-pointer text-brand underline underline-offset-2 hover:text-brand/80 transition-colors">
            Datei auswählen
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff"
              className="hidden"
              data-testid="ocr-upload-input"
              onChange={handleInput}
            />
          </label>
        </p>
        <p className="mt-2 text-xs text-fg-subtle">{ALLOWED_HINT}</p>
      </div>

      {/* Ausgewählte Datei */}
      {file && (
        <div
          className="mb-4 flex items-center justify-between rounded-lg border border-white/10 bg-bg-panel p-3"
          data-testid="ocr-upload-selected"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-fg">{file.name}</p>
            <p className="text-xxs text-fg-subtle">
              {formatBytes(file.size)} · {file.type || "unbekannter Typ"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => pickFile(null)}
            className="shrink-0 text-fg-subtle hover:text-status-error transition-colors"
            aria-label="Datei entfernen"
          >
            ✕
          </button>
        </div>
      )}

      {/* Parameter */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs text-fg-muted">
          <Tooltip
            title="Ausgabeformat der OCR-Verarbeitung."
            source={OCR_UPLOAD_ENDPOINT}
            thresholds="raw = nur Text · pdfa = durchsuchbares PDF/A"
          >
            <span className="cursor-help underline decoration-dotted">Ausgabe</span>
          </Tooltip>
          <select
            data-testid="ocr-upload-output"
            value={output}
            onChange={(e) => setOutput(e.target.value as "raw" | "pdfa")}
            className="rounded border border-white/10 bg-bg-elevated px-2 py-1.5 text-sm text-fg"
          >
            <option value="raw">raw (nur Text)</option>
            <option value="pdfa">pdfa (PDF/A)</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-fg-muted">
          <Tooltip
            title="Doctype-Profil für OCRexpert."
            source={OCR_UPLOAD_ENDPOINT}
          >
            <span className="cursor-help underline decoration-dotted">Profil</span>
          </Tooltip>
          <input
            data-testid="ocr-upload-profile"
            value={profile}
            onChange={(e) => setProfile(e.target.value)}
            className="rounded border border-white/10 bg-bg-elevated px-2 py-1.5 text-sm text-fg"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-fg-muted">
          <Tooltip
            title="Tesseract-Sprachpaket (z.B. deu+eng)."
            source={OCR_UPLOAD_ENDPOINT}
          >
            <span className="cursor-help underline decoration-dotted">Sprache</span>
          </Tooltip>
          <input
            data-testid="ocr-upload-language"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="rounded border border-white/10 bg-bg-elevated px-2 py-1.5 text-sm text-fg"
          />
        </label>
      </div>

      {/* Verarbeiten-Button */}
      <div className="mb-6">
        <Tooltip
          title="Lädt die Datei als multipart/form-data hoch und startet die OCRexpert-Verarbeitung."
          source={`POST ${OCR_UPLOAD_ENDPOINT}`}
        >
          <button
            type="button"
            data-testid="ocr-upload-submit"
            disabled={!file || busy}
            onClick={handleProcess}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors
                        ${
                          !file || busy
                            ? "cursor-not-allowed bg-bg-elevated text-fg-subtle"
                            : "cursor-pointer bg-brand text-white hover:bg-brand/90"
                        }`}
          >
            {busy ? "Verarbeite…" : "Verarbeiten"}
          </button>
        </Tooltip>
      </div>

      {/* Lade-State */}
      {busy && (
        <div
          className="mb-4 rounded-lg border border-white/10 bg-bg-panel p-4 text-sm text-fg-muted"
          data-testid="ocr-upload-loading"
        >
          Datei wird hochgeladen und verarbeitet — das kann je nach Seitenzahl
          dauern…
        </div>
      )}

      {/* Fehler-Anzeige */}
      {error && (
        <div
          className="mb-4 rounded-lg border border-status-error/30 bg-status-error/10 p-4 text-sm text-status-error"
          data-testid="ocr-upload-error"
          role="alert"
        >
          <p className="font-semibold">Verarbeitung fehlgeschlagen</p>
          <p className="mt-1 break-words">{error}</p>
          {result?.upstream_status != null && (
            <p className="mt-1 text-xxs opacity-80">
              OCRexpert-Status: HTTP {result.upstream_status}
            </p>
          )}
        </div>
      )}

      {/* Ergebnis-Anzeige */}
      {result?.ok && (
        <div
          className="mb-4 rounded-lg border border-status-ok/20 bg-bg-panel p-4"
          data-testid="ocr-upload-result"
        >
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <span className="rounded border border-status-ok/30 bg-status-ok/10 px-2 py-0.5 text-xs font-medium text-status-ok">
              {result.result?.status ?? "ok"}
            </span>
            <Tooltip
              title="Anzahl verarbeiteter Seiten (aus OCRexpert-Antwort)."
              source={OCR_UPLOAD_ENDPOINT}
            >
              <span className="cursor-help text-xs text-fg-muted">
                {result.result?.pages ?? 0} Seite(n)
              </span>
            </Tooltip>
            <Tooltip
              title="Verarbeitungsdauer (vom MOAG-Backend gemessen)."
              source={OCR_UPLOAD_ENDPOINT}
            >
              <span className="cursor-help text-xs text-fg-muted">
                {result.duration_ms ?? result.result?.duration_ms ?? 0} ms
              </span>
            </Tooltip>
            {result.result?.quality && (
              <Tooltip
                title="OCR-Qualitäts-Gate von OCRexpert."
                source={OCR_UPLOAD_ENDPOINT}
                thresholds="passed = Text freigegeben · sonst quality_gate_failed"
              >
                <span className="cursor-help text-xs text-fg-muted">
                  Qualität {(result.result.quality.score * 100).toFixed(0)}%
                  {result.result.quality.passed ? " ✓" : " ⚠"}
                </span>
              </Tooltip>
            )}
          </div>

          {ocrText ? (
            <pre
              className="max-h-96 overflow-auto whitespace-pre-wrap rounded border border-white/10 bg-bg-elevated p-3 text-xs text-fg"
              data-testid="ocr-upload-text"
            >
              {ocrText}
            </pre>
          ) : (
            <p className="text-sm text-fg-muted" data-testid="ocr-upload-notext">
              Kein Text in der Antwort (möglicherweise Quality-Gate nicht
              bestanden oder PDF/A-Modus).
            </p>
          )}
        </div>
      )}

      <PageBadge id="ocr-upload" />
    </div>
  );
}

export default OcrUploadPage;
