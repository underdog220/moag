import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GpuLiveBars } from "./GpuLiveBars";

beforeEach(() => {
  Object.defineProperty(window, "location", {
    value: new URL("http://localhost:5173/dashboard?mock=true"),
    writable: true,
  });
  // Recharts braucht ResizeObserver in jsdom
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
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("GpuLiveBars", () => {
  it("rendert eine Karte pro Node aus den Mocks (3 Nodes)", async () => {
    renderWithProviders(<GpuLiveBars refetchIntervalMs={60_000} />);
    await waitFor(() =>
      expect(screen.getByTestId("gpu-live-bars")).toBeInTheDocument()
    );
    expect(screen.getByTestId("gpu-bar-card-WorkRyzen")).toBeInTheDocument();
    expect(screen.getByTestId("gpu-bar-card-Ryzenstrike")).toBeInTheDocument();
    expect(screen.getByTestId("gpu-bar-card-WhiteStar")).toBeInTheDocument();
  });

  it("zeigt CPU-only-Badge fuer Nodes mit gpu_load_percent=null (WhiteStar im Mock)", async () => {
    renderWithProviders(<GpuLiveBars refetchIntervalMs={60_000} />);
    await waitFor(() =>
      expect(screen.getByTestId("gpu-bar-card-WhiteStar")).toBeInTheDocument()
    );
    expect(screen.getByTestId("cpu-only-badge-WhiteStar")).toBeInTheDocument();
  });

  it("zeigt KEIN CPU-only-Badge fuer Nodes mit GPU-Wert", async () => {
    renderWithProviders(<GpuLiveBars refetchIntervalMs={60_000} />);
    await waitFor(() =>
      expect(screen.getByTestId("gpu-bar-card-WorkRyzen")).toBeInTheDocument()
    );
    expect(screen.queryByTestId("cpu-only-badge-WorkRyzen")).not.toBeInTheDocument();
  });
});
