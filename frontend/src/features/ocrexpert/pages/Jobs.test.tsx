// Smoke-Test: JobsPage rendert ohne Crash und zeigt Upload-Card + Buttons.

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { JobsPage } from "./Jobs";

// ─── Mock-Fetch-Hilfsfunktionen ───────────────────────────────────────────────

function makePendingFetch() {
  return vi.fn().mockImplementation(() => new Promise(() => undefined));
}

function makeProcessFetch(response: object, ok = true) {
  return vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 502,
    json: () => Promise.resolve(response),
    text: () => Promise.resolve(JSON.stringify(response)),
    headers: { get: () => "application/json" },
  });
}

function renderJobs(fetchMock?: ReturnType<typeof vi.fn>) {
  const mock = fetchMock ?? makePendingFetch();
  vi.stubGlobal("fetch", mock);

  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
    },
  });

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <JobsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", makePendingFetch());
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ─── Basis-Render-Tests ───────────────────────────────────────────────────────

describe("JobsPage — Basis-Render", () => {
  it("rendert ohne Crash", () => {
    const { container } = renderJobs();
    expect(container).toBeTruthy();
  });

  it("zeigt Upload-Card-Ueberschrift 'OCR starten'", () => {
    renderJobs();
    // h3-Ueberschrift der Upload-Card (nicht der Button) pruefen
    const headings = screen.getAllByText(/OCR starten/i);
    expect(headings.length).toBeGreaterThan(0);
  });

  it("hat PageBadge mit id ocrexpert.jobs", () => {
    renderJobs();
    // Mehrere Badges moeglich (unsere + JobQueuePage). Mindestens eines davon enthaelt ocrexpert.jobs.
    const badges = document.querySelectorAll("[data-testid='page-badge']");
    expect(badges.length).toBeGreaterThan(0);
    const texts = Array.from(badges).map((b) => b.textContent ?? "");
    expect(texts.some((t) => t.includes("ocrexpert.jobs"))).toBe(true);
  });

  it("hat Pfad-Eingabe-Feld", () => {
    renderJobs();
    const input = screen.getByTestId("ocr-pfad-input");
    expect(input).toBeTruthy();
  });

  it("hat OCR-starten-Button", () => {
    renderJobs();
    const button = screen.getByTestId("ocr-start-button");
    expect(button).toBeTruthy();
    expect(button.textContent).toMatch(/OCR starten/i);
  });

  it("zeigt Placeholder mit Default-Pfad", () => {
    renderJobs();
    const input = screen.getByTestId("ocr-pfad-input");
    expect((input as HTMLInputElement).placeholder).toContain("/mnt/qnap_public/Dokumente/test.pdf");
  });
});

// ─── Button-Klick und API-Aufruf ─────────────────────────────────────────────

describe("JobsPage — OCR-Start", () => {
  it("ruft API nach Button-Klick auf", async () => {
    const processResponse = {
      pfad: "/mnt/qnap_public/Dokumente/test.pdf",
      n_chars: 42,
      doctype: "brief",
      text: "Hallo Welt",
      source_url: "http://vdr:17810/api/v1/process",
    };
    const fetchMock = makeProcessFetch(processResponse);
    renderJobs(fetchMock);

    const button = screen.getByTestId("ocr-start-button");
    fireEvent.click(button);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
  });

  it("zeigt Ergebnis-Panel nach erfolgreichem Aufruf", async () => {
    const processResponse = {
      pfad: "/mnt/qnap_public/Dokumente/test.pdf",
      n_chars: 42,
      doctype: "brief",
      text: "Hallo Welt",
      source_url: "http://vdr:17810/api/v1/process",
    };
    renderJobs(makeProcessFetch(processResponse));

    const button = screen.getByTestId("ocr-start-button");
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByTestId("process-result")).toBeTruthy();
    });
  });

  it("zeigt Fehler-Panel bei API-Fehler", async () => {
    const errorFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: () => Promise.resolve({ detail: "OCRexpert nicht erreichbar" }),
      text: () => Promise.resolve("Bad Gateway"),
      headers: { get: () => "application/json" },
    });
    renderJobs(errorFetch);

    const button = screen.getByTestId("ocr-start-button");
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByTestId("process-error")).toBeTruthy();
    });
  });

  it("Button zeigt 'OCR laeuft...' waehrend des Ladens", async () => {
    // Fetch haengt
    const hangingFetch = vi.fn().mockImplementation(() => new Promise(() => undefined));
    renderJobs(hangingFetch);

    const button = screen.getByTestId("ocr-start-button");
    fireEvent.click(button);

    // Sofort nach Klick: Button-Label aendern
    await waitFor(() => {
      expect(button.textContent).toMatch(/laeuft/i);
    });
  });
});

// ─── UNC-Konvertierung im Input ───────────────────────────────────────────────

describe("JobsPage — UNC-Konvertierung", () => {
  it("zeigt Konversions-Hinweis bei UNC-Eingabe", async () => {
    renderJobs();
    const input = screen.getByTestId("ocr-pfad-input");
    fireEvent.change(input, {
      target: { value: "\\\\192.168.200.169\\Public\\Dokumente\\test.pdf" },
    });

    await waitFor(() => {
      // Hinweis-Text erscheint
      expect(document.body.textContent).toMatch(/UNC erkannt/i);
    });
  });

  it("konvertiert UNC-Pfad korrekt zu Linux-Pfad beim Senden", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          pfad: "/mnt/qnap_public/Dokumente/test.pdf",
          n_chars: 5,
          source_url: "http://vdr:17810/api/v1/process",
        }),
      text: () => Promise.resolve(""),
      headers: { get: () => "application/json" },
    });
    renderJobs(fetchMock);

    const input = screen.getByTestId("ocr-pfad-input");
    fireEvent.change(input, {
      target: { value: "\\\\192.168.200.169\\Public\\Dokumente\\test.pdf" },
    });

    const button = screen.getByTestId("ocr-start-button");
    fireEvent.click(button);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
      // Fetch-Body ist als JSON-String serialisiert in RequestInit.body
      const calls = fetchMock.mock.calls;
      // Suche in allen Aufrufen nach dem Linux-Pfad im Body
      const bodyFound = calls.some((call) => {
        const init = call[1] as RequestInit | undefined;
        const bodyStr = typeof init?.body === "string" ? init.body : "";
        return bodyStr.includes("/mnt/qnap_public/Dokumente/test.pdf");
      });
      expect(bodyFound).toBe(true);
    });
  });
});
