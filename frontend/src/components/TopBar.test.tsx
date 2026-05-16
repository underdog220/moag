import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TopBar } from "./TopBar";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("TopBar", () => {
  it("rendert MOAG-Logo", () => {
    render(<TopBar />, { wrapper });
    expect(screen.getByText("MOAG")).toBeInTheDocument();
  });

  it("hat data-testid topbar", () => {
    render(<TopBar />, { wrapper });
    expect(screen.getByTestId("topbar")).toBeInTheDocument();
  });

  it("rendert Gesamt-Score-Anzeige (Placeholder-Daten)", () => {
    render(<TopBar />, { wrapper });
    // PlaceholderData liefert 72% — Score-Balken sollte vorhanden sein
    expect(screen.getByTestId("overall-score")).toBeInTheDocument();
  });
});
