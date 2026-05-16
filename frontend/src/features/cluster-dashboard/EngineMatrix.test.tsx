import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EngineMatrix } from "./EngineMatrix";

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

describe("EngineMatrix", () => {
  it("rendert die 4 Engine-Zeilen + 3 Node-Spalten aus den Mocks", async () => {
    renderWithProviders(<EngineMatrix refetchIntervalMs={60_000} />);
    await waitFor(() =>
      expect(screen.getByTestId("engine-matrix")).toBeInTheDocument()
    );
    expect(screen.getByText("tesseract")).toBeInTheDocument();
    expect(screen.getByText("easyocr")).toBeInTheDocument();
    expect(screen.getByText("paddleocr")).toBeInTheDocument();
    expect(screen.getByText("surya")).toBeInTheDocument();
    expect(screen.getByText("WorkRyzen")).toBeInTheDocument();
    expect(screen.getByText("Ryzenstrike")).toBeInTheDocument();
    expect(screen.getByText("WhiteStar")).toBeInTheDocument();
  });

  it("zeigt fuer ok-Cells das ✓-Symbol", async () => {
    renderWithProviders(<EngineMatrix refetchIntervalMs={60_000} />);
    await waitFor(() =>
      expect(screen.getByTestId("engine-cell-tesseract-WorkRyzen")).toBeInTheDocument()
    );
    const cell = screen.getByTestId("engine-cell-tesseract-WorkRyzen");
    expect(cell).toHaveAttribute("data-availability", "ok");
    expect(cell.textContent).toContain("✓");
  });

  it("zeigt fuer missing-Cells das ✗-Symbol", async () => {
    renderWithProviders(<EngineMatrix refetchIntervalMs={60_000} />);
    await waitFor(() =>
      expect(screen.getByTestId("engine-cell-paddleocr-WhiteStar")).toBeInTheDocument()
    );
    const cell = screen.getByTestId("engine-cell-paddleocr-WhiteStar");
    expect(cell).toHaveAttribute("data-availability", "missing");
    expect(cell.textContent).toContain("✗");
  });
});
