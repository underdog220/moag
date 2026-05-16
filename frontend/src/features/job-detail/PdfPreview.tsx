// PdfPreview: pdf.js-basierter Viewer mit Page-Navigation, Zoom, Lazy-Load.
// Performance-Caveat: max. 2 Seiten gleichzeitig im Speicher, cleanup() bei Job-Wechsel.

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import * as pdfjsLib from "pdfjs-dist";
// Worker als Browser-URL aus dem npm-Bundle ziehen (Vite-konform).
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

if (typeof window !== "undefined" && pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}

export interface PdfPreviewHandle {
  /** Seite anspringen (1-basiert). Wenn bbox uebergeben, wird zur Box gescrollt. */
  goToPage: (page: number, bbox?: [number, number, number, number]) => void;
  /** Aktuelle Seitenmasse in Punkten (fuer Heatmap-Skalierung). */
  getPageSize: () => { width: number; height: number; scale: number } | null;
}

export interface PdfPreviewProps {
  /** URL fuer pdf.js (entweder vom Backend oder Mock). Bei null wird Empty-State angezeigt. */
  url: string | null;
  /** Wird beim Seitenwechsel oder Load aufgerufen — fuer Heatmap-Sync. */
  onPageChange?: (page: number, total: number) => void;
  /** Wird mit dem aktuell gerenderten Canvas-Layout aufgerufen. */
  onLayoutChange?: (info: { width: number; height: number; scale: number }) => void;
  /** Optionaler Mock-Modus: zeigt Pseudo-Seiten ohne pdf.js zu laden. */
  mock?: boolean;
  /** Erwartete Seitenzahl im Mock-Modus. Default 1. */
  mockPageCount?: number;
}

type PdfDocument = Awaited<ReturnType<typeof pdfjsLib.getDocument>["promise"]>;
type PdfPage = Awaited<ReturnType<PdfDocument["getPage"]>>;

const MAX_LIVE_PAGES = 2;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.5;
const ZOOM_STEP = 0.25;
const BASE_SCALE = 1.2;

