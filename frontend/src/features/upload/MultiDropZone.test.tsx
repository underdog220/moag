// MultiDropZone.test.tsx — Drop-Zone Tests.

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MultiDropZone } from "./MultiDropZone";

function makeFile(name: string, type: string, size = 1024): File {
  const f = new File([new ArrayBuffer(size)], name, { type });
  return f;
}

describe("MultiDropZone", () => {
  it("rendert Drop-Zone und Eingabetext", () => {
    render(<MultiDropZone />);
    expect(screen.getByTestId("multi-drop-zone")).toBeTruthy();
    expect(screen.getByText("Datei(en) ablegen")).toBeTruthy();
  });

  it("zeigt nach File-Input eine Datei mit erkanntem MIME", () => {
    render(<MultiDropZone />);
    const input = screen.getByTestId("multi-drop-input");
    const file = makeFile("scan.pdf", "application/pdf");
    fireEvent.change(input, { target: { files: [file] } });
    expect(screen.getByText("scan.pdf")).toBeTruthy();
    // mindestens eine kompatible Operation (OCR, LLM-Text usw.)
    expect(screen.getAllByTestId(/^multi-op-btn-0-/).length).toBeGreaterThan(0);
  });

  it("zeigt für PNG die LLM-Vision-Operation an", () => {
    render(<MultiDropZone />);
    const input = screen.getByTestId("multi-drop-input");
    const file = makeFile("bild.png", "image/png");
    fireEvent.change(input, { target: { files: [file] } });
    expect(screen.getByTestId("multi-op-btn-0-llm.vision")).toBeTruthy();
  });

  it("zeigt für audio/mpeg nur audio.transcribe", () => {
    render(<MultiDropZone />);
    const input = screen.getByTestId("multi-drop-input");
    const file = makeFile("aufnahme.mp3", "audio/mpeg");
    fireEvent.change(input, { target: { files: [file] } });
    const btns = screen.getAllByTestId(/^multi-op-btn-0-/);
    expect(btns).toHaveLength(1);
    expect(btns[0].getAttribute("data-testid")).toBe("multi-op-btn-0-audio.transcribe");
  });

  it("zeigt 'Kein kompatibles Format' für unbekannte Datei", () => {
    render(<MultiDropZone />);
    const input = screen.getByTestId("multi-drop-input");
    const file = makeFile("unbekannt.xyz", "application/x-unknown");
    fireEvent.change(input, { target: { files: [file] } });
    expect(screen.getByText(/Kein kompatibles Format/)).toBeTruthy();
  });

  it("ruft onOperationSelect beim Klick auf Operation-Button auf", () => {
    const onSelect = vi.fn();
    render(<MultiDropZone onOperationSelect={onSelect} />);
    const input = screen.getByTestId("multi-drop-input");
    const file = makeFile("scan.pdf", "application/pdf");
    fireEvent.change(input, { target: { files: [file] } });
    const btn = screen.getByTestId("multi-op-btn-0-ocr.standard");
    fireEvent.click(btn);
    expect(onSelect).toHaveBeenCalledWith(
      file,
      expect.objectContaining({ id: "ocr.standard" }),
    );
  });

  it("mehrere Dateien werden einzeln gelistet", () => {
    render(<MultiDropZone />);
    const input = screen.getByTestId("multi-drop-input");
    const f1 = makeFile("a.pdf", "application/pdf");
    const f2 = makeFile("b.mp3", "audio/mpeg");
    fireEvent.change(input, { target: { files: [f1, f2] } });
    expect(screen.getByTestId("multi-drop-entry-0")).toBeTruthy();
    expect(screen.getByTestId("multi-drop-entry-1")).toBeTruthy();
  });

  it("'Alle entfernen' leert die Liste", () => {
    render(<MultiDropZone />);
    const input = screen.getByTestId("multi-drop-input");
    const file = makeFile("x.pdf", "application/pdf");
    fireEvent.change(input, { target: { files: [file] } });
    expect(screen.getByText("x.pdf")).toBeTruthy();
    const clearBtn = screen.getByText("Alle entfernen");
    fireEvent.click(clearBtn);
    expect(screen.queryByText("x.pdf")).toBeNull();
  });
});
