// OperationCard.test.tsx — Tests für die spezialisierte Upload-Karte.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { OperationCard } from "./OperationCard";
import type { UploadOperation } from "../../lib/uploadOperations";
import * as apiModule from "../../lib/api";
import type { UploadResult } from "../../lib/types";

const OCR_STD: UploadOperation = {
  id: "ocr.standard",
  name: "OCR (Standard)",
  system: "ocrexpert",
  description: "Standard-OCR.",
  accepted_mimes: ["application/pdf", "image/png", "image/jpeg", "image/tiff", "image/bmp", "image/webp"],
  requires_prompt: false,
  estimated_duration_s: 15,
  category: "ocr",
};

const LLM_TEXT: UploadOperation = {
  id: "llm.text",
  name: "LLM-Textanalyse",
  system: "oberon",
  description: "LLM-Analyse.",
  accepted_mimes: ["application/pdf", "text/plain", "text/markdown", "text/html",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/rtf"],
  requires_prompt: true,
  estimated_duration_s: 30,
  category: "llm",
};

const OCR_DIRECT: UploadOperation = {
  id: "ocr.direct",
  name: "OCR (Engine-Auswahl)",
  system: "octoboss",
  description: "OCR direkt.",
  accepted_mimes: ["application/pdf", "image/png", "image/jpeg", "image/tiff"],
  requires_prompt: false,
  requires_engine_choice: ["tesseract", "surya", "paddle", "easyocr"],
  estimated_duration_s: 10,
  category: "ocr",
};

const MOCK_RESULT: UploadResult = {
  upload_id: "01TEST",
  status: "completed",
  operation: "ocr.standard",
  completed_at: "2026-05-17T10:00:00Z",
  duration_ms: 1234,
  result_summary: "OCR abgeschlossen: 2 Seiten, 500 Zeichen.",
  result_payload: { n_chars: 500 },
  artifact_url: null,
  artifact_mime: null,
  error: null,
};

describe("OperationCard", () => {
  beforeEach(() => {
    vi.spyOn(apiModule.api.upload, "submit").mockResolvedValue(MOCK_RESULT);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rendert Name, Beschreibung und Kategorie-Badge", () => {
    render(<OperationCard operation={OCR_STD} />);
    expect(screen.getByTestId("operation-card-ocr.standard")).toBeTruthy();
    expect(screen.getByText("OCR (Standard)")).toBeTruthy();
    expect(screen.getByText("Standard-OCR.")).toBeTruthy();
    expect(screen.getByText("OCR")).toBeTruthy(); // Kategorie-Badge
  });

  it("Senden-Button ist initial disabled (keine Datei)", () => {
    render(<OperationCard operation={OCR_STD} />);
    const btn = screen.getByTestId("send-btn-ocr.standard");
    expect(btn).toBeDisabled();
  });

  it("akzeptiert nur kompatible MIMEs im Input (accept-Attribut)", () => {
    render(<OperationCard operation={OCR_STD} />);
    const input = screen.getByTestId("file-input-ocr.standard");
    const accept = input.getAttribute("accept") ?? "";
    expect(accept).toContain("application/pdf");
    expect(accept).toContain("image/png");
    expect(accept).not.toContain("audio/mpeg");
  });

  it("Senden-Button bleibt disabled wenn llm.text ohne Prompt", () => {
    render(<OperationCard operation={LLM_TEXT} />);
    // Datei via input hinzufügen
    const input = screen.getByTestId("file-input-llm.text");
    const file = new File(["test"], "doc.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [file] } });
    // Button disabled, weil Prompt fehlt
    const btn = screen.getByTestId("send-btn-llm.text");
    expect(btn).toBeDisabled();
  });

  it("Senden wird enabled nach Datei + Prompt", async () => {
    render(<OperationCard operation={LLM_TEXT} />);
    const input = screen.getByTestId("file-input-llm.text");
    const file = new File(["test"], "doc.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [file] } });
    const textarea = screen.getByTestId("params-prompt-llm.text");
    fireEvent.change(textarea, { target: { value: "Mein Prompt" } });
    await waitFor(() => {
      const btn = screen.getByTestId("send-btn-llm.text");
      expect(btn).not.toBeDisabled();
    });
  });

  it("Engine-Select ist sichtbar für ocr.direct", () => {
    render(<OperationCard operation={OCR_DIRECT} />);
    expect(screen.getByTestId("params-engine-ocr.direct")).toBeTruthy();
  });

  it("nach erfolgreichem Submit: ResultPanel sichtbar", async () => {
    render(<OperationCard operation={OCR_STD} />);
    const input = screen.getByTestId("file-input-ocr.standard");
    const file = new File(["test"], "scan.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [file] } });
    const btn = screen.getByTestId("send-btn-ocr.standard");
    await waitFor(() => expect(btn).not.toBeDisabled());
    fireEvent.click(btn);
    await waitFor(() => {
      expect(screen.getByText("OCR abgeschlossen: 2 Seiten, 500 Zeichen.")).toBeTruthy();
    });
  });
});
