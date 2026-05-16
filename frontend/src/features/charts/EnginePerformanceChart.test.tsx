// Tests fuer EnginePerformanceChart.

import { describe, expect, it, vi, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { EnginePerformanceChart } from "./EnginePerformanceChart";
import * as apiModule from "../../lib/api";
import { renderWithQuery } from "./__test_utils";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("EnginePerformanceChart", () => {
  it("zeigt Skeleton waehrend isLoading", () => {
    vi.spyOn(apiModule.api, "getEnginePerformance").mockImplementation(
      () => new Promise(() => undefined),
    );
    renderWithQuery(<EnginePerformanceChart />);
    expect(screen.getByTestId("chart-skeleton")).toBeInTheDocument();
  });

  it("zeigt Empty-State bei < 5 Engines", async () => {
    vi.spyOn(apiModule.api, "getEnginePerformance").mockResolvedValue({
      engines: [
        { name: "tesseract", p50_ms: 280, p95_ms: 950, avg_confidence: 0.84 },
      ],
    });
    renderWithQuery(<EnginePerformanceChart />);
    await waitFor(() => {
      expect(screen.getByText(/Noch zu wenig Daten/i)).toBeInTheDocument();
    });
  });

  it("rendert Chart bei >= 5 Engines", async () => {
    vi.spyOn(apiModule.api, "getEnginePerformance").mockResolvedValue({
      engines: [
        { name: "tesseract", p50_ms: 280, p95_ms: 950, avg_confidence: 0.84 },
        { name: "easyocr", p50_ms: 1100, p95_ms: 3400, avg_confidence: 0.91 },
        { name: "paddleocr", p50_ms: 850, p95_ms: 2200, avg_confidence: 0.89 },
        { name: "surya", p50_ms: 1450, p95_ms: 4100, avg_confidence: 0.93 },
        { name: "trocr", p50_ms: 2100, p95_ms: 5500, avg_confidence: 0.88 },
      ],
    });
    renderWithQuery(<EnginePerformanceChart />);
    await waitFor(() => {
      expect(screen.getByTestId("chart-container")).toBeInTheDocument();
    });
  });

  it("zeigt Fehler-Box bei API-Error", async () => {
    vi.spyOn(apiModule.api, "getEnginePerformance").mockRejectedValue(
      new Error("Backend down"),
    );
    renderWithQuery(<EnginePerformanceChart />);
    await waitFor(() => {
      expect(screen.getByTestId("engine-performance-error")).toBeInTheDocument();
    });
  });
});
