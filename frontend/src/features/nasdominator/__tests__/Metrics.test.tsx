// Smoke-Tests fuer NasDominator Metrics-Seite
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi } from "vitest";
import { MetricsPage } from "../pages/Metrics";

vi.mock("../../../lib/api", () => ({
  api: {
    nasdominator: {
      getMetrics: vi.fn().mockResolvedValue({
        metrics: { cpu_percent: 25.5, ram_percent: 60.0 },
        auth_required: false,
        fetched_at: new Date().toISOString(),
      }),
    },
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

test("Metrics-Seite rendert ohne Crash", async () => {
  render(<MetricsPage />, { wrapper });
  expect(screen.getByText("System-Metriken")).toBeDefined();
});

test("PageBadge ist vorhanden", () => {
  render(<MetricsPage />, { wrapper });
  const badge = document.querySelector('[data-testid="page-badge"]');
  expect(badge).not.toBeNull();
});
