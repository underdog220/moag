// Tests fuer HistoryTab — Tabelle, Filter, Sort, Pagination, Export.

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { HistoryTab } from "./HistoryTab";
import * as apiModule from "../../lib/api";
import type { JobStatus } from "../../lib/types";

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
    engines_used: ["tesseract", "easyocr"],
    nodes_used: ["WorkRyzen"],
    error: null,
    ...overrides,
  };
}

const SAMPLE_JOBS: JobStatus[] = [
  buildJob({ job_id: "ocr-1", filename: "rechnung.pdf", doctype: "Rechnung" }),
  buildJob({
    job_id: "ocr-2",
    filename: "vertrag.pdf",
    doctype: "Mietvertrag",
    status: "failed",
    error: "PDF-Header malformed",
  }),
  buildJob({
    job_id: "ocr-3",
    filename: "lageplan.png",
    doctype: "Lageplan",
    nodes_used: ["Ryzenstrike"],
    engines_used: ["paddleocr"],
  }),
];

function renderHistory(initialEntry: string = "/history") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <HistoryTab />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.spyOn(apiModule.api, "listJobs").mockResolvedValue({
    jobs: SAMPLE_JOBS,
    total: SAMPLE_JOBS.length,
    filtered: SAMPLE_JOBS.length,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("HistoryTab", () => {
  it("rendert Tabelle mit Spalten + Job-Zeilen", async () => {
    renderHistory();
    await waitFor(() => {
      expect(screen.getByTestId("history-table")).toBeInTheDocument();
      expect(screen.getByTestId("history-row-ocr-1")).toBeInTheDocument();
      expect(screen.getByTestId("history-row-ocr-2")).toBeInTheDocument();
      expect(screen.getByTestId("history-row-ocr-3")).toBeInTheDocument();
    });
  });

  it("zeigt Counter mit gefilterten + total", async () => {
    renderHistory();
    await waitFor(() => {
      expect(screen.getByTestId("history-count-total")).toHaveTextContent("3");
      expect(screen.getByTestId("history-count-filtered")).toHaveTextContent("3");
    });
  });

  it("filtert nach Filename via Search", async () => {
    renderHistory();
    await waitFor(() => screen.getByTestId("history-table"));
    const search = screen.getByTestId("history-filter-search") as HTMLInputElement;
    fireEvent.change(search, { target: { value: "lageplan" } });
    await waitFor(() => {
      expect(screen.queryByTestId("history-row-ocr-1")).not.toBeInTheDocument();
      expect(screen.queryByTestId("history-row-ocr-2")).not.toBeInTheDocument();
      expect(screen.getByTestId("history-row-ocr-3")).toBeInTheDocument();
    });
  });

  it("filtert nach Status (failed)", async () => {
    renderHistory();
    await waitFor(() => screen.getByTestId("history-table"));
    const select = screen.getByTestId("history-filter-status") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "failed" } });
    await waitFor(() => {
      expect(screen.queryByTestId("history-row-ocr-1")).not.toBeInTheDocument();
      expect(screen.getByTestId("history-row-ocr-2")).toBeInTheDocument();
    });
  });

  it("loest Export-CSV-Button via document.createElement('a')-Stub aus", async () => {
    renderHistory();
    await waitFor(() => screen.getByTestId("history-table"));

    // Mock URL.createObjectURL und revokeObjectURL fuer jsdom
    const createObjectURLMock = vi.fn(() => "blob://test");
    const revokeObjectURLMock = vi.fn();
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = createObjectURLMock;
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = revokeObjectURLMock;
    const clickSpy = vi.fn();
    const realCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = realCreateElement(tag);
      if (tag === "a") {
        Object.defineProperty(el, "click", { value: clickSpy });
      }
      return el;
    });

    fireEvent.click(screen.getByTestId("history-export-csv"));
    expect(createObjectURLMock).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("zeigt Pagination wenn Jobs > pageSize", async () => {
    const many = Array.from({ length: 75 }, (_, i) =>
      buildJob({ job_id: `ocr-${i}`, filename: `file-${i}.pdf` }),
    );
    vi.spyOn(apiModule.api, "listJobs").mockResolvedValue({
      jobs: many,
      total: many.length,
      filtered: many.length,
    });
    renderHistory();
    await waitFor(() => {
      expect(screen.getByTestId("history-pagination")).toBeInTheDocument();
      expect(screen.getByTestId("history-page-current")).toHaveTextContent("1");
    });
    fireEvent.click(screen.getByTestId("history-page-next"));
    await waitFor(() => {
      expect(screen.getByTestId("history-page-current")).toHaveTextContent("2");
    });
  });
});
