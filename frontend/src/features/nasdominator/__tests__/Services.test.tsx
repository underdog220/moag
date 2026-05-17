// Smoke-Tests fuer NasDominator Services-Seite
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi } from "vitest";
import { ServicesPage } from "../pages/Services";

// api mocken
vi.mock("../../../lib/api", () => ({
  api: {
    nasdominator: {
      getServices: vi.fn().mockResolvedValue({
        services: [
          { name: "Oberon", status: "up" },
          { name: "Postgres", status: "down" },
        ],
        auth_required: false,
        fetched_at: new Date().toISOString(),
      }),
    },
    triggerAction: vi.fn().mockResolvedValue({ status: "completed" }),
  },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

test("Services-Seite rendert ohne Crash", async () => {
  render(<ServicesPage />, { wrapper });
  // Ueberschrift muss sichtbar sein
  expect(screen.getByText("Critical Services")).toBeDefined();
});

test("PageBadge ist vorhanden", async () => {
  render(<ServicesPage />, { wrapper });
  // PageBadge hat data-testid="page-badge"
  const badge = document.querySelector('[data-testid="page-badge"]');
  expect(badge).not.toBeNull();
});
