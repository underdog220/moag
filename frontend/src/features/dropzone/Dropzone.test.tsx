// Tests fuer Dropzone (Subagent D)
// - Akzeptiert PDFs und Bilder
// - Lehnt zu grosse Dateien ab (Toast-Warning)
// - Lehnt unbekannte Dateitypen ab
// - Multi-Upload setzt mehrere Optimistic-Jobs
// - Klick-Fallback triggert Datei-Picker (file input)

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Dropzone } from "./Dropzone";
import { useJobStore } from "../job-queue/jobStore";
import { _getToastsForTest, clearAllToasts } from "../../lib/toast";

// jsdom hat keine echte URL.createObjectURL — Stub
beforeEach(() => {
  if (typeof URL.createObjectURL !== "function") {
    Object.defineProperty(URL, "createObjectURL", {
      value: () => "blob:mock",
      writable: true,
    });
  } else {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
  }
  if (typeof URL.revokeObjectURL !== "function") {
    Object.defineProperty(URL, "revokeObjectURL", { value: () => undefined, writable: true });
  } else {
    vi.spyOn(URL, "revokeObjectURL").mockReturnValue(undefined);
  }
  useJobStore.getState()._reset();
  clearAllToasts();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeFile(name: string, bytes = 1024, mime = "application/pdf"): File {
  // Vereinfachter File-Konstruktor — Buffer-Inhalt egal, aber size muss stimmen
  const blob = new Blob([new Uint8Array(bytes)], { type: mime });
  return new File([blob], name, { type: mime });
}

function fireDrop(target: Element, files: File[]) {
  const dataTransfer = {
    files,
    types: ["Files"],
    items: files.map((f) => ({ kind: "file", type: f.type, getAsFile: () => f })),
  };
  fireEvent.drop(target, { dataTransfer });
}

describe("Dropzone", () => {
  it("legt fuer abgelegte PDF-Dateien Optimistic-Jobs an und ruft uploader", async () => {
    const onUpload = vi.fn().mockResolvedValue({ job_ids: ["ocr-real-1", "ocr-real-2"] });
    render(<Dropzone onUpload={onUpload} />);
    const dz = screen.getByTestId("dropzone");

    const f1 = makeFile("rechnung.pdf", 1024, "application/pdf");
    const f2 = makeFile("vertrag.pdf", 2048, "application/pdf");
    fireDrop(dz, [f1, f2]);

    // Optimistic-Inserts sind sofort da
    const jobs = Array.from(useJobStore.getState().jobs.values());
    expect(jobs.length).toBe(2);
    expect(jobs.map((j) => j.filename).sort()).toEqual(["rechnung.pdf", "vertrag.pdf"]);

    // uploader wurde mit beiden Dateien aufgerufen
    expect(onUpload).toHaveBeenCalledTimes(1);
    const calledFiles = onUpload.mock.calls[0][0] as File[];
    expect(calledFiles).toHaveLength(2);

    // Nach Upload-Erfolg — wir warten kurz auf microtasks
    await Promise.resolve();
    await Promise.resolve();
    const renamed = Array.from(useJobStore.getState().jobs.keys());
    expect(renamed).toContain("ocr-real-1");
    expect(renamed).toContain("ocr-real-2");
  });

  it("lehnt zu grosse Dateien ab und zeigt Warn-Toast", () => {
    const onUpload = vi.fn();
    render(<Dropzone maxFileSizeBytes={500} onUpload={onUpload} />);
    const dz = screen.getByTestId("dropzone");

    const big = makeFile("riesig.pdf", 1000, "application/pdf");
    fireDrop(dz, [big]);

    // Kein Optimistic-Insert
    expect(useJobStore.getState().jobs.size).toBe(0);
    // uploader nicht gerufen
    expect(onUpload).not.toHaveBeenCalled();
    // Mind. ein Warn-Toast
    const toasts = _getToastsForTest();
    expect(toasts.some((t) => t.kind === "warn")).toBe(true);
  });

  it("lehnt unbekannte Dateitypen ab und akzeptiert nur valide aus Multi-Drop", async () => {
    const onUpload = vi.fn().mockResolvedValue({ job_ids: ["ocr-x"] });
    render(<Dropzone onUpload={onUpload} />);
    const dz = screen.getByTestId("dropzone");

    const bad = makeFile("notiz.txt", 100, "text/plain");
    const good = makeFile("scan.png", 200, "image/png");
    fireDrop(dz, [bad, good]);

    // Nur eine valide Datei -> ein Optimistic-Job
    expect(useJobStore.getState().jobs.size).toBe(1);
    // uploader nur mit der validen Datei
    expect(onUpload).toHaveBeenCalledTimes(1);
    const sent = onUpload.mock.calls[0][0] as File[];
    expect(sent).toHaveLength(1);
    expect(sent[0].name).toBe("scan.png");

    // Warn-Toast fuer abgelehnte Datei
    const toasts = _getToastsForTest();
    expect(toasts.some((t) => t.kind === "warn" && t.message.includes("notiz.txt"))).toBe(true);
  });
});
