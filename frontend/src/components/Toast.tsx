// ToastHost — rendert die globale Toast-Liste oben rechts.
// Quelle: lib/toast.ts (subscribeToasts). Wird einmal in App/Layout gemountet.

import { useEffect, useState } from "react";
import { dismissToast, subscribeToasts, type ToastEntry, type ToastKind } from "../lib/toast";

const KIND_STYLES: Record<ToastKind, string> = {
  success: "border-status-ok/50 bg-status-ok/10 text-status-ok",
  error: "border-status-error/50 bg-status-error/10 text-status-error",
  info: "border-status-info/50 bg-status-info/10 text-status-info",
  warn: "border-status-warn/50 bg-status-warn/10 text-status-warn",
};

export function ToastHost() {
  const [entries, setEntries] = useState<ToastEntry[]>([]);

  useEffect(() => {
    return subscribeToasts(setEntries);
  }, []);

  if (entries.length === 0) return null;

  return (
    <div
      data-testid="toast-host"
      className="pointer-events-none fixed right-4 top-4 z-50 flex w-80 max-w-[90vw] flex-col gap-2"
      aria-live="polite"
      role="region"
    >
      {entries.map((t) => (
        <div
          key={t.id}
          data-testid="toast-entry"
          data-kind={t.kind}
          className={`pointer-events-auto rounded-md border px-3 py-2 text-sm shadow-md backdrop-blur ${KIND_STYLES[t.kind]}`}
        >
          <div className="flex items-start justify-between gap-2">
            <span className="break-words">{t.message}</span>
            <button
              type="button"
              aria-label="Schliessen"
              onClick={() => dismissToast(t.id)}
              className="shrink-0 text-xs opacity-60 hover:opacity-100"
            >
              x
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default ToastHost;
