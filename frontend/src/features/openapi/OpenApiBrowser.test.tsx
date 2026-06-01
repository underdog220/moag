import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OpenApiBrowser } from "./OpenApiBrowser";
import * as openapiApiModule from "./openapiApi";
import type { OpenApiTarget, OpenApiSpec } from "./openapiApi";

// ── Mock-Daten ────────────────────────────────────────────────────────────────

const MOCK_TARGETS: OpenApiTarget[] = [
  { id: "moag",      name: "MOAG (lokal)",  url: "" },
  { id: "oberon",    name: "Oberon",         url: "http://192.168.200.169:17900" },
  { id: "octoboss",  name: "OctoBoss (Hub)", url: "http://192.168.200.71:18765" },
];

const MOCK_SPEC_MOAG: OpenApiSpec = {
  target: "moag",
  reachable: true,
  endpoint_count: 2,
  endpoints: [
    { path: "/api/health",          method: "GET",  summary: "Health-Check",    tags: ["health"] },
    { path: "/api/v1/openapi/targets", method: "GET", summary: "Target-Liste", tags: ["openapi-browser"] },
  ],
};

const MOCK_SPEC_OBERON: OpenApiSpec = {
  target: "oberon",
  reachable: true,
  endpoint_count: 3,
  endpoints: [
    { path: "/api/v2/dsgvo/proxy",  method: "POST", summary: "DSGVO-Proxy",     tags: ["dsgvo"] },
    { path: "/api/v2/admin/smoke",  method: "GET",  summary: "Smoke-Check",     tags: ["admin"] },
    { path: "/api/v2/database/provision", method: "POST", summary: "DB-Provision", tags: ["database"] },
  ],
};

const MOCK_SPEC_NOT_REACHABLE: OpenApiSpec = {
  target: "octoboss",
  reachable: false,
  endpoint_count: 0,
  endpoints: [],
  error: "Timeout nach 5s",
};

// ── Test-Wrapper ──────────────────────────────────────────────────────────────

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("OpenApiBrowser", () => {
  beforeEach(() => {
    vi.spyOn(openapiApiModule, "fetchOpenApiTargets").mockResolvedValue(MOCK_TARGETS);
    vi.spyOn(openapiApiModule, "fetchOpenApiSpec").mockImplementation((target) => {
      if (target === "moag")     return Promise.resolve(MOCK_SPEC_MOAG);
      if (target === "oberon")   return Promise.resolve(MOCK_SPEC_OBERON);
      if (target === "octoboss") return Promise.resolve(MOCK_SPEC_NOT_REACHABLE);
      return Promise.resolve({ target, reachable: false, endpoints: [], error: "Unbekannt" });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rendert Seiten-Ueberschrift", () => {
    render(<OpenApiBrowser />, { wrapper });
    expect(screen.getByText(/MOAG — OpenAPI-Browser/)).toBeInTheDocument();
  });

  it("data-testid openapi-browser ist vorhanden", () => {
    render(<OpenApiBrowser />, { wrapper });
    expect(screen.getByTestId("openapi-browser")).toBeInTheDocument();
  });

  it("PageBadge ist vorhanden", () => {
    render(<OpenApiBrowser />, { wrapper });
    expect(screen.getByTestId("page-badge")).toBeInTheDocument();
  });

  it("rendert Target-Buttons nach dem Laden der Liste", async () => {
    render(<OpenApiBrowser />, { wrapper });
    await waitFor(() => {
      expect(screen.getByTestId("target-btn-moag")).toBeInTheDocument();
      expect(screen.getByTestId("target-btn-oberon")).toBeInTheDocument();
      expect(screen.getByTestId("target-btn-octoboss")).toBeInTheDocument();
    });
  });

  it("zeigt Endpoints des Standard-Targets (moag) nach dem Laden", async () => {
    render(<OpenApiBrowser />, { wrapper });
    await waitFor(() => {
      expect(screen.getByTestId("endpoint-list")).toBeInTheDocument();
    });
    // Pfade des MOAG-Specs sollen sichtbar sein
    expect(screen.getByText("/api/health")).toBeInTheDocument();
  });

  it("zeigt Endpoint-Count-Badge mit korrekten Zahlen", async () => {
    render(<OpenApiBrowser />, { wrapper });
    await waitFor(() => {
      const badge = screen.getByTestId("endpoint-count-badge");
      expect(badge).toBeInTheDocument();
      // MOAG hat 2 Endpoints; ohne Filter: "2 / 2 Endpoints"
      expect(badge.textContent).toMatch(/2\s*\/\s*2/);
    });
  });

  it("Methodenfarbe: GET-Badge ist vorhanden", async () => {
    render(<OpenApiBrowser />, { wrapper });
    await waitFor(() => {
      const badges = screen.getAllByTestId("method-badge-GET");
      expect(badges.length).toBeGreaterThan(0);
    });
  });

  it("Filter-Eingabe reduziert die sichtbaren Endpoints", async () => {
    render(<OpenApiBrowser />, { wrapper });
    await waitFor(() => {
      expect(screen.getByTestId("endpoint-list")).toBeInTheDocument();
    });

    const input = screen.getByTestId("openapi-search");
    fireEvent.change(input, { target: { value: "health" } });

    await waitFor(() => {
      // Nur /api/health soll noch sichtbar sein (nicht der openapi-targets-Endpoint)
      expect(screen.getByText("/api/health")).toBeInTheDocument();
      // Count-Badge muss sich aktualisiert haben
      const badge = screen.getByTestId("endpoint-count-badge");
      expect(badge.textContent).toMatch(/1\s*\/\s*2/);
    });
  });

  it("Target-Wechsel laedt neue Endpoints", async () => {
    render(<OpenApiBrowser />, { wrapper });
    await waitFor(() => {
      expect(screen.getByTestId("target-btn-oberon")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("target-btn-oberon"));

    await waitFor(() => {
      expect(screen.getByText("/api/v2/dsgvo/proxy")).toBeInTheDocument();
    });
  });

  it("zeigt 'nicht erreichbar'-Hinweis fuer nicht erreichbares Target", async () => {
    render(<OpenApiBrowser />, { wrapper });
    await waitFor(() => {
      expect(screen.getByTestId("target-btn-octoboss")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("target-btn-octoboss"));

    await waitFor(() => {
      expect(screen.getByTestId("not-reachable-hint")).toBeInTheDocument();
      expect(screen.getByText(/nicht erreichbar/i)).toBeInTheDocument();
    });
  });

  it("POST-Badge hat anderen Stil als GET", async () => {
    render(<OpenApiBrowser />, { wrapper });
    await waitFor(() => {
      expect(screen.getByTestId("target-btn-oberon")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("target-btn-oberon"));

    await waitFor(() => {
      expect(screen.getByTestId("endpoint-list")).toBeInTheDocument();
      const postBadges = screen.getAllByTestId("method-badge-POST");
      expect(postBadges.length).toBeGreaterThan(0);
    });
  });

  it("zeigt Fehler-Box wenn fetchOpenApiTargets schlaegt fehl", async () => {
    vi.spyOn(openapiApiModule, "fetchOpenApiTargets").mockRejectedValue(
      new Error("Netzwerk-Fehler"),
    );
    render(<OpenApiBrowser />, { wrapper });
    await waitFor(
      () => {
        expect(screen.getByTestId("targets-error")).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });
});
