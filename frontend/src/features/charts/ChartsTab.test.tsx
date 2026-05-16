// Tests fuer ChartsTab — Aggregator + Range-Picker + Persistenz.

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { ChartsTab } from "./ChartsTab";
import * as apiModule from "../../lib/api";
import { renderWithQuery } from "./__test_utils";
import { TIME_RANGE_STORAGE_KEY } from "./timeRange";

beforeEach(() => {
  window.localStorage.clear();
  // Alle Chart-Endpoints mit minimalen Antworten mocken
  vi.spyOn(apiModule.api, "getThroughput").mockResolvedValue({ datapoints: [] });
  vi.spyOn(apiModule.api, "getEnginePerformance").mockResolvedValue({ engines: [] });
  vi.spyOn(apiModule.api, "getDoctypeDistribution").mockResolvedValue({
    current: [],
    trend: [],
  });
  vi.spyOn(apiModule.api, "getRoundRobin").mockResolvedValue({ datapoints: [] });
  vi.spyOn(apiModule.api, "getFailureRate").mockResolvedValue({
    trend: [],
    top_errors: [],
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("ChartsTab", () => {
  it("rendert mit Default-Range '24h' und PageBadge", async () => {
    renderWithQuery(<ChartsTab />);
    expect(screen.getByTestId("charts-tab")).toBeInTheDocument();
    expect(screen.getByText(/Letzte 24 Stunden/i)).toBeInTheDocument();
    expect(screen.getByTestId("time-range-picker")).toBeInTheDocument();
  });

  it("zeigt PageBadge mit gui.charts-Id", async () => {
    renderWithQuery(<ChartsTab />);
    const badge = screen.getByTestId("page-badge");
    expect(badge.textContent).toContain("gui.charts");
  });

  it("wechselt Zeitraum auf 7d und persistiert in localStorage", async () => {
    renderWithQuery(<ChartsTab />);
    const sevenDays = screen.getByTestId("range-preset-7d");
    fireEvent.click(sevenDays);
    await waitFor(() => {
      expect(screen.getByText(/Letzte 7 Tage/i)).toBeInTheDocument();
    });
    const stored = window.localStorage.getItem(TIME_RANGE_STORAGE_KEY);
    expect(stored).toContain("7d");
  });

  it("laedt initiale Range aus localStorage", async () => {
    window.localStorage.setItem(
      TIME_RANGE_STORAGE_KEY,
      JSON.stringify({ preset: "30d" }),
    );
    renderWithQuery(<ChartsTab />);
    expect(screen.getByText(/Letzte 30 Tage/i)).toBeInTheDocument();
  });
});
