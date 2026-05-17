// ParamsForm.test.tsx — Pflicht-Param-Editor-Tests.

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ParamsForm } from "./ParamsForm";
import type { UploadOperation } from "../../lib/uploadOperations";

const OCR_DIRECT: UploadOperation = {
  id: "ocr.direct",
  name: "OCR (Engine-Auswahl)",
  system: "octoboss",
  description: "OCR direkt auf Engine.",
  accepted_mimes: ["application/pdf", "image/png"],
  requires_prompt: false,
  requires_engine_choice: ["tesseract", "surya", "paddle", "easyocr"],
  estimated_duration_s: 10,
  category: "ocr",
};

const LLM_TEXT: UploadOperation = {
  id: "llm.text",
  name: "LLM-Textanalyse",
  system: "oberon",
  description: "LLM-Analyse.",
  accepted_mimes: ["application/pdf", "text/plain"],
  requires_prompt: true,
  estimated_duration_s: 30,
  category: "llm",
};

const OCR_STANDARD: UploadOperation = {
  id: "ocr.standard",
  name: "OCR (Standard)",
  system: "ocrexpert",
  description: "Standard-OCR.",
  accepted_mimes: ["application/pdf"],
  requires_prompt: false,
  estimated_duration_s: 15,
  category: "ocr",
};

describe("ParamsForm", () => {
  it("zeigt Textarea wenn requires_prompt=true", () => {
    render(
      <ParamsForm
        operation={LLM_TEXT}
        params={{}}
        onChange={() => {}}
      />,
    );
    expect(screen.getByTestId("params-prompt-llm.text")).toBeTruthy();
    // Textarea vorhanden
    const textarea = screen.getByRole("textbox");
    expect(textarea).toBeTruthy();
  });

  it("ruft onChange beim Tippen auf", () => {
    const onChange = vi.fn();
    render(
      <ParamsForm
        operation={LLM_TEXT}
        params={{ prompt: "" }}
        onChange={onChange}
      />,
    );
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Mein Prompt" } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "Mein Prompt" }),
    );
  });

  it("zeigt Select wenn requires_engine_choice vorhanden", () => {
    render(
      <ParamsForm
        operation={OCR_DIRECT}
        params={{}}
        onChange={() => {}}
      />,
    );
    const select = screen.getByTestId("params-engine-ocr.direct");
    expect(select).toBeTruthy();
    // Alle Engine-Optionen vorhanden
    expect(screen.getByRole("option", { name: "tesseract" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "surya" })).toBeTruthy();
  });

  it("ruft onChange beim Engine-Wechsel auf", () => {
    const onChange = vi.fn();
    render(
      <ParamsForm
        operation={OCR_DIRECT}
        params={{ engine: "tesseract" }}
        onChange={onChange}
      />,
    );
    const select = screen.getByTestId("params-engine-ocr.direct");
    fireEvent.change(select, { target: { value: "surya" } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ engine: "surya" }),
    );
  });

  it("rendert nichts wenn keine Params nötig (ocr.standard)", () => {
    const { container } = render(
      <ParamsForm
        operation={OCR_STANDARD}
        params={{}}
        onChange={() => {}}
      />,
    );
    // Kein input/select/textarea
    expect(container.querySelector("textarea")).toBeNull();
    expect(container.querySelector("select")).toBeNull();
  });
});
