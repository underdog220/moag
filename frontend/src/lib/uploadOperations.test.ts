// uploadOperations.test.ts — Unit-Tests für die Operations-Registry.
// Prüft: compatibleOperations(mime) filtert korrekt für verschiedene MIMEs.

import { describe, expect, it } from "vitest";
import {
  UPLOAD_OPERATIONS,
  compatibleOperations,
  detectMime,
  formatBytes,
  acceptString,
} from "./uploadOperations";

describe("UPLOAD_OPERATIONS", () => {
  it("enthält genau 11 Operationen (inkl. dsgvo.visual-redact)", () => {
    expect(UPLOAD_OPERATIONS).toHaveLength(11);
  });

  it("enthält dsgvo.visual-redact als PDF-only-Operation", () => {
    const op = UPLOAD_OPERATIONS.find((o) => o.id === "dsgvo.visual-redact");
    expect(op).toBeDefined();
    expect(op!.accepted_mimes).toEqual(["application/pdf"]);
    expect(op!.category).toBe("dsgvo");
    expect(op!.system).toBe("oberon");
  });

  it("jede Operation hat eine eindeutige id", () => {
    const ids = UPLOAD_OPERATIONS.map((op) => op.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("alle Pflicht-Felder sind vorhanden", () => {
    for (const op of UPLOAD_OPERATIONS) {
      expect(op.id).toBeTruthy();
      expect(op.name).toBeTruthy();
      expect(op.system).toMatch(/^(ocrexpert|oberon|octoboss)$/);
      expect(op.description).toBeTruthy();
      expect(op.accepted_mimes.length).toBeGreaterThan(0);
      expect(typeof op.requires_prompt).toBe("boolean");
      expect(typeof op.estimated_duration_s).toBe("number");
      expect(op.category).toMatch(/^(ocr|llm|audio|dsgvo|pdf)$/);
    }
  });
});

describe("compatibleOperations", () => {
  it("PDF: gibt OCR, LLM-Text, Bauplan, DSGVO-Redact, Visual-Redact, PII-Scan, PDF-Split, OCR-Shadow zurück", () => {
    const ops = compatibleOperations("application/pdf");
    const ids = ops.map((o) => o.id);
    expect(ids).toContain("ocr.standard");
    expect(ids).toContain("ocr.shadow");
    expect(ids).toContain("ocr.direct");
    expect(ids).toContain("llm.text");
    expect(ids).toContain("llm.plan");
    expect(ids).toContain("dsgvo.redact");
    expect(ids).toContain("dsgvo.visual-redact");
    expect(ids).toContain("pii.scan");
    expect(ids).toContain("pdf.split");
  });

  it("PNG: OCR-Standard, OCR-Direct, LLM-Vision, Bauplan, DSGVO-Redact — aber kein Audio und kein PII-Scan", () => {
    const ops = compatibleOperations("image/png");
    const ids = ops.map((o) => o.id);
    expect(ids).toContain("ocr.standard");
    expect(ids).toContain("ocr.direct");
    expect(ids).toContain("llm.vision");
    expect(ids).toContain("llm.plan");
    expect(ids).toContain("dsgvo.redact");
    expect(ids).not.toContain("audio.transcribe");
    expect(ids).not.toContain("pii.scan");
  });

  it("audio/mpeg: nur audio.transcribe", () => {
    const ops = compatibleOperations("audio/mpeg");
    expect(ops).toHaveLength(1);
    expect(ops[0].id).toBe("audio.transcribe");
  });

  it("text/plain: llm.text und pii.scan", () => {
    const ops = compatibleOperations("text/plain");
    const ids = ops.map((o) => o.id);
    expect(ids).toContain("llm.text");
    expect(ids).toContain("pii.scan");
    expect(ids).not.toContain("audio.transcribe");
    expect(ids).not.toContain("ocr.shadow");
  });

  it("unbekanntes MIME: leere Liste", () => {
    const ops = compatibleOperations("application/x-unknown-format");
    expect(ops).toHaveLength(0);
  });

  it("normalisiert image/jpg zu image/jpeg", () => {
    const ops = compatibleOperations("image/jpg");
    const opsJpeg = compatibleOperations("image/jpeg");
    expect(ops.map((o) => o.id)).toEqual(opsJpeg.map((o) => o.id));
  });
});

describe("detectMime", () => {
  function makeFile(name: string, type: string): File {
    return new File(["x"], name, { type });
  }

  it("gibt file.type zurück wenn gesetzt (nicht octet-stream)", () => {
    const f = makeFile("test.pdf", "application/pdf");
    expect(detectMime(f)).toBe("application/pdf");
  });

  it("erkennt Endung .pdf wenn type = octet-stream", () => {
    const f = makeFile("test.pdf", "application/octet-stream");
    expect(detectMime(f)).toBe("application/pdf");
  });

  it("erkennt .mp3 als audio/mpeg", () => {
    const f = makeFile("audio.mp3", "application/octet-stream");
    expect(detectMime(f)).toBe("audio/mpeg");
  });

  it("unbekannte Endung → application/octet-stream", () => {
    const f = makeFile("file.xyz", "application/octet-stream");
    expect(detectMime(f)).toBe("application/octet-stream");
  });
});

describe("formatBytes", () => {
  it("< 1024 → Bytes", () => expect(formatBytes(512)).toBe("512 B"));
  it("< 1 MB → KB", () => expect(formatBytes(2048)).toBe("2.0 KB"));
  it(">= 1 MB → MB", () => expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB"));
});

describe("acceptString", () => {
  it("gibt komma-getrennte MIME-Liste zurück", () => {
    const op = UPLOAD_OPERATIONS.find((o) => o.id === "audio.transcribe")!;
    const s = acceptString(op);
    expect(s).toContain("audio/wav");
    expect(s).toContain("audio/mpeg");
    expect(s.split(",").length).toBe(op.accepted_mimes.length);
  });
});
