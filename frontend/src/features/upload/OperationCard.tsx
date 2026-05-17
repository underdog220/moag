// OperationCard — spezialisierte Karte für eine einzelne Upload-Operation.
// Jede der 10 Operationen bekommt eine eigene Instanz dieser Karte.

import { useRef, useState } from "react";
import type { UploadOperation } from "../../lib/uploadOperations";
import { acceptString, formatBytes } from "../../lib/uploadOperations";
import type { UploadResult } from "../../lib/types";
import { api } from "../../lib/api";
import { Tooltip } from "../../components/Tooltip";
import { ParamsForm, type UploadParams } from "./ParamsForm";
import { ResultPanel } from "./ResultPanel";

// Kategorie → Badge-Farbe
const CATEGORY_COLOR: Record<UploadOperation["category"], string> = {
  ocr:   "bg-brand/15 text-brand border-brand/30",
  llm:   "bg-status-ok/15 text-status-ok border-status-ok/30",
  audio: "bg-status-warn/15 text-status-warn border-status-warn/30",
  dsgvo: "bg-status-error/15 text-status-error border-status-error/30",
  pdf:   "bg-fg-subtle/15 text-fg-muted border-fg-subtle/30",
};

// System → lesbares Label
const SYSTEM_LABEL: Record<UploadOperation["system"], string> = {
  ocrexpert: "OCRexpert",
  oberon:    "Oberon",
  octoboss:  "OctoBoss",
};

export interface OperationCardProps {
  operation: UploadOperation;
  /** Wenn gesetzt, wird diese Datei vorbelegt (aus MultiDropZone-Auswahl). */
  preloadedFile?: File | null;
  /** Ref-Callback damit MultiDropZone zum Card-Element scrollen kann. */
  cardRef?: (el: HTMLElement | null) => void;
}

