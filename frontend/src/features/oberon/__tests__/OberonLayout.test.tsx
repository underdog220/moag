// Tests fuer OberonLayout und Oberon-Sub-Pages (Smoke-Tests).

import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

import { OberonLayout } from "../OberonLayout";
import { ProvidersPage } from "../pages/Providers";
import { SmokePage } from "../pages/Smoke";
import { CostPage } from "../pages/Cost";
import { AuditPage } from "../pages/Audit";
import { InstancesPage } from "../pages/Instances";
import { PiiTuningPage } from "../pages/PiiTuning";
import { DbBrokerPage } from "../pages/DbBroker";
import { ContractPage } from "../pages/Contract";
import * as apiModule from "../../../lib/api";

// ── Test-Helpers ─────────────────────────────────────────────────────────────

function makeQC() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchInterval: false, staleTime: 0 },
    },
  });
}

function wrap(node: ReactNode, initialPath = "/oberon/providers") {
  return (
    <MemoryRouter initialEntries={[initialPath]}>
      <QueryClientProvider client={makeQC()}>
        {node}
      </QueryClientProvider>
    </MemoryRouter>
  );
}

// ── OberonLayout ─────────────────────────────────────────────────────────────

describe("OberonLayout", () => {
  it("rendert alle 8 Sub-Tab-Labels", () => {
    render(wrap(<OberonLayout />, "/oberon/providers"));
    expect(screen.getByText("Provider")).toBeInTheDocument();
    expect(screen.getByText("Kosten")).toBeInTheDocument();
    expect(screen.getByText("Audit")).toBeInTheDocument();
    expect(screen.getByText("Smoke")).toBeInTheDocument();
    expect(screen.getByText("Instanzen")).toBeInTheDocument();
    expect(screen.getByText("PII-Tuning")).toBeInTheDocument();
    expect(screen.getByText("DB-Broker")).toBeInTheDocument();
    expect(screen.getByText("Kontrakt")).toBeInTheDocument();
  });

  it("Sub-Tab-Nav hat aria-label", () => {
    render(wrap(<OberonLayout />, "/oberon/providers"));
    expect(screen.getByRole("navigation", { name: "Oberon-Unterbereiche" })).toBeInTheDocument();
  });
});

// ── Providers Page ────────────────────────────────────────────────────────────

describe("ProvidersPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("zeigt Stub-Meldung wenn kein Token", async () => {
    vi.spyOn(apiModule.api.oberon, "getProviders").mockResolvedValue({
      stub: true,
      message: "Kein Oberon-Token konfiguriert",
      fetched_at: new Date().toISOString(),
    } as any);

    render(wrap(<ProvidersPage />));
    await waitFor(() => {
      expect(screen.getByTestId("oberon-providers-page")).toBeInTheDocument();
    });
  });

  it("zeigt Provider-Liste wenn Daten vorhanden", async () => {
    vi.spyOn(apiModule.api.oberon, "getProviders").mockResolvedValue({
      providers: [
        {
          id: "anthropic",
          name: "Anthropic",
          type: "anthropic",
          status: "healthy",
          is_default: true,
          latency_p50_ms: 400,
          latency_p95_ms: 1200,
          api_key_hint: "sk-ant-...TEST",
          profiles: { STANDARD: "claude-haiku", HEAVY: "claude-opus" },
        },
      ],
    } as any);

    render(wrap(<ProvidersPage />));
    await waitFor(() => {
      expect(screen.getByText("Anthropic")).toBeInTheDocument();
      expect(screen.getByTestId("provider-anthropic")).toBeInTheDocument();
    });
  });
});

// ── SmokePage ─────────────────────────────────────────────────────────────────

