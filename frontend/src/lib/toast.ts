// Schlankes Toast-System ohne externe Library.
// Globaler In-Memory-Store + Subscribe-API. Auto-Expire nach `durationMs`.
// Wird von <ToastHost /> gerendert (siehe components/Toast.tsx).

export type ToastKind = "success" | "error" | "info" | "warn";

export interface ToastEntry {
  id: string;
  kind: ToastKind;
  message: string;
  durationMs: number;
  createdAt: number;
}

type Listener = (entries: ToastEntry[]) => void;

let _entries: ToastEntry[] = [];
const _listeners = new Set<Listener>();
let _seq = 0;

function emit() {
  for (const l of _listeners) {
    try {
      l([..._entries]);
    } catch {
      // ignore
    }
  }
}

/** Subscribe — gibt die aktuelle Liste zurueck und ruft `cb` bei Aenderungen. */
export function subscribeToasts(cb: Listener): () => void {
  _listeners.add(cb);
  cb([..._entries]);
  return () => {
    _listeners.delete(cb);
  };
}

export interface ToastOptions {
  durationMs?: number;
  kind?: ToastKind;
}

/** Zeigt einen Toast. Liefert die ID (fuer manuelles dismiss). */
export function showToast(message: string, opts: ToastOptions = {}): string {
  _seq += 1;
  const id = `toast-${Date.now()}-${_seq}`;
  const entry: ToastEntry = {
    id,
    message,
    kind: opts.kind ?? "info",
    durationMs: opts.durationMs ?? 4000,
    createdAt: Date.now(),
  };
  _entries = [..._entries, entry];
  emit();

  if (entry.durationMs > 0) {
    setTimeout(() => dismissToast(id), entry.durationMs);
  }
  return id;
}

export const toast = {
  success: (m: string, o?: ToastOptions) => showToast(m, { ...o, kind: "success" }),
  error: (m: string, o?: ToastOptions) => showToast(m, { ...o, kind: "error" }),
  info: (m: string, o?: ToastOptions) => showToast(m, { ...o, kind: "info" }),
  warn: (m: string, o?: ToastOptions) => showToast(m, { ...o, kind: "warn" }),
};

export function dismissToast(id: string): void {
  const before = _entries.length;
  _entries = _entries.filter((e) => e.id !== id);
  if (_entries.length !== before) emit();
}

export function clearAllToasts(): void {
  if (_entries.length === 0) return;
  _entries = [];
  emit();
}

/** Nur fuer Tests: liefert die aktuelle Snapshot-Liste. */
export function _getToastsForTest(): ToastEntry[] {
  return [..._entries];
}
