import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AlertCenter } from "./AlertCenter";
import * as apiModule from "../../lib/api";
import type { AlertsResponse } from "../../lib/types";

const MOCK_ALERTS: AlertsResponse = {
  alerts: [
    {
      key: "critkey00000000",
      system_id: "custos",
      system_name: "Custos",
      group: "Compliance & Test",
      severity: "critical",
      summary: "Adapter-Fehler: TimeoutException",
      error: "connect timeout",
      score: 0,
      fetched_at: "2026-06-01T16:00:00Z",
      acknowledged: false,
      acknowledged_at: null,
    },
    {
      key: "warnkey00000000",
      system_id: "octoboss",
      system_name: "OctoBoss",
      group: "KI-Backbone",
      severity: "warning",
      summary: "Hub degradiert",
      error: null,
      score: 30,
      fetched_at: "2026-06-01T16:00:00Z",
      acknowledged: false,
      acknowledged_at: null,
    },
  ],
  critical_count: 1,
  warning_count: 1,
  acknowledged_count: 0,
  unacknowledged_count: 2,
  computed_at: "2026-06-01T16:00:01Z",
};

const EMPTY_ALERTS: AlertsResponse = {
  alerts: [],
  critical_count: 0,
  warning_count: 0,
  acknowledged_count: 0,
  unacknowledged_count: 0,
  computed_at: "2026-06-01T16:00:01Z",
};

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("AlertCenter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rendert Überschrift", () => {
    vi.spyOn(apiModule.api, "getAlerts").mockResolvedValue(MOCK_ALERTS);
    render(<AlertCenter />, { wrapper });
    expect(screen.getByText("Alert-Center")).toBeInTheDocument();
  });

  it("gruppiert critical und warning nach dem Laden", async () => {
    vi.spyOn(apiModule.api, "getAlerts").mockResolvedValue(MOCK_ALERTS);
    render(<AlertCenter />, { wrapper });
    await waitFor(() => {
      expect(screen.getByTestId("alert-group-critical")).toBeInTheDocument();
      expect(screen.getByTestId("alert-group-warning")).toBeInTheDocument();
      expect(screen.getByTestId("alert-custos")).toBeInTheDocument();
      expect(screen.getByTestId("alert-octoboss")).toBeInTheDocument();
    });
  });

  it("zeigt Empty-State wenn keine Alerts", async () => {
    vi.spyOn(apiModule.api, "getAlerts").mockResolvedValue(EMPTY_ALERTS);
    render(<AlertCenter />, { wrapper });
    await waitFor(() => {
      expect(screen.getByTestId("alert-empty")).toBeInTheDocument();
      expect(screen.getByText("Alles grün")).toBeInTheDocument();
    });
  });

  it("Quittieren-Button ruft api.ackAlert mit dem Alert-Key", async () => {
    vi.spyOn(apiModule.api, "getAlerts").mockResolvedValue(MOCK_ALERTS);
    const ackSpy = vi
      .spyOn(apiModule.api, "ackAlert")
      .mockResolvedValue({ ok: true, alert_key: "critkey00000000", acknowledged: true });

    render(<AlertCenter />, { wrapper });
    const card = await screen.findByTestId("alert-custos");
    const ackBtn = card.querySelector("button");
    expect(ackBtn).not.toBeNull();
    fireEvent.click(ackBtn!);

    await waitFor(() => {
      expect(ackSpy).toHaveBeenCalledWith("critkey00000000");
    });
  });
});
