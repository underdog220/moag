import { describe, expect, it, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { HubMultiTable } from "./HubMultiTable";

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
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("HubMultiTable", () => {
  it("rendert die drei Mock-Hubs mit Namen", async () => {
    renderWithProviders(<HubMultiTable refetchIntervalMs={60_000} />);
    await waitFor(() =>
      expect(screen.getByTestId("hub-multi-table")).toBeInTheDocument()
    );
    expect(screen.getByText("VDR-Production")).toBeInTheDocument();
    expect(screen.getByText("NAS-Legacy")).toBeInTheDocument();
    expect(screen.getByText("NAS-Test")).toBeInTheDocument();
  });

  it("markiert den Default-Hub mit Default-Badge", async () => {
    renderWithProviders(<HubMultiTable refetchIntervalMs={60_000} />);
    await waitFor(() =>
      expect(screen.getByTestId("hub-default-vdr")).toBeInTheDocument()
    );
    // Andere Hubs haben Setzen-Button
    expect(screen.getByTestId("hub-set-default-nas")).toBeInTheDocument();
  });

  it("zeigt Engines-Spalte tolerant als Bindestrich wenn engines_count=0", async () => {
    renderWithProviders(<HubMultiTable refetchIntervalMs={60_000} />);
    await waitFor(() =>
      expect(screen.getByTestId("hub-row-vdr")).toBeInTheDocument()
    );
    // VDR im Mock hat engines_count=0 -> "—"
    const row = screen.getByTestId("hub-row-vdr");
    expect(row.textContent).toContain("—");
  });

  it("Default-Switch-Klick triggert optimistic update auf neuen Hub", async () => {
    renderWithProviders(<HubMultiTable refetchIntervalMs={60_000} />);
    await waitFor(() =>
      expect(screen.getByTestId("hub-set-default-nas")).toBeInTheDocument()
    );
    fireEvent.click(screen.getByTestId("hub-set-default-nas"));
    // Optimistic: sofort Default-Badge fuer nas
    await waitFor(() =>
      expect(screen.getByTestId("hub-default-nas")).toBeInTheDocument()
    );
  });
});
