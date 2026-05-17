// Smoke-Test: LogsPage rendert ohne Crash und zeigt Ladezustand.

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LogsPage } from "./Logs";

function makeFetchWithText(text: string) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: () => Promise.resolve(text),
    json: () => Promise.resolve({}),
    headers: { get: () => "text/plain" },
  });
}

function renderLogs(fetchMock?: ReturnType<typeof vi.fn>) {
  const mock = fetchMock ?? makeFetchWithText("2026-05-17 INFO Zeile 1\n2026-05-17 INFO Zeile 2");
  vi.stubGlobal("fetch", mock);

  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
    },
  });

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <LogsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", makeFetchWithText("Log-Zeile"));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("LogsPage", () => {
  it("rendert ohne Crash", () => {
    const { container } = renderLogs();
    expect(container).toBeTruthy();
  });

  it("zeigt h2-Seitenuberschrift", () => {
    renderLogs();
    const h2 = document.querySelector("h2");
    expect(h2?.textContent).toMatch(/OCRexpert.*Logs/i);
  });

  it("hat PageBadge mit korrekter id", () => {
    renderLogs();
    const badge = document.querySelector("[data-testid='page-badge']");
    expect(badge).toBeTruthy();
    expect(badge?.textContent).toContain("ocrexpert.logs");
  });

  it("zeigt Log-Inhalt nach dem Laden", async () => {
    renderLogs(makeFetchWithText("2026-05-17 INFO Zeile 1\n2026-05-17 INFO Zeile 2"));
    const pre = await screen.findByTestId("ocrexpert-logs-pre");
    await waitFor(() => {
      expect(pre.textContent).toContain("Zeile 1");
    });
  });

  it("hat Copy-Button", () => {
    renderLogs();
    expect(screen.getByRole("button", { name: /Kopieren/i })).toBeTruthy();
  });

  it("hat Zeilen-Selector mit Optionen", () => {
    renderLogs();
    const select = screen.getByRole("combobox");
    expect(select).toBeTruthy();
    const options = Array.from(select.querySelectorAll("option"));
    expect(options.length).toBeGreaterThan(0);
  });

  it("zeigt Fehleranzeige bei HTTP-Fehler", async () => {
    const errorFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      text: () => Promise.resolve("Bad Gateway"),
      headers: { get: () => null },
    });
    renderLogs(errorFetch);
    await waitFor(() => {
      expect(screen.getByText(/Fehler beim Laden/i)).toBeTruthy();
    });
  });
});
