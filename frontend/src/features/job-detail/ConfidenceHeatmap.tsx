// Confidence-Heatmap: Canvas-Overlay ueber dem PDF.
// Zeichnet pro Wort eine farbige Bounding-Box (gruen->gelb->rot).
// Bei Native-PDFs (is_native=true) ausgegraut mit Hint.

import { useEffect, useRef } from "react";
import type { RecognizedTextPage } from "../../lib/types";

export interface ConfidenceHeatmapProps {
  /** Aktuelle Seite — typischerweise vom PdfPreview gespiegelt. */
  page: RecognizedTextPage | undefined;
  /** Skalierungsfaktor: PDF-Punkte zu Bildschirm-Pixeln. */
  scale: number;
  /** Render-Breite des Canvas in CSS-Pixeln (matched dem PdfPreview-Canvas). */
  width: number;
  /** Render-Hoehe des Canvas in CSS-Pixeln. */
  height: number;
  visible: boolean;
  /** Wenn true: Heatmap ausgegraut + Hint angezeigt. */
  isNative?: boolean;
}

function colorFor(confidence: number): string {
  if (confidence < 0.5) return "rgba(239, 68, 68, 0.45)";   // status-error
  if (confidence < 0.7) return "rgba(234, 179, 8, 0.45)";   // status-warn
  if (confidence < 0.85) return "rgba(132, 204, 22, 0.40)"; // lime
  return "rgba(34, 197, 94, 0.40)";                          // status-ok
}

export function ConfidenceHeatmap({
  page,
  scale,
  width,
  height,
  visible,
  isNative,
}: ConfidenceHeatmapProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!visible || !page || isNative) return;

    for (const w of page.words) {
      if (!w.bbox) continue;
      const [x0, y0, x1, y1] = w.bbox;
      const px0 = x0 * scale;
      const py0 = y0 * scale;
      const w0 = (x1 - x0) * scale;
      const h0 = (y1 - y0) * scale;
      ctx.fillStyle = colorFor(w.confidence);
      ctx.fillRect(px0, py0, w0, h0);
      // Duenner Rand fuer Lesbarkeit
      ctx.strokeStyle = "rgba(15, 23, 42, 0.35)";
      ctx.lineWidth = 0.5;
      ctx.strokeRect(px0, py0, w0, h0);
    }
  }, [page, scale, width, height, visible, isNative]);

  if (!visible) return null;

  return (
    <div
      data-testid="confidence-heatmap"
      className="pointer-events-none absolute inset-0"
      style={{ width, height }}
    >
      <canvas
        ref={canvasRef}
        data-testid="confidence-heatmap-canvas"
        aria-label="Confidence-Heatmap-Overlay"
        className={isNative ? "opacity-30" : ""}
        style={{ width, height }}
      />
      {isNative && (
        <div
          data-testid="confidence-heatmap-native-hint"
          className="absolute left-1/2 top-2 -translate-x-1/2 rounded bg-bg-panel/90 px-2 py-1 text-xxs text-fg-muted"
        >
          Text-Layer (kein OCR) — keine Confidence verfuegbar
        </div>
      )}
    </div>
  );
}

export default ConfidenceHeatmap;
