// Test: HistoryPage (index.tsx) verdrahtet HistoryTab korrekt.
// Prueft dass der Stub-EmptyState (seit 2026-05-06 dead-wired) nicht mehr gerendert wird
// und dass stattdessen eine echte HistoryTab-Spaltenstruktur sichtbar ist.

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import HistoryPage from "../index";
import * as apiModule from "../../../lib/api";
import type { JobStatus } from "../../../lib/types";

function buildJob(overrides: Partial<JobStatus> = {}): JobStatus {
  return {
    job_id: "ocr-default",
    filename: "datei.pdf",
    status: "done",
    progress_pct: 100,
    page_total: 3,
    page_done: 3,
    started_at: "2026-05-06T10:00:00Z",
    finished_at: "2026-05-06T10:01:00Z",
    doctype: "Rechnung",
    doctype_confidence: 0.94,
    pii_count: 4,
    consensus_score: 0.96,
    engines_used: ["tesseract"],
    nodes_used: ["WorkRyzen"],
    error: null,
    ...overrides,
  };
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <HistoryPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.spyOn(apiModule.api, "listJobs").mockResolvedValue({
    jobs: [buildJob()],
    total: 1,
    filtered: 1,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("HistoryPage (index.tsx Wiring)", () => {
  it("rendert NICHT den alten EmptyState-Stub", async () => {
    renderPage();
    // Der veraltete Stub-Text darf nicht mehr da sein
    expect(
      screen.queryByText("History noch nicht implementiert"),
    ).toBeNull();
  });

  it("rendert die HistoryTab-Tabellenstruktur — beweist echtes Wiring statt Stub", async () => {
    renderPage();
    // HistoryTab rendert data-testid="history-table" — das beweist echtes Wiring statt Stub
    expect(await screen.findByTestId("history-table")).toBeTruthy();
  });
});
