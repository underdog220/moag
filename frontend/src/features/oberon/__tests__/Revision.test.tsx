// Tests fuer die DSGVO-Revisions-Seite (Document-Store Side-by-Side + Verdikt + Filter).

import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

import { RevisionPage } from "../pages/Revision";
import * as apiModule from "../../../lib/api";

function makeQC() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, refetchInterval: false, staleTime: 0 } },
  });
}

function wrap(node: ReactNode) {
  return (
    <MemoryRouter initialEntries={["/oberon/revision"]}>
      <QueryClientProvider client={makeQC()}>{node}</QueryClientProvider>
    </MemoryRouter>
  );
}

const DOC = {
  sessionId: "doc.pdf_123",
  clientId: "valiador",
  documentType: "Grundbuchauszug",
  filename: "doc.pdf",
  hatOriginalText: true,
  hatOberonAnonymisiert: true,
  oberonPiiFound: true,
  oberonPiiTypes: ["PERSON", "ADRESSE"],
  rescanStatus: "ok",
  timestamp: new Date().toISOString(),
};

// Standard-Verdikt-Mock (leer), in jedem Test ueberschreibbar.
function mockVerdicts(verdicts: Record<string, unknown> = {}) {
  vi.spyOn(apiModule.api.oberon, "getRevisionVerdicts").mockResolvedValue({ verdicts } as any);
}

