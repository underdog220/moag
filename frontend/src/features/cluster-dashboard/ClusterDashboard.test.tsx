import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { ClusterDashboard } from "./ClusterDashboard";

beforeEach(() => {
  Object.defineProperty(window, "location", {
    value: new URL("http://localhost:5173/dashboard?mock=true"),
    writable: true,
  });
  if (!(globalThis as { ResizeObserver?: unknown }).ResizeObserver) {
    (globalThis as { ResizeObserver: unknown }).ResizeObserver = vi.fn().mockImplementation(() => ({
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    }));
  }
});

function renderWithProviders(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchInterval: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("ClusterDashboard", () => {
  it("rendert den Container mit allen 6 Sektionen", async () => {
    renderWithProviders(<ClusterDashboard refetchIntervalMs={60_000} />);
    await waitFor(() =>
      expect(screen.getByTestId("cluster-dashboard")).toBeInTheDocument()
    );
    // Hub-Multi-Tabelle, Engine-Matrix, GPU-Bars, Module, RR, Edge-Log
    await waitFor(() =>
      expect(screen.getByTestId("hub-multi-table")).toBeInTheDocument()
    );
    await waitFor(() =>
      expect(screen.getByTestId("engine-matrix")).toBeInTheDocument()
    );
    await waitFor(() =>
      expect(screen.getByTestId("gpu-live-bars")).toBeInTheDocument()
    );
    await waitFor(() =>
      expect(screen.getByTestId("module-versions-table")).toBeInTheDocument()
    );
    await waitFor(() =>
      expect(screen.getByTestId("round-robin-bar")).toBeInTheDocument()
    );
    await waitFor(() =>
      expect(screen.getByTestId("edge-log-tail")).toBeInTheDocument()
    );
  });

  it("zeigt VDR/NAS/NAS-Test als Mock-Hubs", async () => {
    renderWithProviders(<ClusterDashboard refetchIntervalMs={60_000} />);
    await waitFor(() =>
      expect(screen.getByText("VDR-Production")).toBeInTheDocument()
    );
    expect(screen.getByText("NAS-Legacy")).toBeInTheDocument();
    expect(screen.getByText("NAS-Test")).toBeInTheDocument();
  });

  it("rendert GPU-Karten fuer alle Mock-Nodes inklusive CPU-only-Badge", async () => {
    renderWithProviders(<ClusterDashboard refetchIntervalMs={60_000} />);
    await waitFor(() =>
      expect(screen.getByTestId("gpu-bar-card-WhiteStar")).toBeInTheDocument()
    );
    expect(screen.getByTestId("cpu-only-badge-WhiteStar")).toBeInTheDocument();
  });
});
