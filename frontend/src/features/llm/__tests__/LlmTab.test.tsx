// Tests fuer LlmTab + ProviderCard (K-FE-LLM).
//
// Abgedeckt:
//   - 3 Provider rendern (Grid vorhanden, alle Cards da)
//   - Health-Pill-Farben / data-status fuer healthy / degraded / down
//   - Loading-State
//   - Error-State
//   - Empty-State (providers = [])
//   - p50/p95-Latenz-Anzeige
//   - null-Latenz zeigt "—"
//   - is_default-Badge sichtbar

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { LlmTab } from "../LlmTab";
import type { CockpitProvider, ProvidersResponse } from "../../../lib/types";
import * as apiModule from "../../../lib/api";

// ── Helpers ────────────────────────────────────────────────────────────────

function renderWithProviders(ui: ReactNode) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchInterval: false },
    },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

// ── Test-Fixtures ─────────────────────────────────────────────────────────

const PROVIDER_HEALTHY: CockpitProvider = {
  id: "anthropic",
  name: "Anthropic",
  type: "anthropic",
  status: "healthy",
  base_url: "https://api.anthropic.com",
  api_key_hint: "sk-ant-ap...3A9F",
  latency_p50_ms: 1243,
  latency_p95_ms: 3820,
  cost_per_1m_tokens_usd: null,
  last_check: "2026-05-16T08:42:00Z",
  is_default: true,
  profiles: {
    STANDARD: "claude-3-5-haiku-20241022",
    MINI: null,
    HEAVY: "claude-opus-4-7",
    VISION: null,
  },
};

const PROVIDER_DEGRADED: CockpitProvider = {
  id: "local",
  name: "Local (OctoBoss)",
  type: "openai-like",
  status: "degraded",
  base_url: "http://192.168.200.71:11434",
  api_key_hint: null,
  latency_p50_ms: 8540,
  latency_p95_ms: 24100,
  cost_per_1m_tokens_usd: null,
  last_check: "2026-05-16T08:41:55Z",
  is_default: false,
  profiles: null,
};

const PROVIDER_DOWN: CockpitProvider = {
  id: "openai",
  name: "OpenAI",
  type: "openai-like",
  status: "down",
  base_url: "https://api.openai.com",
  api_key_hint: null,
  latency_p50_ms: null,
  latency_p95_ms: null,
  cost_per_1m_tokens_usd: null,
  last_check: null,
  is_default: false,
  profiles: null,
};

const THREE_PROVIDERS: ProvidersResponse = {
  providers: [PROVIDER_HEALTHY, PROVIDER_DEGRADED, PROVIDER_DOWN],
};

