// Tests fuer CostTab.
// Deckt: Pie-Render, Tabellen-Render, GroupBy-Switch, USD-Format, Empty-State,
// Sortierung, Total-Anzeige.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { CostTab } from "../CostTab";
import * as apiModule from "../../../lib/api";
import type { CostResponse } from "../../../lib/types";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
    },
  });
}

function renderWithQuery(ui: ReactNode) {
  const client = makeQueryClient();
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const MOCK_COST_RESPONSE: CostResponse = {
  from: "2026-04-16T00:00:00Z",
  to: "2026-05-16T23:59:59Z",
  group_by: "client",
  groups: [
    {
      key: "ocrexpert",
      calls: 1247,
      total_tokens: 4831200,
      prompt_tokens: 3124800,
      completion_tokens: 1706400,
      total_cost_usd: 14.23,
    },
    {
      key: "chaoscrusher",
      calls: 382,
      total_tokens: 1125400,
      prompt_tokens: 812000,
      completion_tokens: 313400,
      total_cost_usd: 3.71,
    },
    {
      key: "valiador",
      calls: 94,
      total_tokens: 412800,
      prompt_tokens: 321600,
      completion_tokens: 91200,
      total_cost_usd: 1.06,
    },
  ],
  total: {
    calls: 1723,
    total_tokens: 6369400,
    prompt_tokens: 4258400,
    completion_tokens: 2111000,
    total_cost_usd: 19.0,
  },
};

const EMPTY_COST_RESPONSE: CostResponse = {
  from: "2026-05-01T00:00:00Z",
  to: "2026-05-01T23:59:59Z",
  group_by: "client",
  groups: [],
  total: {
    calls: 0,
    total_tokens: 0,
    prompt_tokens: 0,
    completion_tokens: 0,
    total_cost_usd: 0,
  },
};

beforeEach(() => {
  window.localStorage.clear();
  vi.spyOn(apiModule.api, "getCockpitCost").mockResolvedValue(MOCK_COST_RESPONSE);
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("CostTab", () => {
  it("rendert CostTab mit Ueberschrift und GroupBy-Switcher", async () => {
    renderWithQuery(<CostTab />);
    expect(screen.getByTestId("cost-tab")).toBeInTheDocument();
    expect(screen.getByText("Kosten")).toBeInTheDocument();
    expect(screen.getByTestId("cost-groupby-switcher")).toBeInTheDocument();
  });

  it("zeigt Pie-Chart nach Datenladen", async () => {
    renderWithQuery(<CostTab />);
    await waitFor(() => {
      expect(screen.getByTestId("cost-pie-chart")).toBeInTheDocument();
    });
  });

  it("zeigt Tabelle mit allen 3 Buckets", async () => {
    renderWithQuery(<CostTab />);
    await waitFor(() => {
      expect(screen.getByTestId("cost-table")).toBeInTheDocument();
    });
    expect(screen.getByTestId("cost-row-ocrexpert")).toBeInTheDocument();
    expect(screen.getByTestId("cost-row-chaoscrusher")).toBeInTheDocument();
    expect(screen.getByTestId("cost-row-valiador")).toBeInTheDocument();
  });

  it("formatiert USD korrekt ($14.23)", async () => {
    renderWithQuery(<CostTab />);
    await waitFor(() => {
      expect(screen.getByTestId("cost-usd-ocrexpert")).toHaveTextContent("$14.23");
    });
  });

  it("GroupBy-Switch aendert Gruppierung (model)", async () => {
    renderWithQuery(<CostTab />);
    const modelBtn = screen.getByTestId("cost-groupby-model");
    fireEvent.click(modelBtn);
    await waitFor(() => {
      expect(modelBtn).toHaveAttribute("aria-pressed", "true");
    });
    // API sollte mit groupBy=model erneut aufgerufen werden
    await waitFor(() => {
      expect(apiModule.api.getCockpitCost).toHaveBeenCalledWith(
        expect.objectContaining({ groupBy: "model" }),
      );
    });
  });

  it("zeigt Empty-State wenn keine Gruppen vorhanden", async () => {
    vi.restoreAllMocks();
    vi.spyOn(apiModule.api, "getCockpitCost").mockResolvedValue(EMPTY_COST_RESPONSE);
    renderWithQuery(<CostTab />);
    await waitFor(() => {
      expect(screen.getByText(/Keine Kostendaten/i)).toBeInTheDocument();
    });
  });

  it("zeigt Gesamt-Kosten im Totals-Block", async () => {
    renderWithQuery(<CostTab />);
    await waitFor(() => {
      expect(screen.getByTestId("cost-total-usd")).toHaveTextContent("$19.00");
    });
  });

  it("persistiert GroupBy in localStorage", async () => {
    renderWithQuery(<CostTab />);
    const dayBtn = screen.getByTestId("cost-groupby-day");
    fireEvent.click(dayBtn);
    await waitFor(() => {
      expect(window.localStorage.getItem("moag.cost.groupby")).toBe("day");
    });
  });
});