export function OperationCard({
  operation,
  preloadedFile,
  cardRef,
}: OperationCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>(
    preloadedFile ? [preloadedFile] : [],
  );
  const [params, setParams] = useState<UploadParams>({
    engine: operation.requires_engine_choice?.[0],
  });
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Pflicht-Params prüfen: Senden deaktiviert wenn Prompt fehlt
  const missingPrompt = operation.requires_prompt && !params.prompt?.trim();
  const canSend = files.length > 0 && !missingPrompt && !uploading;

  function handleFiles(incoming: File[]) {
    const accepted = incoming.filter((f) =>
      operation.accepted_mimes.includes(
        f.type || "application/octet-stream",
      ),
    );
    if (accepted.length === 0) return;
    setFiles((prev) => [...prev, ...accepted]);
    setResult(null);
    setUploadError(null);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    handleFiles(Array.from(e.dataTransfer.files));
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) {
      handleFiles(Array.from(e.target.files));
    }
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSend() {
    if (!canSend) return;
    setUploading(true);
    setResult(null);
    setUploadError(null);
    try {
      // Für Multi-File: aktuell nur erste Datei (V1-Scope)
      const res = await api.upload.submit(files[0], operation.id, params as Record<string, unknown>);
      setResult(res);
    } catch (err) {
      setUploadError((err as Error).message ?? "Unbekannter Fehler");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div
      id={`op-card-${operation.id}`}
      ref={cardRef}
      data-testid={`operation-card-${operation.id}`}
      className="flex flex-col rounded-lg border border-white/10 bg-bg-panel p-4"
    >
      {/* Header */}
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-fg">{operation.name}</h3>
          <p className="mt-0.5 text-xxs text-fg-subtle">
            {SYSTEM_LABEL[operation.system]}
          </p>
        </div>
        <span
          className={`shrink-0 rounded border px-1.5 py-0.5 text-xxs font-medium
                      ${CATEGORY_COLOR[operation.category]}`}
        >
          {operation.category.toUpperCase()}
        </span>
      </div>

      {/* Beschreibung */}
      <p className="mb-3 text-xs text-fg-muted leading-relaxed">
        {operation.description}
      </p>

      {/* Akzeptierte Formate als Badge-Reihe */}
      <div className="mb-3 flex flex-wrap gap-1">
        {operation.accepted_mimes.map((mime) => {
          const ext = mime.split("/")[1] ?? mime;
          return (
            <span
              key={mime}
              className="rounded border border-white/10 bg-bg-elevated px-1.5 py-0.5
                         text-xxs text-fg-muted"
            >
              .{ext.replace("vnd.openxmlformats-officedocument.wordprocessingml.document", "docx")}
            </span>
          );
        })}
        <span className="rounded border border-white/5 bg-bg-elevated px-1.5 py-0.5
                         text-xxs text-fg-subtle">
          ~{operation.estimated_duration_s}s
        </span>
      </div>

      {/* Drop-Zone */}
      <div
        data-testid={`drop-zone-${operation.id}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`mb-3 flex cursor-pointer flex-col items-center justify-center
                    rounded-lg border-2 border-dashed px-3 py-4 text-center
                    transition-colors min-h-[72px]
                    ${dragging
                      ? "border-brand bg-brand/10"
                      : "border-white/15 bg-bg-elevated hover:border-white/30"
                    }`}
        aria-label={`Datei ablegen für ${operation.name}`}
      >
        <span className="text-xs text-fg-muted">
          {files.length === 0
            ? "Datei ablegen oder klicken"
            : `${files.length} Datei${files.length > 1 ? "en" : ""} ausgewählt`}
        </span>
        <span className="mt-0.5 text-xxs text-fg-subtle">
          Max. 200 MB · {operation.accepted_mimes
            .map((m) => `.${m.split("/")[1]}`)
            .join(", ")}
        </span>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={acceptString(operation)}
          className="hidden"
          data-testid={`file-input-${operation.id}`}
          onChange={handleInputChange}
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      {/* Datei-Liste */}
      {files.length > 0 && (
        <ul className="mb-3 flex flex-col gap-1" data-testid={`file-list-${operation.id}`}>
          {files.map((f, idx) => (
            <li
              key={`${f.name}-${idx}`}
              className="flex items-center justify-between gap-2 rounded border
                         border-white/10 bg-bg-elevated px-2 py-1.5 text-xxs"
            >
              <span className="truncate text-fg">{f.name}</span>
              <span className="shrink-0 text-fg-muted">{formatBytes(f.size)}</span>
              <button
                type="button"
                onClick={() => removeFile(idx)}
                className="shrink-0 text-fg-subtle hover:text-status-error
                           focus:outline-none transition-colors"
                aria-label={`${f.name} entfernen`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Params-Formular */}
      <div className="mb-3">
        <ParamsForm operation={operation} params={params} onChange={setParams} />
      </div>

      {/* Upload-Fehler */}
      {uploadError && (
        <div
          data-testid={`upload-error-${operation.id}`}
          className="mb-3 rounded border border-status-error/30 bg-status-error/10
                     px-3 py-2 text-xs text-status-error"
        >
          {uploadError}
        </div>
      )}

      {/* Ergebnis */}
      {result && <ResultPanel result={result} />}

      {/* Senden-Button */}
      <div className="mt-auto pt-2">
        <Tooltip
          title={
            !canSend && files.length === 0
              ? "Bitte zuerst eine Datei auswählen"
              : missingPrompt
                ? "Prompt ist Pflichtfeld für diese Operation"
                : uploading
                  ? "Wird verarbeitet…"
                  : `${operation.name} jetzt starten`
          }
          source={`POST /api/v1/upload?operation=${operation.id}`}
          updatedAt={`Geschätzte Dauer: ~${operation.estimated_duration_s}s`}
          position="top"
        >
          <button
            type="button"
            data-testid={`send-btn-${operation.id}`}
            disabled={!canSend}
            onClick={() => void handleSend()}
            aria-busy={uploading}
            className={`w-full rounded-lg px-4 py-3 text-sm font-medium transition-colors
                        min-h-[44px] focus:outline-none focus:ring-2 ${
                          !canSend
                            ? "cursor-not-allowed bg-bg-elevated text-fg-subtle"
                            : "bg-brand text-white hover:bg-brand/80 focus:ring-brand/60"
                        }`}
          >
            {uploading ? (
              <span className="inline-flex items-center justify-center gap-1.5">
                <span
                  className="h-3 w-3 animate-spin rounded-full border-2
                             border-white/30 border-t-white"
                  aria-hidden="true"
                />
                Wird gesendet…
              </span>
            ) : (
              "Senden"
            )}
          </button>
        </Tooltip>
      </div>
    </div>
  );
}

export default OperationCard;