// ── Setup / Teardown ───────────────────────────────────────────────────────

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe("LlmTab", () => {
  it("rendert Grid mit 3 Provider-Cards wenn API 3 Provider liefert", async () => {
    vi.spyOn(apiModule.api, "getCockpitProviders").mockResolvedValue(
      THREE_PROVIDERS
    );

    renderWithProviders(<LlmTab />);

    await waitFor(() =>
      expect(screen.getByTestId("llm-provider-grid")).toBeInTheDocument()
    );

    // Alle 3 Cards vorhanden
    expect(screen.getByTestId("provider-card-anthropic")).toBeInTheDocument();
    expect(screen.getByTestId("provider-card-local")).toBeInTheDocument();
    expect(screen.getByTestId("provider-card-openai")).toBeInTheDocument();
  });

  it("Health-Pill zeigt data-status='healthy' fuer Anthropic-Provider", async () => {
    vi.spyOn(apiModule.api, "getCockpitProviders").mockResolvedValue(
      THREE_PROVIDERS
    );

    renderWithProviders(<LlmTab />);

    await waitFor(() =>
      expect(screen.getByTestId("provider-card-anthropic")).toBeInTheDocument()
    );

    const card = screen.getByTestId("provider-card-anthropic");
    const pill = card.querySelector("[data-testid='health-pill']");
    expect(pill).not.toBeNull();
    expect(pill!.getAttribute("data-status")).toBe("healthy");
  });

  it("Health-Pill zeigt data-status='degraded' fuer Local-Provider", async () => {
    vi.spyOn(apiModule.api, "getCockpitProviders").mockResolvedValue(
      THREE_PROVIDERS
    );

    renderWithProviders(<LlmTab />);

    await waitFor(() =>
      expect(screen.getByTestId("provider-card-local")).toBeInTheDocument()
    );

    const card = screen.getByTestId("provider-card-local");
    const pill = card.querySelector("[data-testid='health-pill']");
    expect(pill!.getAttribute("data-status")).toBe("degraded");
  });

  it("Health-Pill zeigt data-status='down' fuer OpenAI-Provider", async () => {
    vi.spyOn(apiModule.api, "getCockpitProviders").mockResolvedValue(
      THREE_PROVIDERS
    );

    renderWithProviders(<LlmTab />);

    await waitFor(() =>
      expect(screen.getByTestId("provider-card-openai")).toBeInTheDocument()
    );

    const card = screen.getByTestId("provider-card-openai");
    const pill = card.querySelector("[data-testid='health-pill']");
    expect(pill!.getAttribute("data-status")).toBe("down");
  });

  it("zeigt Loading-State bevor die Daten geladen sind", () => {
    let _resolve!: (r: ProvidersResponse) => void;
    vi.spyOn(apiModule.api, "getCockpitProviders").mockImplementation(
      () => new Promise<ProvidersResponse>((res) => (_resolve = res))
    );

    renderWithProviders(<LlmTab />);

    expect(screen.getByTestId("llm-loading")).toBeInTheDocument();

    // Promise aufloesen damit React-Query kein offenes Handle haelt
    _resolve(THREE_PROVIDERS);
  });

  it("zeigt Error-State wenn getCockpitProviders fehlschlaegt", async () => {
    vi.spyOn(apiModule.api, "getCockpitProviders").mockRejectedValue(
      new Error("connection refused")
    );

    renderWithProviders(<LlmTab />);

    await waitFor(() =>
      expect(screen.getByTestId("llm-error")).toBeInTheDocument()
    );
    expect(screen.getByTestId("llm-error").textContent).toContain(
      "connection refused"
    );
  });

  it("zeigt Empty-State wenn keine Provider zurueckkommen", async () => {
    vi.spyOn(apiModule.api, "getCockpitProviders").mockResolvedValue({
      providers: [],
    });

    renderWithProviders(<LlmTab />);

    await waitFor(() =>
      expect(screen.getByTestId("llm-empty")).toBeInTheDocument()
    );
  });

  it("zeigt p50 und p95 Latenz korrekt formatiert", async () => {
    vi.spyOn(apiModule.api, "getCockpitProviders").mockResolvedValue(
      THREE_PROVIDERS
    );

    renderWithProviders(<LlmTab />);

    await waitFor(() =>
      expect(screen.getByTestId("provider-card-anthropic")).toBeInTheDocument()
    );

    const card = screen.getByTestId("provider-card-anthropic");
    const p50 = card.querySelector("[data-testid='latency-p50']");
    const p95 = card.querySelector("[data-testid='latency-p95']");

    expect(p50).not.toBeNull();
    expect(p95).not.toBeNull();
    expect(p50!.textContent).toContain("1243");
    expect(p95!.textContent).toContain("3820");
  });

  it("zeigt '—' fuer null-Latenz beim Down-Provider", async () => {
    vi.spyOn(apiModule.api, "getCockpitProviders").mockResolvedValue(
      THREE_PROVIDERS
    );

    renderWithProviders(<LlmTab />);

    await waitFor(() =>
      expect(screen.getByTestId("provider-card-openai")).toBeInTheDocument()
    );

    const card = screen.getByTestId("provider-card-openai");
    const p50 = card.querySelector("[data-testid='latency-p50']");
    const p95 = card.querySelector("[data-testid='latency-p95']");

    expect(p50!.textContent).toBe("—");
    expect(p95!.textContent).toBe("—");
  });

  it("zeigt Default-Badge nur beim Default-Provider", async () => {
    vi.spyOn(apiModule.api, "getCockpitProviders").mockResolvedValue(
      THREE_PROVIDERS
    );

    renderWithProviders(<LlmTab />);

    await waitFor(() =>
      expect(screen.getByTestId("provider-card-anthropic")).toBeInTheDocument()
    );

    // Anthropic ist Default
    const anthropicCard = screen.getByTestId("provider-card-anthropic");
    expect(
      anthropicCard.querySelector("[data-testid='default-badge']")
    ).not.toBeNull();

    // Local hat kein Default-Badge
    const localCard = screen.getByTestId("provider-card-local");
    expect(
      localCard.querySelector("[data-testid='default-badge']")
    ).toBeNull();
  });
});
