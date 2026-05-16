// Modal-Confirm-Dialog mit Backdrop. Schlank gehalten — keine Portals.

import { useEffect } from "react";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Bestaetigen",
  cancelLabel = "Abbrechen",
  onConfirm,
  onCancel,
  destructive = false,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      data-testid="confirm-dialog"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-md rounded-lg border border-white/10 bg-bg-panel p-5 shadow-xl">
        <h3 id="confirm-title" className="text-base font-semibold text-fg">
          {title}
        </h3>
        <p className="mt-2 text-sm text-fg-muted">{message}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-white/10 px-3 py-1.5 text-sm text-fg-muted hover:text-fg"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            data-testid="confirm-dialog-ok"
            className={`rounded px-3 py-1.5 text-sm font-semibold text-white
                        ${destructive ? "bg-status-error hover:bg-status-error/80" : "bg-brand hover:bg-brand-hover"}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
