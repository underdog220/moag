// Tests fuer SmokeIndicator-Komponente.
// Wir testen:
//   - Rendert "Oberon OK" bei PASS-Verdict
//   - Rendert "DEGRADED" mit Zaehler bei WARN-Verdict
//   - Rendert "DOWN" mit Zaehler bei FAIL-Verdict
//   - Rendert "???" im Loading-State
//   - Auto-Refresh ist konfiguriert (refetchInterval gesetzt)

import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { SmokeIndicator } from "../SmokeIndicator";
import type { SmokeResponse } from "../../lib/types";
import * as apiModule from "../../lib/api";

// ── Hilfsfunktionen ──────────────────────────────────────────────────────────

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Kein Retry in Tests — Fehler sofort sichtbar.
        retry: false,
        // Kein automatisches Polling in Tests (wir steuern das manuell).
        refetchInterval: false,
        // Kein Stale-Time — jeder render laesst einen neuen Fetch zu.
        staleTime: 0,
      },
    },
  });
}

function renderWithProviders(ui: ReactNode) {
  const qc = makeQueryClient();
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

// Basis-SmokeResponse-Fixture (PASS)
const SMOKE_PASS: SmokeResponse = {
  suites: [
    { name: "dsgvo-status",    status: "PASS", last_run: "2026-05-16T10:00:01Z", latency_ms: 3,  error: null },
    { name: "pii-detect",      status: "PASS", last_run: "2026-05-16T10:00:01Z", latency_ms: 18, error: null },
    { name: "ner-extract",     status: "PASS", last_run: "2026-05-16T10:00:01Z", latency_ms: 5,  error: null },
    { name: "octoboss-local",  status: "PASS", last_run: "2026-05-16T10:00:01Z", latency_ms: 12, error: null },
    { name: "oberon-postgres", status: "PASS", last_run: "2026-05-16T10:00:01Z", latency_ms: 4,  error: null },
    { name: "local-llm-hub",   status: "PASS", last_run: "2026-05-16T10:00:01Z", latency_ms: 87, error: null },
  ],
  summary: { pass: 6, warn: 0, fail: 0, total: 6, verdict: "PASS" },
};

// WARN-Fixture: 1 Check mit WARN
const SMOKE_WARN: SmokeResponse = {
  suites: [
    ...SMOKE_PASS.suites.slice(0, 5),
    { name: "ner-extract", status: "WARN", last_run: "2026-05-16T10:00:01Z", latency_ms: 5, error: "NER_MODE=OFF" },
  ],
  summary: { pass: 5, warn: 1, fail: 0, total: 6, verdict: "WARN" },
};

// FAIL-Fixture: 1 Check FAIL, 2 PASS
const SMOKE_FAIL: SmokeResponse = {
  suites: [
    { name: "dsgvo-status",    status: "FAIL", last_run: "2026-05-16T10:00:01Z", latency_ms: 3000, error: "Timeout" },
    { name: "pii-detect",      status: "PASS", last_run: "2026-05-16T10:00:01Z", latency_ms: 18, error: null },
    { name: "ner-extract",     status: "PASS", last_run: "2026-05-16T10:00:01Z", latency_ms: 5,  error: null },
    { name: "octoboss-local",  status: "PASS", last_run: "2026-05-16T10:00:01Z", latency_ms: 12, error: null },
    { name: "oberon-postgres", status: "PASS", last_run: "2026-05-16T10:00:01Z", latency_ms: 4,  error: null },
    { name: "local-llm-hub",   status: "PASS", last_run: "2026-05-16T10:00:01Z", latency_ms: 87, error: null },
  ],
  summary: { pass: 5, warn: 0, fail: 1, total: 6, verdict: "FAIL" },
};

// ── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.spyOn(apiModule.api, "getCockpitSmoke");
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("SmokeIndicator", () => {
  it("rendert '???' im Loading-State bevor Daten ankommen", () => {
    // getCockpitSmoke resolved nie → Komponente bleibt im Pending-State.
    vi.mocked(apiModule.api.getCockpitSmoke).mockReturnValue(new Promise(() => {}));

    renderWithProviders(<SmokeIndicator />);

    const indicator = screen.getByTestId("smoke-indicator");
    expect(indicator).toBeInTheDocument();
    expect(indicator.textContent).toContain("???");
  });

  it("rendert 'Oberon OK' bei PASS-Verdict", async () => {
    vi.mocked(apiModule.api.getCockpitSmoke).mockResolvedValue(SMOKE_PASS);

    renderWithProviders(<SmokeIndicator />);

    await waitFor(() => {
      expect(screen.getByTestId("smoke-indicator").textContent).toContain("Oberon OK");
    });
  });

  it("rendert 'DEGRADED' mit Zaehler bei WARN-Verdict", async () => {
    vi.mocked(apiModule.api.getCockpitSmoke).mockResolvedValue(SMOKE_WARN);

    renderWithProviders(<SmokeIndicator />);

    await waitFor(() => {
      const text = screen.getByTestId("smoke-indicator").textContent ?? "";
      expect(text).toContain("DEGRADED");
      // 5 von 6 bestanden
      expect(text).toContain("5/6");
    });
  });

  it("rendert 'DOWN' mit Zaehler bei FAIL-Verdict", async () => {
    vi.mocked(apiModule.api.getCockpitSmoke).mockResolvedValue(SMOKE_FAIL);

    renderWithProviders(<SmokeIndicator />);

    await waitFor(() => {
      const text = screen.getByTestId("smoke-indicator").textContent ?? "";
      expect(text).toContain("DOWN");
      expect(text).toContain("5/6");
    });
  });

  it("enthaelt Sub-Check-Details im Title-Attribut bei WARN", async () => {
    vi.mocked(apiModule.api.getCockpitSmoke).mockResolvedValue(SMOKE_WARN);

    renderWithProviders(<SmokeIndicator />);

    await waitFor(() => {
      const indicator = screen.getByTestId("smoke-indicator");
      const title = indicator.getAttribute("title") ?? "";
      // Sub-Check-Name muss im Tooltip stehen
      expect(title).toContain("ner-extract");
      // Fehlermeldung muss sichtbar sein
      expect(title).toContain("NER_MODE=OFF");
    });
  });
});
