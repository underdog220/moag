import { describe, expect, it } from "vitest";
import { jobsToCsv, jobsToJson, HISTORY_CSV_HEADERS } from "./export";
import type { JobStatus } from "../../lib/types";

const SAMPLE: JobStatus[] = [
  {
    job_id: "ocr-1",
    filename: "rechnung.pdf",
    status: "done",
    progress_pct: 100,
    page_total: 5,
    page_done: 5,
    started_at: "2026-05-06T10:00:00Z",
    finished_at: "2026-05-06T10:01:00Z",
    doctype: "Rechnung",
    doctype_confidence: 0.94,
    pii_count: 4,
    consensus_score: 0.96,
    engines_used: ["tesseract", "easyocr"],
    nodes_used: ["WorkRyzen"],
    error: null,
  },
  {
    job_id: "ocr-2",
    filename: 'datei mit "Anfuehrungszeichen"; und Semikolon.pdf',
    status: "failed",
    progress_pct: 30,
    page_total: 1,
    page_done: 0,
    started_at: "2026-05-06T10:05:00Z",
    finished_at: "2026-05-06T10:05:30Z",
    doctype: null,
    doctype_confidence: null,
    pii_count: null,
    consensus_score: null,
    engines_used: [],
    nodes_used: [],
    error: "PDF-Header malformed",
  },
];

describe("jobsToCsv", () => {
  it("schreibt Header + Zeilen mit Semicolon", () => {
    const csv = jobsToCsv(SAMPLE);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(HISTORY_CSV_HEADERS.join(";"));
    expect(lines[1]).toContain("ocr-1;rechnung.pdf;done;");
    expect(lines[1]).toContain("tesseract,easyocr");
  });

  it("escaped Semikolon und Anfuehrungszeichen mit RFC-4180-Quoting", () => {
    const csv = jobsToCsv(SAMPLE);
    expect(csv).toContain('"datei mit ""Anfuehrungszeichen""; und Semikolon.pdf"');
  });

  it("liefert leere Strings fuer null", () => {
    // SAMPLE[0] hat einen Filename ohne Sonderzeichen; bei SAMPLE[1] wuerde
    // das RFC-4180-Quoting (filename enthaelt ";") den naive split(";")-Check
    // unterlaufen — das ist erwuenschtes Verhalten, nicht der Punkt dieses
    // Tests. Wir verifizieren hier nur dass null -> leere Felder werden.
    const sampleNoQuoting = { ...SAMPLE[1], filename: "broken.pdf" };
    const csv = jobsToCsv([sampleNoQuoting]);
    const dataLine = csv.split("\r\n")[1];
    expect(dataLine.split(";").length).toBe(HISTORY_CSV_HEADERS.length);
    // null-Felder muessen leer sein (zwei Semikolons hintereinander)
    expect(dataLine).toContain(";;");
  });
});

describe("jobsToJson", () => {
  it("liefert valides JSON mit count + jobs", () => {
    const json = jobsToJson(SAMPLE);
    const parsed = JSON.parse(json);
    expect(parsed.count).toBe(2);
    expect(parsed.jobs).toHaveLength(2);
    expect(parsed.exported_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
