// Smoke-Test: CapabilitiesPage rendert ohne Crash und zeigt Ladezustand.

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CapabilitiesPage } from "./Capabilities";

// Fetch-Mock: haengt ewig (Ladezustand testen)
function makePendingFetch() {
  return vi.fn().mockImplementation(() => new Promise(() => undefined));
}

function renderCapabilities(fetchMock?: ReturnType<typeof vi.fn>) {
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
        <CapabilitiesPage />
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

describe("CapabilitiesPage", () => {
  it("rendert ohne Crash", () => {
    const { container } = renderCapabilities();
    expect(container).toBeTruthy();
  });

  it("zeigt h2-Seitenuberschrift", () => {
    renderCapabilities();
    const h2 = document.querySelector("h2");
    expect(h2?.textContent).toMatch(/OCRexpert.*Capabilities/i);
  });

  it("zeigt Lade-Hinweis waehrend fetch haengt", () => {
    renderCapabilities();
    expect(screen.getByText(/werden geladen/i)).toBeTruthy();
  });

  it("hat PageBadge mit korrekter id", () => {
    renderCapabilities();
    const badge = document.querySelector("[data-testid='page-badge']");
    expect(badge).toBeTruthy();
    expect(badge?.textContent).toContain("ocrexpert.capabilities");
  });

  it("hat Aktualisieren-Button", () => {
    renderCapabilities();
    expect(screen.getByRole("button", { name: /Aktualisieren/i })).toBeTruthy();
  });
});

describe("CapabilitiesPage mit Daten", () => {
  it("zeigt Engines-Abschnitt wenn Capabilities geladen", async () => {
    const mockData = {
      status: "ok",
      version: "0.7.2",
      engines_local: ["tesseract", "surya"],
      engines_octoboss: [],
      octoboss_reachable: false,
      libreoffice_available: true,
      shadow_writable: true,
      source_url: "http://vdr:17810/api/v1/health",
    };

    // Gezielt: capabilities-Anfrage mit mockData, actions mit Leer-Array
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (String(url).includes("capabilities")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(mockData),
            headers: new Headers({ "content-type": "application/json" }),
          });
        }
        // actions und alles andere
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({ actions: [], fetched_at: new Date().toISOString() }),
          headers: new Headers({ "content-type": "application/json" }),
        });
      }),
    );

    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0, staleTime: 0 },
      },
    });

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <CapabilitiesPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Warte auf Engine-Badges
    await waitFor(() => {
      const spans = document.querySelectorAll("span");
      const texts = Array.from(spans).map((s) => s.textContent ?? "");
      expect(texts).toContain("tesseract");
    });
    await waitFor(() => {
      const spans = document.querySelectorAll("span");
      const texts = Array.from(spans).map((s) => s.textContent ?? "");
      expect(texts).toContain("surya");
    });
    // Versionsnummer anzeigen
    await waitFor(() => {
      expect(document.body.textContent).toContain("0.7.2");
    });
  });
});
