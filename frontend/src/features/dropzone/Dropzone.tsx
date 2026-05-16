// Dropzone — Drag-and-Drop fuer PDFs/Bilder + Klick-Fallback.
// - akzeptiert .pdf, .png, .jpg, .jpeg, .tif, .tiff
// - Multi-Upload, Groessenlimit (Default 50 MB)
// - Optimistic-Update: sofort in JobStore mit status=pending
// - Mini-Thumbnail-Preview der ersten Datei (5s)
// - Toast bei Erfolg/Fehler

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { api, ApiError } from "../../lib/api";
import { toast } from "../../lib/toast";
import { formatBytes } from "../../lib/format";
import { useJobStore } from "../job-queue/jobStore";

const ACCEPTED_EXT = [".pdf", ".png", ".jpg", ".jpeg", ".tif", ".tiff"] as const;

const ACCEPTED_MIME = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/tiff",
  "image/tif",
];

export interface DropzoneProps {
  /** Pro-Datei-Limit in Bytes. Default 50 MB. */
  maxFileSizeBytes?: number;
  /** Test-Hook: anstelle von api.uploadFiles. */
  onUpload?: (files: File[]) => Promise<{ job_ids: string[] }>;
}

interface ThumbInfo {
  url: string;
  filename: string;
}

function hasAcceptedExt(name: string): boolean {
  const lower = name.toLowerCase();
  return ACCEPTED_EXT.some((ext) => lower.endsWith(ext));
}

function isAcceptedFile(file: File): boolean {
  if (file.type && ACCEPTED_MIME.includes(file.type)) return true;
  return hasAcceptedExt(file.name);
}

function makeOptimisticId(): string {
  return `ocr-tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function Dropzone({
  maxFileSizeBytes = 50 * 1024 * 1024,
  onUpload,
}: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [hover, setHover] = useState(false);
  const [busy, setBusy] = useState(false);
  const [thumb, setThumb] = useState<ThumbInfo | null>(null);
  const dragCounter = useRef(0);

  const addOptimistic = useJobStore((s) => s.addOptimistic);
  const renameOptimistic = useJobStore((s) => s.renameOptimistic);

  // Cleanup: Object-URLs beim Unmount/Replace freigeben
  useEffect(() => {
    return () => {
      if (thumb?.url) URL.revokeObjectURL(thumb.url);
    };
  }, [thumb]);

  const acceptAttr = useMemo(() => ACCEPTED_EXT.join(","), []);

  const validateAndPartition = useCallback(
    (files: File[]): { ok: File[]; rejected: { file: File; reason: string }[] } => {
      const ok: File[] = [];
      const rejected: { file: File; reason: string }[] = [];
      for (const f of files) {
        if (!isAcceptedFile(f)) {
          rejected.push({ file: f, reason: "Dateityp nicht unterstuetzt" });
          continue;
        }
        if (f.size > maxFileSizeBytes) {
          rejected.push({
            file: f,
            reason: `Zu gross (${formatBytes(f.size)} > ${formatBytes(maxFileSizeBytes)})`,
          });
          continue;
        }
        ok.push(f);
      }
      return { ok, rejected };
    },
    [maxFileSizeBytes],
  );

  const showThumbnail = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    try {
      const url = URL.createObjectURL(file);
      setThumb({ url, filename: file.name });
      // 5 s sichtbar, dann revoke
      setTimeout(() => {
        URL.revokeObjectURL(url);
        setThumb((t) => (t?.url === url ? null : t));
      }, 5000);
    } catch {
      // ignore
    }
  }, []);

  const handleFiles = useCallback(
    async (rawFiles: File[]) => {
      if (rawFiles.length === 0) return;

      const { ok, rejected } = validateAndPartition(rawFiles);

      for (const r of rejected) {
        toast.warn(`Abgelehnt: ${r.file.name} - ${r.reason}`);
      }
      if (ok.length === 0) return;

      // Mini-Thumbnail der ersten Datei
      showThumbnail(ok[0]);

      // Optimistic-Insert: pro Datei tempJobId in den Store
      const tempIds: string[] = ok.map(() => makeOptimisticId());
      ok.forEach((file, i) => addOptimistic(file.name, tempIds[i]));

      setBusy(true);
      try {
        const uploader = onUpload ?? api.uploadFiles;
        const res = await uploader(ok);
        // Server-Job-IDs: 1:1-Mapping zu unseren Temp-IDs
        const realIds = res.job_ids ?? [];
        for (let i = 0; i < tempIds.length; i++) {
          const real = realIds[i];
          if (real) {
            renameOptimistic(tempIds[i], real);
          }
        }
        toast.success(
          ok.length === 1
            ? `Hochgeladen: ${ok[0].name}`
            : `${ok.length} Dateien hochgeladen`,
        );
      } catch (e) {
        const msg =
          e instanceof ApiError
            ? `${e.status}: ${e.message}`
            : (e as Error).message || "Unbekannter Upload-Fehler";
        toast.error(`Upload fehlgeschlagen: ${msg}`);
        // Optimistic-Eintraege als failed markieren
        for (const tid of tempIds) {
          useJobStore.getState().applyEvent({
            type: "job_failed",
            job_id: tid,
            error: msg,
          });
        }
      } finally {
        setBusy(false);
      }
    },
    [addOptimistic, onUpload, renameOptimistic, showThumbnail, validateAndPartition],
  );

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current = 0;
      setHover(false);
      const files = Array.from(e.dataTransfer.files ?? []);
      void handleFiles(files);
    },
    [handleFiles],
  );

  const onDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    setHover(true);
  };
  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = Math.max(0, dragCounter.current - 1);
    if (dragCounter.current === 0) setHover(false);
  };
  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const onClickPick = () => {
    inputRef.current?.click();
  };

  const onInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    void handleFiles(files);
    // Reset, damit dieselbe Datei erneut waehlbar ist
    e.target.value = "";
  };

  return (
    <div
      data-testid="dropzone"
      data-hover={hover ? "true" : "false"}
      data-busy={busy ? "true" : "false"}
      onDrop={onDrop}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onClick={onClickPick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClickPick();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label="Dateien per Drag-and-Drop ablegen oder zum Auswaehlen klicken"
      className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors
        ${hover ? "border-brand bg-brand/10" : "border-white/15 bg-bg-elevated/40 hover:border-brand/50"}
        ${busy ? "opacity-70" : ""}`}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={acceptAttr}
        onChange={onInputChange}
        data-testid="dropzone-input"
        className="hidden"
      />

      <div className="text-3xl text-fg-subtle" aria-hidden>
        +
      </div>
      <div className="text-sm font-medium text-fg">
        {hover ? "Dateien hier ablegen" : "Dateien per Drag-and-Drop oder Klick"}
      </div>
      <div className="text-xs text-fg-muted">
        PDF, PNG, JPG, TIFF - max. {formatBytes(maxFileSizeBytes)} pro Datei
      </div>

      {busy && (
        <div className="text-xs text-fg-muted" data-testid="dropzone-busy">
          Wird hochgeladen...
        </div>
      )}

      {thumb && (
        <div
          data-testid="dropzone-thumb"
          className="mt-3 flex items-center gap-2 rounded border border-white/10 bg-bg-panel p-2"
        >
          <img
            src={thumb.url}
            alt={thumb.filename}
            className="h-10 w-10 object-cover rounded"
          />
          <span className="text-xs text-fg-muted">{thumb.filename}</span>
        </div>
      )}
    </div>
  );
}

export default Dropzone;