export const PdfPreview = forwardRef<PdfPreviewHandle, PdfPreviewProps>(function PdfPreview(
  { url, onPageChange, onLayoutChange, mock, mockPageCount = 1 },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const docRef = useRef<PdfDocument | null>(null);
  const pageCacheRef = useRef<Map<number, PdfPage>>(new Map());
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);
  const [pageNo, setPageNo] = useState(1);
  const [pageTotal, setPageTotal] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Aktuelle Seitenmasse (fuer Heatmap)
  const layoutRef = useRef<{ width: number; height: number; scale: number } | null>(null);

  const cleanup = useCallback(() => {
    // Render-Task abbrechen, Page-Cache leeren, Doc destroy.
    try {
      renderTaskRef.current?.cancel?.();
    } catch {
      // ignore
    }
    renderTaskRef.current = null;
    for (const p of pageCacheRef.current.values()) {
      try {
        (p as { cleanup?: () => void }).cleanup?.();
      } catch {
        // ignore
      }
    }
    pageCacheRef.current.clear();
    if (docRef.current) {
      try {
        (docRef.current as { cleanup?: () => void }).cleanup?.();
        (docRef.current as { destroy?: () => void }).destroy?.();
      } catch {
        // ignore
      }
      docRef.current = null;
    }
  }, []);

  // Doc laden / wechseln
  useEffect(() => {
    cleanup();
    setError(null);
    setPageNo(1);
    if (!url) {
      setPageTotal(0);
      return;
    }
    if (mock) {
      setPageTotal(Math.max(1, mockPageCount));
      onPageChange?.(1, Math.max(1, mockPageCount));
      return;
    }

    let aborted = false;
    setLoading(true);
    const task = pdfjsLib.getDocument({ url });
    task.promise
      .then((doc) => {
        if (aborted) {
          (doc as { destroy?: () => void }).destroy?.();
          return;
        }
        docRef.current = doc;
        setPageTotal(doc.numPages);
        onPageChange?.(1, doc.numPages);
      })
      .catch((e: Error) => {
        if (aborted) return;
        setError(`PDF-Lade-Fehler: ${e.message}`);
      })
      .finally(() => {
        if (!aborted) setLoading(false);
      });

    return () => {
      aborted = true;
      try {
        task.destroy();
      } catch {
        // ignore
      }
      cleanup();
    };
  }, [url, mock, mockPageCount, cleanup, onPageChange]);

  // Seite rendern wenn pageNo / zoom / doc sich aendert
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (mock) {
      // Mock-Seite: einfaches Rechteck mit Page-Nummer
      const cssWidth = 595 * BASE_SCALE * zoom;
      const cssHeight = 842 * BASE_SCALE * zoom;
      canvas.width = Math.round(cssWidth);
      canvas.height = Math.round(cssHeight);
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "16px monospace";
      ctx.fillText(`(Mock-PDF) Seite ${pageNo}/${pageTotal}`, 24, 32);
      const layout = {
        width: cssWidth,
        height: cssHeight,
        scale: BASE_SCALE * zoom,
      };
      layoutRef.current = layout;
      onLayoutChange?.(layout);
      return;
    }

    const doc = docRef.current;
    if (!doc) return;

    let cancelled = false;
    (async () => {
      try {
        let page = pageCacheRef.current.get(pageNo);
        if (!page) {
          page = await doc.getPage(pageNo);
          if (cancelled) {
            (page as { cleanup?: () => void }).cleanup?.();
            return;
          }
          pageCacheRef.current.set(pageNo, page);
          // LRU-Eviction: max MAX_LIVE_PAGES gleichzeitig im Speicher
          if (pageCacheRef.current.size > MAX_LIVE_PAGES) {
            const firstKey = pageCacheRef.current.keys().next().value;
            if (firstKey !== undefined && firstKey !== pageNo) {
              const evict = pageCacheRef.current.get(firstKey);
              try {
                (evict as { cleanup?: () => void } | undefined)?.cleanup?.();
              } catch {
                // ignore
              }
              pageCacheRef.current.delete(firstKey);
            }
          }
        }

        const scale = BASE_SCALE * zoom;
        const viewport = page.getViewport({ scale });
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        const renderContext = { canvasContext: ctx, viewport };
        const task = page.render(renderContext);
        renderTaskRef.current = task as unknown as { cancel: () => void };
        await task.promise;
        if (cancelled) return;
        const layout = {
          width: viewport.width,
          height: viewport.height,
          scale,
        };
        layoutRef.current = layout;
        onLayoutChange?.(layout);
      } catch (e) {
        if (cancelled) return;
        const err = e as Error & { name?: string };
        if (err.name === "RenderingCancelledException") return;
        setError(`Render-Fehler: ${err.message}`);
      }
    })();

    return () => {
      cancelled = true;
      try {
        renderTaskRef.current?.cancel?.();
      } catch {
        // ignore
      }
    };
  }, [pageNo, zoom, mock, pageTotal, onLayoutChange]);

  // Cleanup beim Unmount
  useEffect(() => () => cleanup(), [cleanup]);

  useImperativeHandle(
    ref,
    () => ({
      goToPage: (page) => {
        if (page < 1 || (pageTotal > 0 && page > pageTotal)) return;
        setPageNo(page);
      },
      getPageSize: () => layoutRef.current,
    }),
    [pageTotal],
  );

  const goPrev = () => setPageNo((n) => Math.max(1, n - 1));
  const goNext = () => setPageNo((n) => (pageTotal > 0 ? Math.min(pageTotal, n + 1) : n + 1));
  const zoomIn = () => setZoom((z) => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)));
  const zoomOut = () => setZoom((z) => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)));
  const zoomReset = () => setZoom(1);

  // pageNo-Wechsel publizieren
  useEffect(() => {
    if (pageTotal > 0) onPageChange?.(pageNo, pageTotal);
  }, [pageNo, pageTotal, onPageChange]);

  return (
    <div data-testid="pdf-preview" className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-xs">
        <button
          type="button"
          onClick={goPrev}
          disabled={pageNo <= 1}
          className="rounded border border-white/10 px-2 py-1 text-fg disabled:opacity-30"
          data-testid="pdf-prev"
          aria-label="Vorherige Seite"
        >
          &lsaquo; Vor
        </button>
        <span data-testid="pdf-page-indicator" className="font-mono text-fg-muted">
          {pageNo} / {pageTotal || "?"}
        </span>
        <button
          type="button"
          onClick={goNext}
          disabled={pageTotal > 0 && pageNo >= pageTotal}
          className="rounded border border-white/10 px-2 py-1 text-fg disabled:opacity-30"
          data-testid="pdf-next"
          aria-label="Naechste Seite"
        >
          Naechste &rsaquo;
        </button>
        <span className="mx-2 h-4 border-l border-white/10" aria-hidden />
        <button
          type="button"
          onClick={zoomOut}
          disabled={zoom <= ZOOM_MIN}
          className="rounded border border-white/10 px-2 py-1 text-fg disabled:opacity-30"
          data-testid="pdf-zoom-out"
          aria-label="Hineinzoomen"
        >
          &minus;
        </button>
        <button
          type="button"
          onClick={zoomReset}
          className="rounded border border-white/10 px-2 py-1 font-mono text-fg-muted"
          data-testid="pdf-zoom-reset"
          aria-label="Zoom zuruecksetzen"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          onClick={zoomIn}
          disabled={zoom >= ZOOM_MAX}
          className="rounded border border-white/10 px-2 py-1 text-fg disabled:opacity-30"
          data-testid="pdf-zoom-in"
          aria-label="Herauszoomen"
        >
          +
        </button>
        {loading && (
          <span data-testid="pdf-loading" className="text-fg-muted">
            laedt ...
          </span>
        )}
      </div>
      {error && (
        <div
          data-testid="pdf-error"
          role="alert"
          className="rounded border border-status-error/40 bg-status-error/10 p-2 text-xs text-status-error"
        >
          {error}
        </div>
      )}
      {!url && (
        <div
          data-testid="pdf-empty"
          className="rounded border border-dashed border-white/10 p-6 text-center text-sm text-fg-muted"
        >
          Kein PDF ausgewaehlt.
        </div>
      )}
      <div className="relative inline-block max-w-full overflow-auto">
        <canvas
          ref={canvasRef}
          data-testid="pdf-canvas"
          className="block bg-white shadow"
          aria-label={`PDF-Vorschau Seite ${pageNo}`}
        />
        {/* Heatmap wird vom Container daruebergelegt — siehe JobDetailPanel */}
      </div>
    </div>
  );
});

export default PdfPreview;
