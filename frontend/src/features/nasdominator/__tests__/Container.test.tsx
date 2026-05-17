// Smoke-Tests fuer NasDominator Container-Seite
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi } from "vitest";
import { ContainerPage } from "../pages/Container";

vi.mock("../../../lib/api", () => ({
  api: {
    nasdominator: {
      getContainers: vi.fn().mockResolvedValue({
        containers: [
          { name: "oberon", status: "running", image: "oberon:latest" },
          { name: "octoboss", status: "running", image: "octoboss:0.9" },
        ],
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

test("Container-Seite rendert ohne Crash", () => {
  render(<ContainerPage />, { wrapper });
  expect(screen.getByText("Container")).toBeDefined();
});

test("PageBadge ist vorhanden", () => {
  render(<ContainerPage />, { wrapper });
  const badge = document.querySelector('[data-testid="page-badge"]');
  expect(badge).not.toBeNull();
});
