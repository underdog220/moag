import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TopBar } from "./TopBar";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("TopBar", () => {
  it("rendert MOAG-Logo", () => {
    render(<TopBar />, { wrapper });
    expect(screen.getByText("MOAG")).toBeInTheDocument();
  });

  it("hat data-testid topbar", () => {
    render(<TopBar />, { wrapper });
    expect(screen.getByTestId("topbar")).toBeInTheDocument();
  });

  it("rendert Gesamt-Score-Anzeige (Placeholder-Daten)", () => {
    render(<TopBar />, { wrapper });
    // PlaceholderData liefert 72% — Score-Balken sollte vorhanden sein
    expect(screen.getByTestId("overall-score")).toBeInTheDocument();
  });

  it("zeigt Versions-Badge aus /api/health (#2)", async () => {
    // fetch mocken: /api/health liefert Version, aggregator faellt auf Mock zurueck.
    const mockFetch = vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.endsWith("/api/health")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: "ok",
            version: "0.2.3",
            build: "abc1234",
            build_ts: "2026-06-01T10:00:00Z",
            pipeline_ready: true,
          }),
        } as Response;
      }
      // aggregator-health: Fehler -> TopBar nutzt mockHealth()-Placeholder
      return { ok: false, status: 500, json: async () => ({}) } as Response;
    });
    vi.stubGlobal("fetch", mockFetch);

    render(<TopBar />, { wrapper });

    const badge = await screen.findByTestId("version-badge");
    expect(badge).toHaveTextContent("v0.2.3");
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});