describe("RevisionPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("zeigt Stub-Hinweis wenn kein Token", async () => {
    vi.spyOn(apiModule.api.oberon, "getRevisionDocuments").mockResolvedValue({
      stub: true, message: "Kein Oberon-Token konfiguriert", fetched_at: new Date().toISOString(),
    } as any);
    mockVerdicts();

    render(wrap(<RevisionPage />));
    await waitFor(() => {
      expect(screen.getByTestId("oberon-revision-page")).toBeInTheDocument();
      expect(screen.getByText("Keine Dokumente")).toBeInTheDocument();
    });
  });

  it("listet Dokumente und zeigt Original + Anonymisiert nebeneinander", async () => {
    vi.spyOn(apiModule.api.oberon, "getRevisionDocuments").mockResolvedValue({ documents: [DOC], count: 1 } as any);
    mockVerdicts();
    const fileSpy = vi
      .spyOn(apiModule.api.oberon, "getRevisionFile")
      .mockImplementation(async (_sid: string, datei: string) => {
        if (datei === "original.txt") return { session_id: DOC.sessionId, datei, content: "Max Mustermann", content_type: "text/plain" } as any;
        return { session_id: DOC.sessionId, datei, content: "[PERSON]", content_type: "text/plain" } as any;
      });

    render(wrap(<RevisionPage />));
    await waitFor(() => expect(screen.getByTestId(`revision-item-${DOC.sessionId}`)).toBeInTheDocument());
    await waitFor(() => {
      expect(screen.getByTestId("revision-befund")).toBeInTheDocument();
      expect(screen.getByText("Max Mustermann")).toBeInTheDocument();
      expect(screen.getByText("[PERSON]")).toBeInTheDocument();
    });
    expect(fileSpy).toHaveBeenCalledWith(DOC.sessionId, "original.txt");
    expect(fileSpy).toHaveBeenCalledWith(DOC.sessionId, "oberon_anonymisiert.txt");
  });

  it("Verdikt-Button ruft setRevisionVerdict", async () => {
    vi.spyOn(apiModule.api.oberon, "getRevisionDocuments").mockResolvedValue({ documents: [DOC], count: 1 } as any);
    mockVerdicts();
    vi.spyOn(apiModule.api.oberon, "getRevisionFile").mockResolvedValue({
      session_id: DOC.sessionId, datei: "original.txt", content: "x", content_type: "text/plain",
    } as any);
    const setSpy = vi.spyOn(apiModule.api.oberon, "setRevisionVerdict").mockResolvedValue({ verdict: "geprueft" } as any);

    render(wrap(<RevisionPage />));
    await waitFor(() => expect(screen.getByTestId("verdict-geprueft")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("verdict-geprueft"));
    await waitFor(() => {
      expect(setSpy).toHaveBeenCalledWith({ session_id: DOC.sessionId, verdict: "geprueft" });
    });
  });

  it("Filter: Suche grenzt die Liste ein", async () => {
    const docB = { ...DOC, sessionId: "andere_999", filename: "rechnung.pdf", clientId: "ocrexpert" };
    vi.spyOn(apiModule.api.oberon, "getRevisionDocuments").mockResolvedValue({ documents: [DOC, docB], count: 2 } as any);
    mockVerdicts();
    vi.spyOn(apiModule.api.oberon, "getRevisionFile").mockResolvedValue({
      session_id: "x", datei: "original.txt", content: "x", content_type: "text/plain",
    } as any);

    render(wrap(<RevisionPage />));
    await waitFor(() => expect(screen.getByTestId(`revision-item-${docB.sessionId}`)).toBeInTheDocument());

    fireEvent.change(screen.getByTestId("revision-search"), { target: { value: "rechnung" } });
    await waitFor(() => {
      expect(screen.queryByTestId(`revision-item-${DOC.sessionId}`)).not.toBeInTheDocument();
      expect(screen.getByTestId(`revision-item-${docB.sessionId}`)).toBeInTheDocument();
    });
  });

  it("Diff-Highlight ist standardmaessig an und rendert Zeilen je Spalte", async () => {
    vi.spyOn(apiModule.api.oberon, "getRevisionDocuments").mockResolvedValue({ documents: [DOC], count: 1 } as any);
    mockVerdicts();
    vi.spyOn(apiModule.api.oberon, "getRevisionFile").mockImplementation(async (_sid: string, datei: string) => {
      if (datei === "original.txt") return { session_id: DOC.sessionId, datei, content: "Zeile A\nMax Mustermann\nZeile C", content_type: "text/plain" } as any;
      return { session_id: DOC.sessionId, datei, content: "Zeile A\n[PERSON]\nZeile C", content_type: "text/plain" } as any;
    });

    render(wrap(<RevisionPage />));
    await waitFor(() => expect(screen.getByTestId("revision-befund")).toBeInTheDocument());
    // Diff ist per Default an -> unveraenderte Zeile erscheint als Element in beiden Spalten
    await waitFor(() => {
      expect(screen.getAllByText("Zeile A").length).toBeGreaterThanOrEqual(2);
    });
    // Toggle aus -> Plain-Text-Ansicht, kein Crash
    fireEvent.click(screen.getByTestId("revision-diff-toggle"));
    await waitFor(() => expect(screen.getByTestId("revision-befund")).toBeInTheDocument());
  });

  it("PDF-Ansicht: Umschalten zeigt PDF-Panels", async () => {
    const pdfDoc = { ...DOC, hatOriginalPdf: true, hatRedactedPdf: true };
    vi.spyOn(apiModule.api.oberon, "getRevisionDocuments").mockResolvedValue({ documents: [pdfDoc], count: 1 } as any);
    mockVerdicts();
    vi.spyOn(apiModule.api.oberon, "getRevisionFile").mockResolvedValue({
      session_id: pdfDoc.sessionId, datei: "original.txt", content: "x", content_type: "text/plain",
    } as any);

    render(wrap(<RevisionPage />));
    await waitFor(() => expect(screen.getByTestId("revision-befund")).toBeInTheDocument());

    // Auf PDF umschalten (zweiter Button in der Toggle-Gruppe)
    fireEvent.click(screen.getByText("PDF"));
    await waitFor(() => {
      expect(screen.getByTestId("revision-pdf-view")).toBeInTheDocument();
      expect(screen.getByLabelText("Original (PDF)")).toBeInTheDocument();
      expect(screen.getByLabelText("Geschwärzt (PDF)")).toBeInTheDocument();
    });
  });

  it("leere Liste → EmptyState ohne Crash", async () => {
    vi.spyOn(apiModule.api.oberon, "getRevisionDocuments").mockResolvedValue({ documents: [], count: 0 } as any);
    mockVerdicts();
    render(wrap(<RevisionPage />));
    await waitFor(() => expect(screen.getByText("Keine Dokumente")).toBeInTheDocument());
  });
});
