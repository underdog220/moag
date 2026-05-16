// Tests fuer ThroughputChart.
// Wir mocken api.getThroughput, da react-query in jsdom + recharts in jsdom
// nicht trivial sind — stattdessen pruefen wir Zustaende: Loading, Empty, Daten.

import { describe, expect, it, vi, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { ThroughputChart } from "./ThroughputChart";
import * as apiModule from "../../lib/api";
import { renderWithQuery } from "./__test_utils";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ThroughputChart", () => {
  it("zeigt Skeleton waehrend isLoading", () => {
    vi.spyOn(apiModule.api, "getThroughput").mockImplementation(
      () => new Promise(() => undefined), // never resolves -> bleibt im loading
    );
    renderWithQuery(<ThroughputChart range={{ preset: "24h" }} />);
    expect(screen.getByTestId("chart-skeleton")).toBeInTheDocument();
  });

  it("zeigt Empty-State bei < 5 Datenpunkten", async () => {
    vi.spyOn(apiModule.api, "getThroughput").mockResolvedValue({
      datapoints: [
        { ts: "2026-05-06T08:00:00Z", docs_per_hour: 18, avg_latency_ms: 4200 },
      ],
    });
    renderWithQuery(<ThroughputChart range={{ preset: "24h" }} />);
    await waitFor(() => {
      expect(screen.getByText(/Noch zu wenig Daten/i)).toBeInTheDocument();
    });
  });

  it("rendert Chart bei >= 5 Datenpunkten", async () => {
    const points = Array.from({ length: 6 }, (_, i) => ({
      ts: `2026-05-06T${String(i + 8).padStart(2, "0")}:00:00Z`,
      docs_per_hour: 10 + i,
      avg_latency_ms: 4000 - i * 100,
    }));
    vi.spyOn(apiModule.api, "getThroughput").mockResolvedValue({ datapoints: points });
    renderWithQuery(<ThroughputChart range={{ preset: "24h" }} />);
    await waitFor(() => {
      expect(screen.getByTestId("chart-container")).toBeInTheDocument();
    });
    // Skeleton ist nicht mehr im DOM
    expect(screen.queryByTestId("chart-skeleton")).not.toBeInTheDocument();
  });

  it("ruft api.getThroughput mit dem range-Param auf", async () => {
    const spy = vi.spyOn(apiModule.api, "getThroughput").mockResolvedValue({
      datapoints: [],
    });
    renderWithQuery(<ThroughputChart range={{ preset: "7d" }} />);
    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith("7d");
    });
  });
});
