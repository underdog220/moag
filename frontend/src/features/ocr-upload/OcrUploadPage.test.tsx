// OcrUploadPage.test.tsx — Upload-Flow mit gemocktem fetch (FormData).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { OcrUploadPage } from "./OcrUploadPage";

function makeFile(name: string, type: string, size = 1024): File {
  return new File([new ArrayBuffer(size)], name, { type });
}

function jsonResponse(body: object, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    headers: { get: () => "application/json" },
  } as unknown as Response;
}

const OK_BODY = {
  ok: true,
  status: "ok",
  upstream_status: 200,
  filename: "scan.pdf",
  duration_ms: 1500,
  result: {
    status: "ok",
    job_id: "abc",
    text: "Dies ist ein Testdokument.",
    text_len: 26,
    pages: 1,
    quality: { passed: true, score: 0.91, avg_confidence: 0.88, reason: "ok" },
    duration_ms: 1500,
  },
};

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OcrUploadPage", () => {
  it("rendert die Seite mit Drop-Zone und PageBadge", () => {
    render(<OcrUploadPage />);
    expect(screen.getByTestId("ocr-upload-page")).toBeTruthy();
    expect(screen.getByTestId("page-badge")).toBeTruthy();
    // Submit ist ohne Datei deaktiviert
    expect(screen.getByTestId("ocr-upload-submit")).toHaveProperty("disabled", true);
  });

  it("lädt eine Datei hoch und zeigt das OCR-Ergebnis an", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(OK_BODY));
    vi.stubGlobal("fetch", fetchMock);

    render(<OcrUploadPage />);

    // Datei auswählen
    const input = screen.getByTestId("ocr-upload-input");
    fireEvent.change(input, { target: { files: [makeFile("scan.pdf", "application/pdf")] } });
    expect(screen.getByTestId("ocr-upload-selected")).toBeTruthy();

    // Verarbeiten klicken
    fireEvent.click(screen.getByTestId("ocr-upload-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("ocr-upload-result")).toBeTruthy();
    });

    // fetch ging an den richtigen Endpoint mit FormData (POST)
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/ocrexpert/upload");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    const fd = init.body as FormData;
    expect(fd.get("file")).toBeInstanceOf(File);
    expect((fd.get("file") as File).name).toBe("scan.pdf");

    // Ergebnis-Text sichtbar
    expect(screen.getByTestId("ocr-upload-text").textContent).toContain(
      "Dies ist ein Testdokument.",
    );
  });

  it("zeigt eine Fehlermeldung wenn das Backend ok=false liefert (OCRexpert-Fehler)", async () => {
    const errBody = {
      ok: false,
      status: "error",
      upstream_status: 422,
      error: "OCRexpert antwortete HTTP 422",
      upstream: { detail: "Aktuell nur PDF" },
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(errBody, 200));
    vi.stubGlobal("fetch", fetchMock);

    render(<OcrUploadPage />);
    const input = screen.getByTestId("ocr-upload-input");
    fireEvent.change(input, { target: { files: [makeFile("scan.pdf", "application/pdf")] } });
    fireEvent.click(screen.getByTestId("ocr-upload-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("ocr-upload-error")).toBeTruthy();
    });
    expect(screen.getByTestId("ocr-upload-error").textContent).toContain("HTTP 422");
    // Kein Ergebnis-Panel
    expect(screen.queryByTestId("ocr-upload-result")).toBeNull();
  });

  it("behandelt einen Validierungs-Fehler (HTTP 400 mit detail)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ detail: "Dateiendung .exe nicht unterstuetzt" }, 400));
    vi.stubGlobal("fetch", fetchMock);

    render(<OcrUploadPage />);
    const input = screen.getByTestId("ocr-upload-input");
    fireEvent.change(input, { target: { files: [makeFile("doc.pdf", "application/pdf")] } });
    fireEvent.click(screen.getByTestId("ocr-upload-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("ocr-upload-error")).toBeTruthy();
    });
    expect(screen.getByTestId("ocr-upload-error").textContent).toContain("nicht unterstuetzt");
  });
});
