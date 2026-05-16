import { describe, expect, it, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ModuleVersionsTable } from "./ModuleVersionsTable";

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

describe("ModuleVersionsTable", () => {
  it("rendert die 4 Module aus den Mocks", async () => {
    renderWithProviders(<ModuleVersionsTable refetchIntervalMs={60_000} />);
    await waitFor(() =>
      expect(screen.getByTestId("module-versions-table")).toBeInTheDocument()
    );
    expect(screen.getByTestId("module-row-ocr-multi")).toBeInTheDocument();
    expect(screen.getByTestId("module-row-installer")).toBeInTheDocument();
    expect(screen.getByTestId("module-row-hw-monitor")).toBeInTheDocument();
    expect(screen.getByTestId("module-row-ocr-listener")).toBeInTheDocument();
  });

  it("markiert Versions-Drift bei installer (1.1.1 vs 1.1.0 auf WhiteStar)", async () => {
    renderWithProviders(<ModuleVersionsTable refetchIntervalMs={60_000} />);
    await waitFor(() =>
      expect(screen.getByTestId("module-row-installer")).toBeInTheDocument()
    );
    const row = screen.getByTestId("module-row-installer");
    expect(row).toHaveAttribute("data-drift", "true");
    const driftCell = screen.getByTestId("module-cell-installer-WhiteStar");
    expect(driftCell).toHaveAttribute("data-drift-cell", "true");
  });

  it("Update-Button setzt pending-Status nach Klick", async () => {
    renderWithProviders(<ModuleVersionsTable refetchIntervalMs={60_000} />);
    await waitFor(() =>
      expect(screen.getByTestId("module-update-installer-WhiteStar")).toBeInTheDocument()
    );
    const btn = screen.getByTestId("module-update-installer-WhiteStar");
    fireEvent.click(btn);
    expect(btn.textContent).toContain("...");
  });

  it("markiert KEIN Drift bei ocr-multi (alle 1.0.3)", async () => {
    renderWithProviders(<ModuleVersionsTable refetchIntervalMs={60_000} />);
    await waitFor(() =>
      expect(screen.getByTestId("module-row-ocr-multi")).toBeInTheDocument()
    );
    const row = screen.getByTestId("module-row-ocr-multi");
    expect(row).toHaveAttribute("data-drift", "false");
  });
});
