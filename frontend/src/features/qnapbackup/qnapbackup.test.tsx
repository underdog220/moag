// Tests fuer die qnapbackup-Drilldown-Seite
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi } from "vitest";
import { QnapBackupFeature } from "./index";

// api mocken
vi.mock("../../lib/api", () => ({
  api: {
    qnapbackup: {
      getStatus: vi.fn().mockResolvedValue({
        ok: true,
        score: 82,
        summary: "Letztes Backup vor 4h, alle Freigaben OK",
        metrics: {
          last_backup_at: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
          last_backup_duration_seconds: 3720,
          last_backup_size_bytes: 8589934592,
          shares_total: 5,
          shares_ok: 5,
          shares_failed: 0,
          replica_oberon_postgres_ok: true,
          replica_oberon_postgres_lag_seconds: 12,
          free_space_bytes: 2199023255552,
          free_space_percent: 68.5,
          errors_24h: 0,
          latency_ms: 42,
        },
        fetched_at: new Date().toISOString(),
        error: null,
      }),
      getBackupsRecent: vi.fn().mockResolvedValue({
        items: [
          {
            id: "bak-001",
            started_at: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
            finished_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
            duration_seconds: 3600,
            share: "Dokumente",
            bytes_transferred: 5368709120,
            status: "success",
            warnings: [],
          },
          {
            id: "bak-002",
            started_at: new Date(Date.now() - 28 * 3600 * 1000).toISOString(),
            finished_at: null,
            duration_seconds: null,
            share: "Backups",
            bytes_transferred: null,
            status: "failed",
            warnings: ["Verbindungsfehler"],
          },
        ],
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
  render(<QnapBackupFeature />, { wrapper });
  // h1 mit exakter Rolle abfragen, um Doppeltext (PageBadge) zu umgehen
  const heading = screen.getByRole("heading", { level: 1 });
  expect(heading.textContent).toBe("qnapbackup");
});

test("PageBadge mit id=qnapbackup ist vorhanden", () => {
  render(<QnapBackupFeature />, { wrapper });
  const badge = document.querySelector('[data-testid="page-badge"]');
  expect(badge).not.toBeNull();
});

test("Web-UI-Link zeigt korrekte URL :9000", () => {
  render(<QnapBackupFeature />, { wrapper });
  const link = screen.getByTestId("webui-link") as HTMLAnchorElement;
  expect(link.href).toContain(":9000");
  expect(link.href).not.toContain(":5000");
});

test("Status-Panel wird nach Daten-Ladung angezeigt", async () => {
  render(<QnapBackupFeature />, { wrapper });
  await waitFor(() => {
    // Score muss sichtbar sein
    expect(screen.getByText("82")).toBeDefined();
  });
});

test("Backup-Status wird korrekt angezeigt (summary)", async () => {
  render(<QnapBackupFeature />, { wrapper });
  await waitFor(() => {
    expect(screen.getByText(/alle Freigaben OK/i)).toBeDefined();
  });
});

test("Backup-Historie zeigt success und failed Backups", async () => {
  render(<QnapBackupFeature />, { wrapper });
  await waitFor(() => {
    expect(screen.getByText("success")).toBeDefined();
    expect(screen.getByText("failed")).toBeDefined();
  });
});

test("Leerer-Zustand-Text wenn keine Backups vorhanden", async () => {
  const { api } = await import("../../lib/api");
  (api.qnapbackup.getBackupsRecent as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ items: [] });
  render(<QnapBackupFeature />, { wrapper });
  await waitFor(() => {
    expect(screen.getByText(/noch keine backups gelistet/i)).toBeDefined();
  });
});
