// UploadHistory — tabellarische Upload-Historie am Ende der Hub-Page.
// Polling alle 30s. Auf Mobile: Karten-Layout statt Tabelle.

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { qk } from "../../lib/queryKeys";
import { formatBytes } from "../../lib/uploadOperations";
import type { Upload } from "../../lib/types";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Tooltip } from "../../components/Tooltip";

// Status → Badge-Farbe + Label
const STATUS_STYLE: Record<Upload["status"], { cls: string; label: string }> = {
  queued:     { cls: "bg-fg-subtle/15 text-fg-muted border-fg-subtle/20",        label: "Warteschlange" },
  processing: { cls: "bg-status-warn/15 text-status-warn border-status-warn/20", label: "Verarbeitung" },
  completed:  { cls: "bg-status-ok/15 text-status-ok border-status-ok/20",       label: "Abgeschlossen" },
  failed:     { cls: "bg-status-error/15 text-status-error border-status-error/20", label: "Fehler" },
};

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const h = String(d.getHours()).padStart(2, "0");
    const m = String(d.getMinutes()).padStart(2, "0");
    return `${d.toLocaleDateString("de-DE")} ${h}:${m}`;
  } catch {
    return iso;
  }
}

export function UploadHistory() {
  const qc = useQueryClient();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: qk.uploads.list({ limit: 20 }),
    queryFn: () => api.upload.list({ limit: 20 }),
    refetchInterval: 30_000,
    retry: 1,
  });

  const uploads = data?.uploads ?? [];

  async function doDelete(id: string) {
    setDeleting(true);
    try {
      await api.upload.delete(id);
      await qc.invalidateQueries({ queryKey: ["uploads", "list"] });
    } catch {
      // Fehler stillschweigend — User sieht Entry noch, nächstes Polling räumt auf
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  }

  return (
    <section data-testid="upload-history" className="mt-10">
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 className="text-base font-semibold text-fg">Upload-Historie</h2>
        <button
          type="button"
          onClick={() => void qc.invalidateQueries({ queryKey: ["uploads", "list"] })}
          className="text-xs text-fg-subtle hover:text-fg-muted transition-colors"
        >
          Aktualisieren
        </button>
      </div>

      {isLoading && uploads.length === 0 && (
        <div className="text-center text-sm text-fg-muted py-8">
          Lade Historie…
        </div>
      )}

      {error && uploads.length === 0 && (
        <div
          data-testid="upload-history-error"
          className="rounded border border-status-error/30 bg-status-error/10
                     p-4 text-sm text-status-error"
        >
          Fehler beim Laden der Historie: {(error as Error).message}
        </div>
      )}

      {!isLoading && !error && uploads.length === 0 && (
        <div
          data-testid="upload-history-empty"
          className="rounded border border-white/10 bg-bg-panel p-8
                     text-center text-sm text-fg-muted"
        >
          Noch keine Uploads vorhanden.
        </div>
      )}

      {/* Desktop: Tabelle */}
      {uploads.length > 0 && (
        <>
          {/* Tabelle (ab md) */}
          <div className="hidden md:block overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full border-collapse text-xs">
              <thead className="bg-bg-elevated text-fg-muted">
                <tr>
                  <th className="px-3 py-2.5 text-left font-medium">Dateiname</th>
                  <th className="px-3 py-2.5 text-left font-medium">Operation</th>
                  <th className="px-3 py-2.5 text-left font-medium">Status</th>
                  <th className="px-3 py-2.5 text-left font-medium">Größe</th>
                  <th className="px-3 py-2.5 text-left font-medium">Hochgeladen</th>
                  <th className="px-3 py-2.5 text-right font-medium">Aktionen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {uploads.map((u) => {
                  const ss = STATUS_STYLE[u.status];
                  return (
                    <tr
                      key={u.upload_id}
                      data-testid={`history-row-${u.upload_id}`}
                      className="bg-bg-panel hover:bg-bg-elevated transition-colors"
                    >
                      <td className="max-w-[180px] truncate px-3 py-2.5 text-fg">
                        {u.filename}
                      </td>
                      <td className="px-3 py-2.5 text-fg-muted">{u.operation}</td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`rounded border px-1.5 py-0.5 text-xxs font-medium ${ss.cls}`}
                        >
                          {ss.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-fg-muted">
                        {formatBytes(u.size_bytes)}
                      </td>
                      <td className="px-3 py-2.5 text-fg-muted">
                        {formatDate(u.uploaded_at)}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="inline-flex items-center gap-2 justify-end">
                          {/* Result anzeigen */}
                          {(u.status === "completed" || u.status === "failed") && (
                            <Tooltip
                              title="Ergebnis dieser Operation anzeigen"
                              source={`GET /api/v1/uploads/${u.upload_id}/result`}
                              position="top"
                            >
                              <a
                                href={`/upload/result/${u.upload_id}`}
                                data-testid={`history-result-${u.upload_id}`}
                                className="rounded border border-white/10 bg-bg-elevated
                                           px-2 py-1 text-xxs text-fg-muted
                                           hover:text-fg hover:border-white/20 transition-colors"
                              >
                                Ansicht
                              </a>
                            </Tooltip>
                          )}
                          {/* Löschen */}
                          <Tooltip
                            title="Upload + Ergebnis + Artifact unwiderruflich löschen"
                            source={`DELETE /api/v1/uploads/${u.upload_id}`}
                            thresholds="Achtung: Nicht rückgängig zu machen"
                            position="top"
                          >
                            <button
                              type="button"
                              data-testid={`history-delete-${u.upload_id}`}
                              onClick={() => setDeleteId(u.upload_id)}
                              className="rounded border border-status-error/20 bg-status-error/5
                                         px-2 py-1 text-xxs text-status-error
                                         hover:bg-status-error/15 transition-colors"
                            >
                              Löschen
                            </button>
                          </Tooltip>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile: Karten-Liste (< md) */}
          <div className="flex flex-col gap-3 md:hidden">
            {uploads.map((u) => {
              const ss = STATUS_STYLE[u.status];
              return (
                <div
                  key={u.upload_id}
                  data-testid={`history-card-${u.upload_id}`}
                  className="rounded-lg border border-white/10 bg-bg-panel p-3"
                >
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium text-fg">
                      {u.filename}
                    </p>
                    <span
                      className={`shrink-0 rounded border px-1.5 py-0.5 text-xxs font-medium ${ss.cls}`}
                    >
                      {ss.label}
                    </span>
                  </div>
                  <p className="text-xxs text-fg-muted">
                    {u.operation} · {formatBytes(u.size_bytes)} · {formatDate(u.uploaded_at)}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setDeleteId(u.upload_id)}
                      className="rounded border border-status-error/20 bg-status-error/5
                                 px-2 py-1 text-xxs text-status-error
                                 hover:bg-status-error/15 transition-colors"
                    >
                      Löschen
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Löschen-Bestätigungs-Dialog */}
      <ConfirmDialog
        open={deleteId !== null}
        title="Upload löschen"
        message={
          <p>
            Upload, Ergebnis und Artifact werden unwiderruflich gelöscht.
            Diese Aktion kann nicht rückgängig gemacht werden.
          </p>
        }
        danger
        confirmLabel={deleting ? "Wird gelöscht…" : "Jetzt löschen"}
        cancelLabel="Abbrechen"
        onConfirm={() => { if (deleteId) void doDelete(deleteId); }}
        onCancel={() => setDeleteId(null)}
      />
    </section>
  );
}

export default UploadHistory;
