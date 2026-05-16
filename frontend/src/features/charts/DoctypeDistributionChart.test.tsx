// Tests fuer DoctypeDistributionChart (Pie + Trend-Line).

import { describe, expect, it, vi, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { DoctypeDistributionChart } from "./DoctypeDistributionChart";
import * as apiModule from "../../lib/api";
import { renderWithQuery } from "./__test_utils";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DoctypeDistributionChart", () => {
  it("zeigt Skeleton waehrend isLoading", () => {
    vi.spyOn(apiModule.api, "getDoctypeDistribution").mockImplementation(
      () => new Promise(() => undefined),
    );
    renderWithQuery(<DoctypeDistributionChart />);
    expect(screen.getByTestId("chart-skeleton")).toBeInTheDocument();
  });

  it("rendert Pie + Trend bei genuegend Daten", async () => {
    vi.spyOn(apiModule.api, "getDoctypeDistribution").mockResolvedValue({
      current: [
        { doctype: "Rechnung", count: 65, pct: 0.42 },
        { doctype: "Mietvertrag", count: 48, pct: 0.31 },
        { doctype: "Lageplan", count: 19, pct: 0.12 },
        { doctype: "Sonstiges", count: 24, pct: 0.15 },
        { doctype: "Klage", count: 5, pct: 0.03 },
      ],
      trend: [
        { ts: "2026-05-04", Rechnung: 12, Mietvertrag: 8 },
        { ts: "2026-05-05", Rechnung: 22, Mietvertrag: 15 },
        { ts: "2026-05-06", Rechnung: 31, Mietvertrag: 25 },
        { ts: "2026-05-07", Rechnung: 28, Mietvertrag: 22 },
        { ts: "2026-05-08", Rechnung: 35, Mietvertrag: 30 },
      ],
    });
    renderWithQuery(<DoctypeDistributionChart />);
    await waitFor(() => {
      expect(screen.getByTestId("doctype-pie-wrap")).toBeInTheDocument();
      expect(screen.getByTestId("doctype-trend-wrap")).toBeInTheDocument();
    });
  });

  it("zeigt Empty-State bei wenig Daten in current UND trend", async () => {
    vi.spyOn(apiModule.api, "getDoctypeDistribution").mockResolvedValue({
      current: [{ doctype: "Rechnung", count: 1, pct: 1 }],
      trend: [{ ts: "2026-05-06", Rechnung: 1 }],
    });
    renderWithQuery(<DoctypeDistributionChart />);
    await waitFor(() => {
      expect(screen.getByText(/Noch zu wenig Daten/i)).toBeInTheDocument();
    });
  });

  it("zeigt Fehler bei API-Error", async () => {
    vi.spyOn(apiModule.api, "getDoctypeDistribution").mockRejectedValue(
      new Error("DB unavailable"),
    );
    renderWithQuery(<DoctypeDistributionChart />);
    await waitFor(() => {
      expect(screen.getByTestId("doctype-error")).toBeInTheDocument();
    });
  });
});