describe("SmokePage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("zeigt Stub-Meldung bei Stub-Antwort", async () => {
    vi.spyOn(apiModule.api.oberon, "getSmoke").mockResolvedValue({
      stub: true,
      message: "Kein Token",
      fetched_at: new Date().toISOString(),
    } as any);
    vi.spyOn(apiModule.api, "getActions").mockResolvedValue({ actions: [], fetched_at: "" });

    render(wrap(<SmokePage />));
    await waitFor(() => {
      expect(screen.getByTestId("oberon-smoke-page")).toBeInTheDocument();
    });
  });

  it("zeigt Smoke-Checks wenn Daten vorhanden", async () => {
    vi.spyOn(apiModule.api.oberon, "getSmoke").mockResolvedValue({
      suites: [
        { name: "dsgvo-status", status: "PASS", last_run: new Date().toISOString(), latency_ms: 12, error: null },
        { name: "pii-detect",   status: "WARN", last_run: new Date().toISOString(), latency_ms: 8,  error: "NER_MODE=OFF" },
      ],
      summary: { pass: 1, warn: 1, fail: 0, total: 2, verdict: "WARN" },
    } as any);
    vi.spyOn(apiModule.api, "getActions").mockResolvedValue({
      actions: [{
        action_id: "oberon.smoke",
        system_id: "oberon",
        name: "DSGVO-Smoke",
        description: "Test",
        category: "diagnose",
        sub_area: "smoke",
        requires_confirm: false,
        is_destructive: false,
        estimated_duration_s: 5,
        implemented: true,
      }],
      fetched_at: "",
    });

    render(wrap(<SmokePage />));
    await waitFor(() => {
      expect(screen.getByText("dsgvo-status")).toBeInTheDocument();
      expect(screen.getByText("pii-detect")).toBeInTheDocument();
    });
  });
});

// ── Weitere Pages — minimale Renderbarkeitstests ──────────────────────────────

describe("CostPage", () => {
  it("rendert ohne Crash", async () => {
    vi.spyOn(apiModule.api.oberon, "getCost").mockResolvedValue({
      stub: true,
      message: "Kein Token",
      fetched_at: new Date().toISOString(),
    } as any);
    render(wrap(<CostPage />));
    await waitFor(() => {
      expect(screen.getByTestId("oberon-cost-page")).toBeInTheDocument();
    });
    vi.restoreAllMocks();
  });
});

describe("AuditPage", () => {
  it("rendert ohne Crash", async () => {
    vi.spyOn(apiModule.api.oberon, "getAudit").mockResolvedValue({
      stub: true,
      message: "Kein Token",
      fetched_at: new Date().toISOString(),
    } as any);
    render(wrap(<AuditPage />));
    await waitFor(() => {
      expect(screen.getByTestId("oberon-audit-page")).toBeInTheDocument();
    });
    vi.restoreAllMocks();
  });
});

describe("InstancesPage", () => {
  it("rendert ohne Crash", async () => {
    vi.spyOn(apiModule.api.oberon, "getInstances").mockResolvedValue({
      stub: true,
      message: "Kein Token",
      fetched_at: new Date().toISOString(),
    } as any);
    render(wrap(<InstancesPage />));
    await waitFor(() => {
      expect(screen.getByTestId("oberon-instances-page")).toBeInTheDocument();
    });
    vi.restoreAllMocks();
  });
});

describe("PiiTuningPage", () => {
  it("rendert ohne Crash", async () => {
    vi.spyOn(apiModule.api.oberon, "getPiiTuning").mockResolvedValue({
      stub: true,
      message: "Kein Token",
      fetched_at: new Date().toISOString(),
    } as any);
    vi.spyOn(apiModule.api, "getActions").mockResolvedValue({ actions: [], fetched_at: "" });
    render(wrap(<PiiTuningPage />));
    await waitFor(() => {
      expect(screen.getByTestId("oberon-pii-tuning-page")).toBeInTheDocument();
    });
    vi.restoreAllMocks();
  });
});

describe("DbBrokerPage", () => {
  it("rendert ohne Crash", async () => {
    vi.spyOn(apiModule.api.oberon, "getDbBrokerStatus").mockResolvedValue({
      stub: true,
      message: "Kein Token",
      fetched_at: new Date().toISOString(),
    } as any);
    render(wrap(<DbBrokerPage />));
    await waitFor(() => {
      expect(screen.getByTestId("oberon-db-broker-page")).toBeInTheDocument();
    });
    vi.restoreAllMocks();
  });
});

describe("ContractPage", () => {
  it("rendert ohne Crash", async () => {
    vi.spyOn(apiModule.api.oberon, "getContractCapabilities").mockResolvedValue({
      stub: true,
      message: "Kein Token",
      fetched_at: new Date().toISOString(),
    } as any);
    render(wrap(<ContractPage />));
    await waitFor(() => {
      expect(screen.getByTestId("oberon-contract-page")).toBeInTheDocument();
    });
    vi.restoreAllMocks();
  });
});
