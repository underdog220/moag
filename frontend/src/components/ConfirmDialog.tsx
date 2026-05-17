// ConfirmDialog — generischer Modal-Bestätigungs-Dialog.
// Wird von ActionCard (requires_confirm=true) und destruktiven Operationen genutzt.
// ESC-Key + Backdrop-Klick = Cancel (ADR-004 Konvention).

import { useEffect, type ReactNode } from "react";

export interface ConfirmDialogProps {
  /** Dialog sichtbar (kontrolliert von aussen) */
  open: boolean;
  /** Titel im Dialog-Header */
  title: string;
  /** Erklärungstext (1-2 Sätze) */
  message: ReactNode;
  /** Bei true: roter Confirm-Button + Warnsymbol */
  danger?: boolean;
  /** Label des Bestätigen-Buttons (default: "Bestätigen") */
  confirmLabel?: string;
  /** Label des Abbrechen-Buttons (default: "Abbrechen") */
  cancelLabel?: string;
  /** Callback: Nutzer hat bestätigt */
  onConfirm: () => void;
  /** Callback: Nutzer hat abgebrochen (ESC, Backdrop, Cancel-Button) */
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  danger = false,
  confirmLabel = "Bestätigen",
  cancelLabel = "Abbrechen",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  // ESC-Key schliesst den Dialog
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    // Backdrop: Klick ausserhalb = Cancel
    <div
      data-testid="confirm-dialog-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onCancel}
      aria-hidden="false"
    >
      {/* Dialog-Panel — Klick-Propagation stoppen */}
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        data-testid="confirm-dialog"
        className="relative w-full max-w-md rounded-xl border border-white/10
                   bg-bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className={`flex items-center gap-3 rounded-t-xl border-b border-white/10 px-5 py-4 ${
            danger ? "bg-status-error/10" : "bg-bg-subtle"
          }`}
        >
          {danger && (
            <span
              aria-hidden="true"
              className="text-xl text-status-error"
              data-testid="confirm-dialog-danger-icon"
            >
              ⚠
            </span>
          )}
          <h2
            id="confirm-dialog-title"
            className={`text-base font-semibold ${
              danger ? "text-status-error" : "text-fg"
            }`}
          >
            {title}
          </h2>
        </div>

        {/* Body */}
        <div className="px-5 py-4 text-sm text-fg-muted">{message}</div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-white/10 px-5 py-4">
          <button
            type="button"
            data-testid="confirm-dialog-cancel"
            onClick={onCancel}
            className="rounded-lg border border-white/10 bg-bg-subtle px-4 py-2
                       text-sm font-medium text-fg-muted transition-colors
                       hover:border-white/20 hover:text-fg focus:outline-none
                       focus:ring-2 focus:ring-brand/60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            data-testid="confirm-dialog-confirm"
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors
                        focus:outline-none focus:ring-2 ${
                          danger
                            ? "bg-status-error text-white hover:bg-status-error/80 focus:ring-status-error/60"
                            : "bg-brand text-white hover:bg-brand/80 focus:ring-brand/60"
                        }`}
          >
            {danger && <span aria-hidden="true" className="mr-1">⚠</span>}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
