import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Overview } from "./Overview";
import * as apiModule from "../../lib/api";
import type { OverviewResponse } from "../../lib/types";

// Mock-Daten für /api/v1/overview
const MOCK_OVERVIEW: OverviewResponse = {
  systems: [
    {
      id: "oberon",
      name: "Oberon",
      group: "KI-Backbone",
      ok: true,
      score: 85,
      summary: "LLM-Gateway aktiv",
      metrics: { providers_up: 2 },
      fetched_at: "2026-05-16T08:30:00Z",
      error: null,
    },
    {
      id: "octoboss",
      name: "OctoBoss",
      group: "KI-Backbone",
      ok: true,
      score: 78,
      summary: "Hub erreichbar",
      metrics: { nodes_connected: 2 },
      fetched_at: "2026-05-16T08:30:00Z",
      error: null,
    },
    {
      id: "nasdominator",
      name: "NasDominator",
      group: "Infrastruktur",
      ok: true,
      score: 80,
      summary: "NAS OK",
      metrics: { services_up: 4 },
      fetched_at: "2026-05-16T08:30:00Z",
      error: null,
    },
    {
      id: "custos",
      name: "Custos",
      group: "Compliance & Test",
      ok: false,
      score: 55,
      summary: "Noch nicht angebunden",
      metrics: {},
      fetched_at: "2026-05-16T08:30:00Z",
      error: "Phase 4",
    },
  ],
};

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Overview", () => {
  beforeEach(() => {
    vi.spyOn(apiModule.api, "getOverview").mockResolvedValue(MOCK_OVERVIEW);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rendert Überschrift", () => {
    render(<Overview />, { wrapper });
    expect(screen.getByText(/MOAG — Systemübersicht/)).toBeInTheDocument();
  });

  it("rendert system-cards nach dem Laden", async () => {
    render(<Overview />, { wrapper });
    await waitFor(() => {
      expect(screen.getByTestId("system-card-oberon")).toBeInTheDocument();
      expect(screen.getByTestId("system-card-octoboss")).toBeInTheDocument();
      expect(screen.getByTestId("system-card-nasdominator")).toBeInTheDocument();
      expect(screen.getByTestId("system-card-custos")).toBeInTheDocument();
    });
  });

  it("rendert Gruppen-Sektionen", async () => {
    render(<Overview />, { wrapper });
    await waitFor(() => {
      expect(screen.getByTestId("group-KI-Backbone")).toBeInTheDocument();
      expect(screen.getByTestId("group-Infrastruktur")).toBeInTheDocument();
      expect(screen.getByTestId("group-Compliance & Test")).toBeInTheDocument();
    });
  });

  it("PageBadge ist vorhanden", async () => {
    render(<Overview />, { wrapper });
    // PageBadge rendert sofort, kein Warten nötig
    expect(screen.getByTestId("page-badge")).toBeInTheDocument();
  });
});
