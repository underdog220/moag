import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AktionenPage } from "./AktionenPage";
import * as apiModule from "../../lib/api";
import type { ActionsResponse } from "../../lib/types";

const MOCK_ACTIONS: ActionsResponse = {
  fetched_at: "2026-05-17T08:00:00Z",
  actions: [
    {
      action_id: "oberon.smoke",
      system_id: "oberon",
      name: "DSGVO-Smoke ausführen",
      description: "Triggert den Oberon-Cockpit-Smoke.",
      category: "diagnose",
      sub_area: "smoke",
      requires_confirm: false,
      is_destructive: false,
      estimated_duration_s: 5,
      implemented: true,
    },
    {
      action_id: "oberon.llm.test",
      system_id: "oberon",
      name: "LLM-Test",
      description: "LLM-Test-Prompt.",
      category: "diagnose",
      sub_area: "llm",
      requires_confirm: false,
      is_destructive: false,
      estimated_duration_s: 10,
      implemented: false,
    },
    {
      action_id: "octoboss.cluster.status",
      system_id: "octoboss",
      name: "Cluster-Status",
      description: "Holt den Cluster-Status.",
      category: "diagnose",
      sub_area: "cluster",
      requires_confirm: false,
      is_destructive: false,
      estimated_duration_s: 2,
      implemented: true,
    },
  ],
};

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("AktionenPage", () => {
  beforeEach(() => {
    vi.spyOn(apiModule.api, "getActions").mockResolvedValue(MOCK_ACTIONS);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rendert Überschrift", () => {
    render(<AktionenPage />, { wrapper });
    expect(screen.getByText(/MOAG — Aktionen/)).toBeInTheDocument();
  });

  it("rendert Aktionen nach dem Laden", async () => {
    render(<AktionenPage />, { wrapper });
    await waitFor(() => {
      expect(screen.getByTestId("action-card-oberon.smoke")).toBeInTheDocument();
      expect(screen.getByTestId("action-card-octoboss.cluster.status")).toBeInTheDocument();
    });
  });

  it("gruppiert Aktionen nach System", async () => {
    render(<AktionenPage />, { wrapper });
    await waitFor(() => {
      expect(screen.getByTestId("aktionen-group-oberon")).toBeInTheDocument();
      expect(screen.getByTestId("aktionen-group-octoboss")).toBeInTheDocument();
    });
  });

  it("Oberon-Gruppe enthält 2 Aktionen (smoke + llm.test)", async () => {
    render(<AktionenPage />, { wrapper });
    await waitFor(() => {
      expect(screen.getByTestId("action-card-oberon.smoke")).toBeInTheDocument();
      expect(screen.getByTestId("action-card-oberon.llm.test")).toBeInTheDocument();
    });
  });

  it("PageBadge ist vorhanden", () => {
    render(<AktionenPage />, { wrapper });
    expect(screen.getByTestId("page-badge")).toBeInTheDocument();
  });

  it("zeigt Empty-State wenn keine Aktionen vorhanden", async () => {
    vi.spyOn(apiModule.api, "getActions").mockResolvedValue({
      fetched_at: "2026-05-17T08:00:00Z",
      actions: [],
    });
    render(<AktionenPage />, { wrapper });
    await waitFor(() => {
      expect(screen.getByTestId("aktionen-empty")).toBeInTheDocument();
    });
  });

  it("zeigt Fehler-Box wenn Laden fehlschlägt", async () => {
    vi.spyOn(apiModule.api, "getActions").mockRejectedValue(new Error("Backend nicht erreichbar"));
    render(<AktionenPage />, { wrapper });
    await waitFor(
      () => {
        expect(screen.getByTestId("aktionen-error")).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });
});
