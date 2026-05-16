// RecognizedText: Wort-Liste mit Confidence-Tooltip.
// Faerbung: <0.5 rot, <0.7 gelb, sonst Standardfarbe.

import { formatConfidence } from "../../lib/format";
import type { RecognizedTextDocument, RecognizedTextPage } from "../../lib/types";

export interface RecognizedTextProps {
  doc: RecognizedTextDocument | undefined;
  /** Falls gesetzt: nur diese Seite anzeigen. Sonst alle. */
  page?: number;
  onWordClick?: (page: number, bbox: [number, number, number, number] | undefined) => void;
}

function classForConfidence(c: number): string {
  if (c < 0.5) return "bg-status-error/30 text-status-error";
  if (c < 0.7) return "bg-status-warn/25 text-status-warn";
  return "text-fg";
}

function PageBlock({
  page,
  onWordClick,
}: {
  page: RecognizedTextPage;
  onWordClick?: RecognizedTextProps["onWordClick"];
}) {
  return (
    <div data-testid={`recognized-page-${page.page}`} className="flex flex-col gap-1">
      <div className="text-xxs uppercase text-fg-muted">Seite {page.page}</div>
      <div className="flex flex-wrap gap-1">
        {page.words.map((w, idx) => (
          <button
            key={`${page.page}-${idx}-${w.text}`}
            type="button"
            data-testid={`recognized-word-${page.page}-${idx}`}
            data-confidence={w.confidence.toFixed(2)}
            title={`Konfidenz: ${formatConfidence(w.confidence)}`}
            aria-label={`${w.text} (Konfidenz ${formatConfidence(w.confidence)})`}
            onClick={() => onWordClick?.(page.page, w.bbox)}
            className={`rounded px-1 py-0.5 font-mono text-xs leading-relaxed transition-colors
                        hover:underline focus:outline-none focus:ring-1 focus:ring-brand
                        ${classForConfidence(w.confidence)}`}
          >
            {w.text}
          </button>
        ))}
      </div>
    </div>
  );
}

export function RecognizedText({ doc, page, onWordClick }: RecognizedTextProps) {
  if (!doc) {
    return (
      <div
        data-testid="recognized-text-empty"
        className="rounded border border-dashed border-white/10 p-4 text-center text-sm text-fg-muted"
      >
        Erkannter Text wird geladen ...
      </div>
    );
  }
  const pages = page != null ? doc.pages.filter((p) => p.page === page) : doc.pages;

  if (pages.length === 0) {
    return (
      <div
        data-testid="recognized-text-empty"
        className="rounded border border-dashed border-white/10 p-4 text-center text-sm text-fg-muted"
      >
        Kein Text auf dieser Seite.
      </div>
    );
  }

  return (
    <div data-testid="recognized-text" className="flex flex-col gap-4">
      {doc.is_native && (
        <div
          data-testid="native-pdf-hint"
          className="rounded border border-status-info/30 bg-status-info/10 px-3 py-2 text-xs text-status-info"
        >
          Native PDF — Text-Layer ohne OCR-Confidence (alle Werte 100%).
        </div>
      )}
      {pages.map((p) => (
        <PageBlock key={p.page} page={p} onWordClick={onWordClick} />
      ))}
    </div>
  );
}

export default RecognizedText;
