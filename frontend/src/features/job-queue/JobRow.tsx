// JobRow — eine Zeile in der Live-Job-Queue.
// - Filename + Doctype-Badge + Status-Icon
// - 2-stufige Fortschrittsanzeige (ProgressBar)
// - Failed: rote Border + Error-Tooltip + Retry-Button
// - Native-PDF-Hint statt Engine-Liste, wenn engine=native_text_layer

import { useState } from "react";
import { StatusDot } from "../../components/StatusDot";
import { api, ApiError } from "../../lib/api";
import { toast } from "../../lib/toast";
import type { JobRowState } from "./jobStore";
import { useJobStore } from "./jobStore";
import { ProgressBar } from "./ProgressBar";

export interface JobRowProps {
  job: JobRowState;
  onClick?: (jobId: string) => void;
}

function statusKind(status: string): "ok" | "warn" | "error" | "info" | "neutral" {
  switch (status) {
    case "done":
      return "ok";
    case "running":
      return "info";
    case "pending":
      return "neutral";
    case "failed":
      return "error";
    default:
      return "neutral";
  }
}

export function JobRow({ job, onClick }: JobRowProps) {
  const [retrying, setRetrying] = useState(false);
  const markRetry = useJobStore((s) => s.markRetry);

  const failed = job.status === "failed";
  const done = job.status === "done";

  const handleRetry = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (retrying) return;
    setRetrying(true);
    try {
      await api.retryJob(job.job_id);
      markRetry(job.job_id);
      toast.success("Retry gestartet");
    } catch (err) {
      const msg =
        err instanceof ApiError ? `${err.status}: ${err.message}` : (err as Error).message;
      toast.error(`Retry fehlgeschlagen: ${msg}`);
    } finally {
      setRetrying(false);
    }
  };

  const onRowClick = () => {
    onClick?.(job.job_id);
  };

  return (
    <div
      data-testid="job-row"
      data-job-id={job.job_id}
      data-status={job.status}
      role="button"
      tabIndex={0}
      onClick={onRowClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onRowClick();
        }
      }}
      className={`group flex flex-col gap-1.5 rounded border p-2.5 transition-colors hover:bg-white/5 cursor-pointer
        ${failed ? "border-status-error/50 bg-status-error/5" : "border-white/5 bg-bg-elevated/40"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <StatusDot status={statusKind(job.status)} pulse={job.status === "running"} />
          <span className="truncate text-sm font-medium text-fg" title={job.filename}>
            {job.filename}
          </span>
          {job.doctype && (
            <span
              data-testid="doctype-badge"
              className="rounded bg-brand/15 px-1.5 py-0.5 text-xxs text-brand"
            >
              {job.doctype}
              {job.doctype_confidence != null
                ? ` (${(job.doctype_confidence * 100).toFixed(0)}%)`
                : ""}
            </span>
          )}
          {job.optimistic && (
            <span className="text-xxs italic text-fg-subtle">(eingereicht)</span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xxs text-fg-muted">
          {job.status === "failed" && (
            <button
              type="button"
              data-testid="retry-button"
              onClick={handleRetry}
              disabled={retrying}
              className="rounded border border-status-error/40 px-2 py-0.5 text-status-error hover:bg-status-error/10 disabled:opacity-50"
            >
              {retrying ? "..." : "Retry"}
            </button>
          )}
          <span>{job.status}</span>
        </div>
      </div>

      <ProgressBar
        pct={job.progress_pct}
        pageDone={job.page_done}
        pageTotal={job.page_total}
        engineStatus={job.engine_status}
        enginesActive={job.engines_active}
        failed={failed}
        done={done}
        nativeTextLayer={job.native_text_layer}
      />

      {failed && job.error && (
        <div
          data-testid="job-error"
          title={job.error}
          className="truncate text-xxs text-status-error"
        >
          {job.error}
        </div>
      )}
    </div>
  );
}

export default JobRow;
