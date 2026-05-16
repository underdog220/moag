// Tests fuer FailureRateChart (Trend + Top-3-Liste).

import { describe, expect, it, vi, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { FailureRateChart } from "./FailureRateChart";
import * as apiModule from "../../lib/api";
import { renderWithQuery } from "./__test_utils";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("FailureRateChart", () => {
  it("zeigt Skeleton waehrend isLoading", () => {
    vi.spyOn(apiModule.api, "getFailureRate").mockImplementation(
      () => new Promise(() => undefined),
    );
    renderWithQuery(<FailureRateChart />);
    expect(screen.getByTestId("chart-skeleton")).toBeInTheDocument();
  });

  it("zeigt Top-3-Liste mit Eintraegen", async () => {
    vi.spyOn(apiModule.api, "getFailureRate").mockResolvedValue({
      trend: [
        { ts: "2026-05-01", rate: 0.012 },
        { ts: "2026-05-02", rate: 0.008 },
        { ts: "2026-05-03", rate: 0.005 },
        { ts: "2026-05-04", rate: 0.015 },
        { ts: "2026-05-05", rate: 0.011 },
      ],
      top_errors: [
        { type: "PDF-Header malformed", count: 3, example: "Zeile 12" },
        { type: "Engine timeout", count: 2, example: "surya@WhiteStar 60s" },
        { type: "OCR provider unavailable", count: 1, example: "no_engines" },
      ],
    });
    renderWithQuery(<FailureRateChart />);
    await waitFor(() => {
      expect(screen.getByTestId("failure-top-list")).toBeInTheDocument();
      expect(screen.getByTestId("failure-top-item-0")).toHaveTextContent(
        "PDF-Header malformed",
      );
      expect(screen.getByTestId("failure-top-item-2")).toBeInTheDocument();
    });
  });

  it("zeigt Empty-State wenn weder Trend noch Errors", async () => {
    vi.spyOn(apiModule.api, "getFailureRate").mockResolvedValue({
      trend: [],
      top_errors: [],
    });
    renderWithQuery(<FailureRateChart />);
    await waitFor(() => {
      expect(screen.getByText(/Noch zu wenig Daten/i)).toBeInTheDocument();
    });
  });

  it("zeigt Fehler bei API-Error", async () => {
    vi.spyOn(apiModule.api, "getFailureRate").mockRejectedValue(new Error("nope"));
    renderWithQuery(<FailureRateChart />);
    await waitFor(() => {
      expect(screen.getByTestId("failure-rate-error")).toBeInTheDocument();
    });
  });
});
