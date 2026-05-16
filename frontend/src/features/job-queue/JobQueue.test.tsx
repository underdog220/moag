// Tests fuer JobQueue — Filter-Buttons, Empty-State, Render aus Store.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { JobQueue } from "./JobQueue";
import { useJobStore } from "./jobStore";

beforeEach(() => {
  useJobStore.getState()._reset();
  // Mock-Modus, damit WebSocket nicht real verbindet
  Object.defineProperty(window, "location", {
    value: new URL("http://localhost:5173/?mock=true"),
    writable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function withRouter(ui: React.ReactNode) {
  return <MemoryRouter>{ui}</MemoryRouter>;
}

describe("JobQueue", () => {
  it("zeigt Empty-State mit Pfeil-Animation wenn keine Jobs vorhanden sind", () => {
    render(withRouter(<JobQueue />));
    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    expect(screen.getByTestId("empty-arrow")).toBeInTheDocument();
  });

  it("rendert Job-Reihen aus dem Store und ruft onSelectJob bei Klick", () => {
    useJobStore.getState().loadFromServer([
      {
        job_id: "ocr-running",
        filename: "live.pdf",
        status: "running",
        progress_pct: 25,
        page_total: 4,
        page_done: 1,
        started_at: "2026-05-06T10:00:00Z",
        finished_at: null,
        doctype: null,
        doctype_confidence: null,
        pii_count: null,
        consensus_score: null,
        engines_used: [],
        nodes_used: [],
        error: null,
      },
    ]);

    const onSelectJob = vi.fn();
    render(withRouter(<JobQueue onSelectJob={onSelectJob} />));

    const row = screen.getByTestId("job-row");
    expect(row.getAttribute("data-job-id")).toBe("ocr-running");
    fireEvent.click(row);
    expect(onSelectJob).toHaveBeenCalledWith("ocr-running");
  });

  it("Filter-Buttons aendern den Filter-State und blenden non-matching Jobs aus", () => {
    useJobStore.getState().loadFromServer([
      {
        job_id: "a",
        filename: "a.pdf",
        status: "done",
        progress_pct: 100,
        page_total: 1,
        page_done: 1,
        started_at: "2026-05-06T10:00:00Z",
        finished_at: "2026-05-06T10:01:00Z",
        doctype: null,
        doctype_confidence: null,
        pii_count: null,
        consensus_score: null,
        engines_used: [],
        nodes_used: [],
        error: null,
      },
      {
        job_id: "b",
        filename: "b.pdf",
        status: "failed",
        progress_pct: 30,
        page_total: 1,
        page_done: 0,
        started_at: "2026-05-06T10:05:00Z",
        finished_at: "2026-05-06T10:05:10Z",
        doctype: null,
        doctype_confidence: null,
        pii_count: null,
        consensus_score: null,
        engines_used: [],
        nodes_used: [],
        error: "Boom",
      },
    ]);

    render(withRouter(<JobQueue />));
    expect(screen.getAllByTestId("job-row").length).toBe(2);

    fireEvent.click(screen.getByTestId("filter-failed"));
    const rows = screen.getAllByTestId("job-row");
    expect(rows.length).toBe(1);
    expect(rows[0].getAttribute("data-job-id")).toBe("b");
  });
});
