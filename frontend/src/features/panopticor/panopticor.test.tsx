// Tests fuer die Panopticor-Drilldown-Seite
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi } from "vitest";
import { PanopticorFeature } from "./index";

// api mocken
vi.mock("../../lib/api", () => ({
  api: {
    panopticor: {
      getStatus: vi.fn().mockResolvedValue({
        ok: true,
        score: 100,
        summary: "Bridge v0.10.0 | runfaehig | 0 aktive Runs | KI-Eval enabled (oberon) | letzter Run task-simulated-smoke: good/ready",
        metrics: {
          projectVersion: "0.10.0",
          activeRuns: 0,
          maxConcurrent: 4,
          capacity: 4,
          aiEvaluation: "enabled (oberon)",
          canRun: true,
          integrityFindings: 0,
          latency_ms: 8,
          lastRun_runId: "run-f2368431a2",
          lastRun_taskId: "task-simulated-smoke",
          lastRun_status: "completed",
          lastRun_verdict: "good",
          lastRun_releaseReadiness: "ready",
          lastRun_score: 1.0,
          lastRun_updatedAt: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
        },
        fetched_at: new Date().toISOString(),
        error: null,
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

// ─── Tests ────────────────────────────────────────────────────────────────────

test("Seite rendert ohne Crash und zeigt Titel (h1)", () => {
  render(<PanopticorFeature />, { wrapper });
  const heading = screen.getByRole("heading", { level: 1 });
  expect(heading.textContent).toBe("Panopticor");
});

test("PageBadge mit id=panopticor ist vorhanden", () => {
  render(<PanopticorFeature />, { wrapper });
  const badge = document.querySelector('[data-testid="page-badge"]');
  expect(badge).not.toBeNull();
});

test("Hologramm-Link zeigt korrekte URL :8787", () => {
  render(<PanopticorFeature />, { wrapper });
  const link = screen.getByTestId("hologramm-link") as HTMLAnchorElement;
  expect(link.href).toContain(":8787");
  expect(link.href).toContain("/live");
});

test("Status-Panel wird nach Daten-Ladung angezeigt", async () => {
  render(<PanopticorFeature />, { wrapper });
  await waitFor(() => {
    // Score 100 muss sichtbar sein
    expect(screen.getByText("100")).toBeDefined();
  });
});

test("Summary wird korrekt angezeigt", async () => {
  render(<PanopticorFeature />, { wrapper });
  await waitFor(() => {
    expect(screen.getByText(/Bridge v0\.10\.0/i)).toBeDefined();
  });
});

test("Letzter-Run-Sektion zeigt Verdikt", async () => {
  render(<PanopticorFeature />, { wrapper });
  await waitFor(() => {
    expect(screen.getByText("good")).toBeDefined();
  });
});

test("Bridge-Metriken (Version, KI-Eval) werden angezeigt", async () => {
  render(<PanopticorFeature />, { wrapper });
  await waitFor(() => {
    expect(screen.getByText("0.10.0")).toBeDefined();
    // KI-Eval erscheint auch in der Summary — alle Treffer erlaubt
    const matches = screen.getAllByText(/enabled \(oberon\)/i);
    expect(matches.length).toBeGreaterThan(0);
  });
});

test("Fehler-Zustand zeigt Fehlermeldung wenn kein Data und isError", async () => {
  const { api } = await import("../../lib/api");
  (api.panopticor.getStatus as ReturnType<typeof vi.fn>).mockRejectedValue(
    new Error("connection refused"),
  );
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <PanopticorFeature />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  // Fehler-Banner: "Panopticor-Bridge antwortet nicht"
  await waitFor(
    () => {
      expect(screen.getByText(/Panopticor-Bridge antwortet nicht/i)).toBeDefined();
    },
    { timeout: 3000 },
  );
  // Mock zuruecksetzen damit andere Tests nicht beeinflusst werden
  (api.panopticor.getStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true, score: 100, summary: "ok", metrics: {}, fetched_at: new Date().toISOString(),
  });
});
