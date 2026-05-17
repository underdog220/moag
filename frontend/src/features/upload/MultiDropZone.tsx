// MultiDropZone — große Drop-Zone oben auf der Upload-Hub-Page.
// Erkennt MIME aus abgelegten Dateien, schlägt kompatible Operations vor.
// Klick auf Operation-Button scrollt zur entsprechenden OperationCard.

import { useState } from "react";
import {
  compatibleOperations,
  detectMime,
  formatBytes,
} from "../../lib/uploadOperations";
import type { UploadOperation } from "../../lib/uploadOperations";

/** Eine erkannte Datei mit ihren möglichen Operations. */
interface DroppedFile {
  file: File;
  mime: string;
  ops: UploadOperation[];
}

export interface MultiDropZoneProps {
  /**
   * Callback: Nutzer hat eine Operation für eine Datei ausgewählt.
   * Die Host-Page kann damit die entsprechende OperationCard befüllen.
   */
  onOperationSelect?: (file: File, operation: UploadOperation) => void;
}

// Kategorie → Farbe (identisch zu OperationCard)
const CATEGORY_COLOR: Record<UploadOperation["category"], string> = {
  ocr:   "border-brand/40 bg-brand/10 text-brand hover:bg-brand/20",
  llm:   "border-status-ok/40 bg-status-ok/10 text-status-ok hover:bg-status-ok/20",
  audio: "border-status-warn/40 bg-status-warn/10 text-status-warn hover:bg-status-warn/20",
  dsgvo: "border-status-error/40 bg-status-error/10 text-status-error hover:bg-status-error/20",
  pdf:   "border-fg-subtle/30 bg-fg-subtle/10 text-fg-muted hover:bg-fg-subtle/20",
};

export function MultiDropZone({ onOperationSelect }: MultiDropZoneProps) {
  const [dragging, setDragging] = useState(false);
  const [dropped, setDropped] = useState<DroppedFile[]>([]);

  function processFiles(incoming: File[]) {
    const entries: DroppedFile[] = incoming.map((file) => {
      const mime = detectMime(file);
      const ops = compatibleOperations(mime);
      return { file, mime, ops };
    });
    setDropped((prev) => [...prev, ...entries]);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    processFiles(Array.from(e.dataTransfer.files));
  }

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) {
      processFiles(Array.from(e.target.files));
    }
  }

  function handleOperationClick(entry: DroppedFile, op: UploadOperation) {
    // Zur entsprechenden OperationCard scrollen
    const cardEl = document.getElementById(`op-card-${op.id}`);
    if (cardEl) {
      cardEl.scrollIntoView({ behavior: "smooth", block: "center" });
      // Kurz highlighten (Outline)
      cardEl.style.outline = "2px solid var(--color-brand)";
      setTimeout(() => { cardEl.style.outline = ""; }, 1500);
    }
    onOperationSelect?.(entry.file, op);
  }

  function removeEntry(idx: number) {
    setDropped((prev) => prev.filter((_, i) => i !== idx));
  }

  function clearAll() {
    setDropped([]);
  }

  return (
    <div data-testid="multi-drop-zone" className="mb-8">
      {/* Haupt-Drop-Fläche */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`relative flex flex-col items-center justify-center rounded-xl
                    border-2 border-dashed px-6 py-10 text-center transition-colors
                    ${dragging
                      ? "border-brand bg-brand/10"
                      : "border-white/15 bg-bg-elevated hover:border-white/25"
                    }`}
        aria-label="Dateien hier ablegen oder auswählen"
      >
        {/* Icon */}
        <div className="mb-3 text-4xl text-fg-subtle" aria-hidden="true">
          ↑
        </div>
        <h2 className="text-base font-semibold text-fg">
          Datei(en) ablegen
        </h2>
        <p className="mt-1 text-sm text-fg-muted">
          oder{" "}
          <label
            className="cursor-pointer text-brand underline underline-offset-2
                       hover:text-brand/80 transition-colors"
          >
            Dateien auswählen
            <input
              type="file"
              multiple
              className="hidden"
              data-testid="multi-drop-input"
              onChange={handleInput}
            />
          </label>
        </p>
        <p className="mt-2 text-xs text-fg-subtle">
          Alle Formate · Max. 200 MB pro Datei · MOAG erkennt kompatible Operationen
        </p>
      </div>

      {/* Ergebnis-Liste der erkannten Dateien */}
      {dropped.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-medium text-fg">
              {dropped.length} Datei{dropped.length > 1 ? "en" : ""} erkannt
            </h3>
            <button
              type="button"
              onClick={clearAll}
              className="text-xs text-fg-subtle hover:text-fg-muted transition-colors"
            >
              Alle entfernen
            </button>
          </div>

          <div className="flex flex-col gap-3">
            {dropped.map((entry, idx) => (
              <div
                key={`${entry.file.name}-${idx}`}
                data-testid={`multi-drop-entry-${idx}`}
                className="rounded-lg border border-white/10 bg-bg-panel p-3"
              >
                {/* Datei-Header */}
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-fg">
                      {entry.file.name}
                    </p>
                    <p className="text-xxs text-fg-subtle">
                      {formatBytes(entry.file.size)} · {entry.mime}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeEntry(idx)}
                    className="shrink-0 text-fg-subtle hover:text-status-error
                               focus:outline-none transition-colors"
                    aria-label={`${entry.file.name} entfernen`}
                  >
                    ✕
                  </button>
                </div>

                {/* Kompatible Operations */}
                {entry.ops.length > 0 ? (
                  <div>
                    <p className="mb-1.5 text-xxs text-fg-muted">
                      Kompatible Operationen:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {entry.ops.map((op) => (
                        <button
                          key={op.id}
                          type="button"
                          data-testid={`multi-op-btn-${idx}-${op.id}`}
                          onClick={() => handleOperationClick(entry, op)}
                          className={`rounded border px-2 py-1 text-xxs font-medium
                                      transition-colors cursor-pointer
                                      ${CATEGORY_COLOR[op.category]}`}
                          title={op.description}
                        >
                          {op.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-xxs text-fg-subtle italic">
                    Kein kompatibles Format — bitte spezifisch in einer Operation ablegen.
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default MultiDropZone;
