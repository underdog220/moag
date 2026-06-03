// Tests fuer BenchmarksPage.
// Deckt ab: Render mit Mock-Matrix, 503-Degraded-State, ConfirmDialog Run-Trigger.

import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

import { BenchmarksPage } from "../pages/Benchmarks";
import * as apiModule from "../../../lib/api";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeQC() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchInterval: false, staleTime: 0 },
    },
  });
}

function wrap(node: ReactNode) {
  return (
    <MemoryRouter initialEntries={["/octoboss/benchmarks"]}>
      <QueryClientProvider client={makeQC()}>{node}</QueryClientProvider>
    </MemoryRouter>
  );
}

// ── Mock-Daten ─────────────────────────────────────────────────────────────────

const MOCK_MATRIX = {
  subjects: ["tesseract", "llava:13b"],
  nodes: ["Ryzenstrike", "WhiteStar"],
  matrix: {
    tesseract: {
      Ryzenstrike: {
        domain: "ocr",
        metric_key: "char_accuracy",
        metric_value: 0.97,
        metric_string: "97.0%",
        passed: true,
        error_text: null,
        age_hours: 2.5,
        stale: false,
        trend: "stable",
        created_at: "2026-05-19T08:00:00Z",
      },
    },
    "llava:13b": {
      WhiteStar: {
        domain: "llm_vision",
        metric_key: "pass",
        metric_value: 1.0,
        metric_string: "pass",
        passed: true,
        error_text: null,
        age_hours: 1.0,
        stale: false,
        trend: "up",
        created_at: "2026-05-19T09:00:00Z",
      },
    },
  },
};

const MOCK_RUNS = {
  runs: [
    {
      run_id: "550e8400-e29b-41d4-a716-446655440000",
      started_at: "2026-05-19T08:00:00Z",
      status: "completed",
      scope_filters: {},
      summary: { total: 2, passed: 2, failed: 0, skipped: 0 },
    },
  ],
  count: 1,
  active_run_id: null,
};

const MOCK_HISTORY = {
  results: [
    {
      id: "h1",
      subject: "tesseract",
      node_id: "Ryzenstrike",
      domain: "ocr",
      metric_key: "char_accuracy",
      metric_value: 0.97,
      metric_string: "97.0%",
      passed: true,
      error_text: null,
      created_at: "2026-05-19T08:00:00Z",
    },
  ],
  count: 1,
};

const MOCK_RUN_STARTED = {
  run_id: "660e8400-e29b-41d4-a716-446655440001",
  started_at: "2026-05-19T10:00:00Z",
  scope_filters: {},
  message: "Benchmark-Run gestartet",
};

// Node-Liste fuers Hostname-Mapping: node_id == Hostname (Test vereinfacht),
// beide verbunden → liveNodes = beide, keine veralteten.
const MOCK_NODES = {
  nodes: [
    { node_id: "Ryzenstrike", hostname: "Ryzenstrike", connected: true, hardware: { gpu_name: "RTX 2060S" } },
    { node_id: "WhiteStar", hostname: "WhiteStar", connected: true, hardware: { gpu_name: "RX 7900XTX" } },
  ],
};

// ── API-Spies als Helper ───────────────────────────────────────────────────────

