// Tests fuer RoundRobinChart (stacked AreaChart).

import { describe, expect, it, vi, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { RoundRobinChart } from "./RoundRobinChart";
import * as apiModule from "../../lib/api";
import { renderWithQuery } from "./__test_utils";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RoundRobinChart", () => {
  it("zeigt Skeleton waehrend isLoading", () => {
    vi.spyOn(apiModule.api, "getRoundRobin").mockImplementation(
      () => new Promise(() => undefined),
    );
    renderWithQuery(<RoundRobinChart />);
    expect(screen.getByTestId("chart-skeleton")).toBeInTheDocument();
  });

  it("zeigt Empty-State bei < 5 Punkten", async () => {
    vi.spyOn(apiModule.api, "getRoundRobin").mockResolvedValue({
      datapoints: [
        { ts: "2026-05-06T08:00:00Z", WorkRyzen: 6, Ryzenstrike: 6 },
      ],
    });
    renderWithQuery(<RoundRobinChart />);
    await waitFor(() => {
      expect(screen.getByText(/Noch zu wenig Daten/i)).toBeInTheDocument();
    });
  });

  it("rendert Stacked-Area bei 5+ Punkten mit Mehr-Node-Layern", async () => {
    const points = [
      { ts: "2026-05-06T08:00:00Z", WorkRyzen: 6, Ryzenstrike: 6, WhiteStar: 6 },
      { ts: "2026-05-06T09:00:00Z", WorkRyzen: 8, Ryzenstrike: 8, WhiteStar: 8 },
      { ts: "2026-05-06T10:00:00Z", WorkRyzen: 10, Ryzenstrike: 11, WhiteStar: 10 },
      { ts: "2026-05-06T11:00:00Z", WorkRyzen: 12, Ryzenstrike: 12, WhiteStar: 12 },
      { ts: "2026-05-06T12:00:00Z", WorkRyzen: 14, Ryzenstrike: 14, WhiteStar: 14 },
    ];
    vi.spyOn(apiModule.api, "getRoundRobin").mockResolvedValue({ datapoints: points });
    renderWithQuery(<RoundRobinChart />);
    await waitFor(() => {
      expect(screen.getByTestId("chart-container")).toBeInTheDocument();
    });
  });

  it("zeigt Fehler bei API-Error", async () => {
    vi.spyOn(apiModule.api, "getRoundRobin").mockRejectedValue(new Error("boom"));
    renderWithQuery(<RoundRobinChart />);
    await waitFor(() => {
      expect(screen.getByTestId("round-robin-error")).toBeInTheDocument();
    });
  });
});
