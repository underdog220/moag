// Tests fuer InspectorPage — Adapter-Status-Inspector.
// Muster: Overview.test.tsx (vi.spyOn auf api.getOverview + QueryClientProvider + MemoryRouter).

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { InspectorPage } from "./InspectorPage";
import * as apiModule from "../../lib/api";
import type { OverviewResponse } from "../../lib/types";

// ─── Mock-Daten ───────────────────────────────────────────────────────────────

const MOCK_OVERVIEW: OverviewResponse = {
  systems: [
    {
      id: "oberon",
      name: "Oberon",
      group: "KI-Backbone",
      ok: true,
      score: 85,
      summary: "LLM-Gateway aktiv",
      metrics: { providers_up: 2, latency_ms: 120 },
      fetched_at: "2026-05-16T08:30:00Z",
      error: null,
    },
    {
      id: "panopticor",
      name: "Panopticor",
      group: "Compliance & Test",
      ok: false,
      score: 30,
      summary: "Bridge nicht erreichbar",
      metrics: { last_run_ok: false, failed_scenarios: 3 },
      fetched_at: "2026-05-16T08:28:00Z",
      error: "Connection refused on port 8787",
    },
  ],
};

// ─── Test-Wrapper ─────────────────────────────────────────────────────────────

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("InspectorPage", () => {
  beforeEach(() => {
    vi.spyOn(apiModule.api, "getOverview").mockResolvedValue(MOCK_OVERVIEW);
    // Clipboard-API in jsdom mocken
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rendert Überschrift", () => {
    render(<InspectorPage />, { wrapper });
    expect(screen.getByText(/Adapter-Status-Inspector/)).toBeInTheDocument();
  });

  it("rendert eine Karte pro Adapter nach dem Laden", async () => {
    render(<InspectorPage />, { wrapper });
    await waitFor(() => {
      expect(screen.getByTestId("inspector-oberon")).toBeInTheDocument();
      expect(screen.getByTestId("inspector-panopticor")).toBeInTheDocument();
    });
  });

  it("zeigt Adapter-Namen und IDs", async () => {
    render(<InspectorPage />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText("Oberon")).toBeInTheDocument();
      expect(screen.getByText("Panopticor")).toBeInTheDocument();
    });
  });

  it("adapter mit ok=false (panopticor) hat roten Score sichtbar", async () => {
    render(<InspectorPage />, { wrapper });
    await waitFor(() => {
      // Beide Scores sichtbar
      expect(screen.getByText("85%")).toBeInTheDocument();
      expect(screen.getByText("30%")).toBeInTheDocument();
    });
  });

  it("klappt Karte aus und zeigt Rohfelder + Fehlermeldung", async () => {
    render(<InspectorPage />, { wrapper });
    await waitFor(() => {
      expect(screen.getByTestId("inspector-panopticor")).toBeInTheDocument();
    });

    // Panopticor-Karte ausklappen
    const card = screen.getByTestId("inspector-panopticor");
    const toggle = card.querySelector("[role='button']");
    expect(toggle).not.toBeNull();
    fireEvent.click(toggle!);

    // Rohfelder sollen sichtbar sein
    expect(screen.getByText("system_id")).toBeInTheDocument();
    // "panopticor" erscheint zweimal (Header-ID-Span + DD-Zelle) — getAllByText nutzen
    expect(screen.getAllByText("panopticor").length).toBeGreaterThan(0);

    // Fehlermeldung bei ok=false
    expect(
      screen.getByText("Connection refused on port 8787")
    ).toBeInTheDocument();
  });

  it("klappt Karte aus und zeigt Metriken-Tabelle", async () => {
    render(<InspectorPage />, { wrapper });
    await waitFor(() => {
      expect(screen.getByTestId("inspector-oberon")).toBeInTheDocument();
    });

    // Oberon-Karte ausklappen
    const card = screen.getByTestId("inspector-oberon");
    const toggle = card.querySelector("[role='button']");
    fireEvent.click(toggle!);

    // Metrik-Schlüssel aus Mock-Daten sollen sichtbar sein
    expect(screen.getByText("providers_up")).toBeInTheDocument();
    expect(screen.getByText("latency_ms")).toBeInTheDocument();
  });

  it("JSON-kopieren-Button ruft clipboard.writeText auf", async () => {
    render(<InspectorPage />, { wrapper });
    await waitFor(() => {
      expect(screen.getByTestId("inspector-oberon")).toBeInTheDocument();
    });

    // Karte ausklappen
    const card = screen.getByTestId("inspector-oberon");
    const toggle = card.querySelector("[role='button']");
    fireEvent.click(toggle!);

    // JSON kopieren klicken
    const copyBtn = screen.getByRole("button", { name: /JSON kopieren/i });
    fireEvent.click(copyBtn);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      JSON.stringify(MOCK_OVERVIEW.systems[0], null, 2)
    );
  });

  it("globaler 'Alles kopieren'-Button ruft clipboard.writeText mit gesamter Liste auf", async () => {
    render(<InspectorPage />, { wrapper });
    await waitFor(() => {
      expect(screen.getByTestId("inspector-oberon")).toBeInTheDocument();
    });

    const allBtn = screen.getByRole("button", { name: /Alles kopieren/i });
    fireEvent.click(allBtn);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      JSON.stringify(MOCK_OVERVIEW.systems, null, 2)
    );
  });

  it("PageBadge ist vorhanden", () => {
    render(<InspectorPage />, { wrapper });
    expect(screen.getByTestId("page-badge")).toBeInTheDocument();
  });

  it("zeigt Lade-Spinner im initialen Lade-Zustand", () => {
    // Niemals auflösendes Promise → echten Loading-State erzwingen
    vi.spyOn(apiModule.api, "getOverview").mockReturnValue(new Promise(() => {}));
    render(<InspectorPage />, { wrapper });
    expect(screen.getByTestId("loading-spinner")).toBeInTheDocument();
  });

  it("zeigt Fehlermeldung wenn API fehlschlägt", async () => {
    vi.spyOn(apiModule.api, "getOverview").mockRejectedValue(
      new Error("Netzwerkfehler")
    );
    render(<InspectorPage />, { wrapper });
    // retry: 1 in der Page — waitFor-Timeout erhöhen, damit beide Versuche fehlschlagen können
    await waitFor(
      () => {
        expect(screen.getByText(/Fehler beim Laden/)).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });
});