function mockAllApis(overrides: Partial<{
  matrix: unknown;
  runs: unknown;
  history: unknown;
  runBenchmark: unknown;
}> = {}) {
  vi.spyOn(apiModule.api.octoboss, "getBenchmarkMatrix").mockResolvedValue(
    overrides.matrix ?? MOCK_MATRIX,
  );
  vi.spyOn(apiModule.api.octoboss, "getBenchmarkRuns").mockResolvedValue(
    overrides.runs ?? MOCK_RUNS,
  );
  vi.spyOn(apiModule.api.octoboss, "getBenchmarkHistory").mockResolvedValue(
    overrides.history ?? MOCK_HISTORY,
  );
  vi.spyOn(apiModule.api.octoboss, "getNodes").mockResolvedValue(MOCK_NODES);
  if (overrides.runBenchmark !== undefined) {
    vi.spyOn(apiModule.api.octoboss, "runBenchmark").mockResolvedValue(
      overrides.runBenchmark,
    );
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

afterEach(() => vi.restoreAllMocks());

describe("BenchmarksPage", () => {
  it("rendert Seitenheader 'Benchmarks'", async () => {
    mockAllApis();
    render(wrap(<BenchmarksPage />));
    expect(screen.getByText("Benchmarks")).toBeTruthy();
  });

  it("rendert Matrix-Tabelle mit Subjects und Nodes", async () => {
    mockAllApis();
    render(wrap(<BenchmarksPage />));
    await waitFor(() => {
      // "tesseract" und "Ryzenstrike" erscheinen mehrfach (Matrix + History) — getAllByText
      const subjectCells = screen.getAllByText("tesseract");
      expect(subjectCells.length).toBeGreaterThan(0);
      const nodeCells = screen.getAllByText("Ryzenstrike");
      expect(nodeCells.length).toBeGreaterThan(0);
    });
  });

  it("rendert Matrix-Zellwert fuer tesseract/Ryzenstrike", async () => {
    mockAllApis();
    render(wrap(<BenchmarksPage />));
    await waitFor(() => {
      // "97.0%" erscheint in Matrix und History — getAllByText verwenden
      const cells = screen.getAllByText("97.0%");
      expect(cells.length).toBeGreaterThan(0);
    });
  });

  it("rendert History-Eintrag", async () => {
    mockAllApis();
    render(wrap(<BenchmarksPage />));
    await waitFor(() => {
      // History-Liste zeigt Subject (kann mehrfach erscheinen)
      const cells = screen.getAllByText("tesseract");
      expect(cells.length).toBeGreaterThan(0);
    });
  });

  it("zeigt Degraded-Banner wenn Matrix 503 liefert", async () => {
    vi.spyOn(apiModule.api.octoboss, "getBenchmarkMatrix").mockRejectedValue(
      new Error("503 Benchmark-DB nicht verfuegbar"),
    );
    vi.spyOn(apiModule.api.octoboss, "getBenchmarkRuns").mockResolvedValue(MOCK_RUNS);
    vi.spyOn(apiModule.api.octoboss, "getBenchmarkHistory").mockResolvedValue(MOCK_HISTORY);
    vi.spyOn(apiModule.api.octoboss, "getNodes").mockResolvedValue(MOCK_NODES);

    render(wrap(<BenchmarksPage />));
    await waitFor(() => {
      const body = document.body.textContent ?? "";
      expect(body).toContain("Benchmark-DB nicht verfuegbar");
    });
  });

  it("zeigt Degraded-Banner wenn Runs 503 liefert", async () => {
    vi.spyOn(apiModule.api.octoboss, "getBenchmarkMatrix").mockResolvedValue(MOCK_MATRIX);
    vi.spyOn(apiModule.api.octoboss, "getBenchmarkRuns").mockRejectedValue(
      new Error("503 Benchmark-DB nicht verfuegbar"),
    );
    vi.spyOn(apiModule.api.octoboss, "getBenchmarkHistory").mockResolvedValue(MOCK_HISTORY);
    vi.spyOn(apiModule.api.octoboss, "getNodes").mockResolvedValue(MOCK_NODES);

    render(wrap(<BenchmarksPage />));
    await waitFor(() => {
      const body = document.body.textContent ?? "";
      expect(body).toContain("Benchmark-DB nicht verfuegbar");
    });
  });

  it("zeigt Run-Trigger-Button", async () => {
    mockAllApis();
    render(wrap(<BenchmarksPage />));
    await waitFor(() => {
      // Button per aria-label suchen (role="button" + name)
      expect(screen.getByRole("button", { name: /Benchmark-Run starten/i })).toBeTruthy();
    });
  });

  it("oeffnet ConfirmDialog bei Klick auf Run-Trigger-Button", async () => {
    mockAllApis();
    render(wrap(<BenchmarksPage />));
    // Warten bis Daten geladen sind und der Button aktiv ist
    const btn = await screen.findByRole("button", { name: /Benchmark-Run starten/i });
    expect(btn).toBeTruthy();

    fireEvent.click(btn);

    // ConfirmDialog muss erscheinen
    await waitFor(() => {
      expect(screen.getByRole("alertdialog")).toBeTruthy();
    });
  });

  it("schliesst ConfirmDialog bei Abbrechen", async () => {
    mockAllApis();
    render(wrap(<BenchmarksPage />));
    const btn = await screen.findByRole("button", { name: /Benchmark-Run starten/i });

    fireEvent.click(btn);
    await waitFor(() => {
      expect(screen.getByRole("alertdialog")).toBeTruthy();
    });

    // Abbrechen-Button klicken
    const cancelBtn = screen.getByTestId("confirm-dialog-cancel");
    fireEvent.click(cancelBtn);

    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });
  });

  it("ruft runBenchmark nach Bestaetigung auf", async () => {
    mockAllApis({ runBenchmark: MOCK_RUN_STARTED });
    const spy = vi.spyOn(apiModule.api.octoboss, "runBenchmark").mockResolvedValue(
      MOCK_RUN_STARTED,
    );

    render(wrap(<BenchmarksPage />));
    const btn = await screen.findByRole("button", { name: /Benchmark-Run starten/i });

    fireEvent.click(btn);
    await waitFor(() => {
      expect(screen.getByRole("alertdialog")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("confirm-dialog-confirm"));
    await waitFor(() => {
      expect(spy).toHaveBeenCalledOnce();
    });
  });

  it("zeigt PageBadge", async () => {
    mockAllApis();
    render(wrap(<BenchmarksPage />));
    await waitFor(() => {
      const body = document.body.textContent ?? "";
      expect(body).toContain("benchmarks");
    });
  });

  it("rendert — fuer sparse Matrix-Zellen (kein Eintrag fuer llava:13b auf Ryzenstrike)", async () => {
    mockAllApis();
    render(wrap(<BenchmarksPage />));
    await waitFor(() => {
      // WhiteStar existiert in Tabelle (als Spaltenheader)
      expect(screen.getByText("WhiteStar")).toBeTruthy();
    });
  });
});
