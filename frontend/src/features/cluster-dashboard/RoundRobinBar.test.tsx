import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RoundRobinBar } from "./RoundRobinBar";

beforeEach(() => {
  Object.defineProperty(window, "location", {
    value: new URL("http://localhost:5173/dashboard?mock=true"),
    writable: true,
  });
});

function renderWithProviders(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchInterval: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("RoundRobinBar", () => {
  it("rendert ein Segment pro Node aus den Mocks", async () => {
    renderWithProviders(<RoundRobinBar refetchIntervalMs={60_000} />);
    await waitFor(() =>
      expect(screen.getByTestId("round-robin-bar")).toBeInTheDocument()
    );
    expect(screen.getByTestId("rr-segment-WorkRyzen")).toBeInTheDocument();
    expect(screen.getByTestId("rr-segment-Ryzenstrike")).toBeInTheDocument();
    expect(screen.getByTestId("rr-segment-WhiteStar")).toBeInTheDocument();
  });

  it("rendert eine Legende mit Job-Zahlen", async () => {
    renderWithProviders(<RoundRobinBar refetchIntervalMs={60_000} />);
    await waitFor(() =>
      expect(screen.getByTestId("rr-legend-WorkRyzen")).toBeInTheDocument()
    );
    const legend = screen.getByTestId("rr-legend-WorkRyzen");
    // Mock: 6+8+10 = 24 Jobs auf WorkRyzen
    expect(legend.textContent).toContain("24");
  });

  it("Segment-Breite proportional zur Job-Anzahl", async () => {
    renderWithProviders(<RoundRobinBar refetchIntervalMs={60_000} />);
    await waitFor(() =>
      expect(screen.getByTestId("rr-segment-Ryzenstrike")).toBeInTheDocument()
    );
    const seg = screen.getByTestId("rr-segment-Ryzenstrike") as HTMLElement;
    // 6+8+11=25 von Total 24+25+24=73 -> ~34%
    expect(seg.style.width).toMatch(/3[0-9]\.\d+%/);
  });
});
