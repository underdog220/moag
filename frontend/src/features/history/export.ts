// Export-Helfer fuer History: CSV (Semicolon, DE-konform) + JSON.
// Reines Datenmodul ohne DOM-Bindings; downloadBlob ist DOM-spezifisch.

import type { JobStatus } from "../../lib/types";

const CSV_HEADERS = [
  "job_id",
  "filename",
  "status",
  "started_at",
  "finished_at",
  "doctype",
  "doctype_confidence",
  "engines_used",
  "nodes_used",
  "page_total",
  "page_done",
  "pii_count",
  "consensus_score",
  "error",
] as const;

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = Array.isArray(value) ? value.join(",") : String(value);
  // Semicolon-DE: escape Semikolon, Anfuehrungszeichen, Newlines
  if (/[";\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function jobsToCsv(jobs: JobStatus[]): string {
  const lines: string[] = [];
  lines.push(CSV_HEADERS.join(";"));
  for (const j of jobs) {
    const row = CSV_HEADERS.map((key) => {
      const v = (j as unknown as Record<string, unknown>)[key];
      return csvEscape(v);
    });
    lines.push(row.join(";"));
  }
  // RFC-4180 nutzt CRLF; DE-Excel mag das gerne
  return lines.join("\r\n") + "\r\n";
}

export function jobsToJson(jobs: JobStatus[]): string {
  return JSON.stringify({ exported_at: new Date().toISOString(), count: jobs.length, jobs }, null, 2);
}

export function downloadBlob(content: string, filename: string, mime: string): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // URL-Revoke leicht verzoegert, damit der Download im Browser losgeht
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const HISTORY_CSV_HEADERS = CSV_HEADERS;
