import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { JobDetailPanel } from "./JobDetailPanel";
import type { AbCompareResult, JobDetail, RecognizedTextDocument } from "../../lib/types";

// API + Env mocken — wir wollen keine echten Mock-JSON-Lookups,
// sondern voll kontrollierte Promise-Returns.
vi.mock("../../lib/api", () => {
  return {
    api: {
      getJob: vi.fn(),
      getJobText: vi.fn(),
      getAbCompare: vi.fn(),
      getJobPdfUrl: (id: string) => `/api/jobs/${id}/pdf`,
      getJobOutputUrl: (id: string) => `/api/jobs/${id}/output`,
    },
    ApiError: class ApiError extends Error {
      constructor(public status: number, public path: string, message: string) {
        super(message);
      }
    },
  };
});

vi.mock("../../lib/env", () => ({
  isMockMode: () => true, // Mock-Modus -> PDF-URL bleibt null, kein pdf.js-Load
  BUILD_HASH: "test",
  BUILD_TS: "2026-05-06T12:00:00Z",
}));

// jsdom Canvas-Stub fuer PdfPreview/Heatmap
let originalGetContext: typeof HTMLCanvasElement.prototype.getContext | undefined;

beforeEach(() => {
  originalGetContext = HTMLCanvasElement.prototype.getContext;
  // @ts-expect-error vi mock
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    strokeRect: vi.fn(),
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    font: "",
  }));
});

afterEach(() => {
  if (originalGetContext) HTMLCanvasElement.prototype.getContext = originalGetContext;
  vi.clearAllMocks();
});

const detailDone: JobDetail = {
  job_id: "ocr-71c190ec",
  filename: "rechnung.pdf",
  status: "done",
  progress_pct: 100,
  page_total: 5,
  page_done: 5,
  started_at: "2026-05-06T10:30:00Z",
  finished_at: "2026-05-06T10:32:00Z",
  doctype: "Rechnung",
  doctype_confidence: 0.94,
  doctype_text_score: 0.97,
  doctype_layout_score: 0.86,
  doctype_alternatives: [{ label: "Mahnung", score: 0.04 }],
  pii_findings: [
    {
      type: "PERSON",
      count: 2,
      examples: ["**** Mueller"],
      hits: [{ page: 1, bbox: [120, 80, 280, 105] }],
    },
  ],
  pii_count: 4,
  consensus_score: 0.96,
  engine_consensus_per_page: [
    { page: 1, tesseract: 0.94, easyocr: 0.97 },
    { page: 2, tesseract: 0.92, easyocr: 0.96 },
  ],
  engines_used: ["tesseract", "easyocr"],
  nodes_used: ["Ryzenstrike", "WorkRyzen"],
  routing_trace: [
    { page: 1, engine: "tesseract", node: "Ryzenstrike", latency_ms: 280, confidence: 0.94 },
    { page: 1, engine: "easyocr", node: "WorkRyzen", latency_ms: 1100, confidence: 0.97 },
  ],
  ab_compare_available: true,
  error: null,
};

const text: RecognizedTextDocument = {
  job_id: "ocr-71c190ec",
  is_native: false,
  pages: [
    {
      page: 1,
      width: 595,
      height: 842,
      words: [{ text: "Rechnung", confidence: 0.98, bbox: [50, 50, 180, 80] }],
    },
  ],
};

const abResult: AbCompareResult = {
  available: true,
  local: { text: "L", latency_ms: 4200, engines: ["tesseract"] },
  cluster: { text: "C", latency_ms: 1800, engines: ["tesseract", "easyocr"] },
  diff: [{ type: "equal", text: "Foo" }],
};

async function setup() {
  const { api } = await import("../../lib/api");
  vi.mocked(api.getJob).mockResolvedValue(detailDone);
  vi.mocked(api.getJobText).mockResolvedValue(text);
  vi.mocked(api.getAbCompare).mockResolvedValue(abResult);
  return { api };
}

describe("JobDetailPanel", () => {
  it("zeigt Loading-State und dann Job-Header", async () => {
    await setup();
    render(
      <MemoryRouter>
        <JobDetailPanel jobId="ocr-71c190ec" />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("job-detail-loading")).toBeInTheDocument();
    await waitFor(() => screen.getByTestId("job-detail-tabs"));
    expect(screen.getByText("rechnung.pdf")).toBeInTheDocument();
    expect(screen.getByTestId("job-detail-status").textContent).toBe("done");
  });

  it("zeigt Error-State wenn getJob throwt", async () => {
    const { api } = await import("../../lib/api");
    vi.mocked(api.getJob).mockRejectedValue(new Error("boom"));
    vi.mocked(api.getJobText).mockResolvedValue(text);
    vi.mocked(api.getAbCompare).mockResolvedValue({ available: false });
    render(
      <MemoryRouter>
        <JobDetailPanel jobId="ocr-71c190ec" />
      </MemoryRouter>,
    );
    await waitFor(() => screen.getByTestId("job-detail-error"));
    expect(screen.getByRole("alert").textContent).toContain("boom");
  });

  it("rendert Default-Tab Uebersicht mit Doctype + Routing", async () => {
    await setup();
    render(
      <MemoryRouter>
        <JobDetailPanel jobId="ocr-71c190ec" />
      </MemoryRouter>,
    );
    await waitFor(() => screen.getByTestId("job-detail-overview"));
    expect(screen.getByTestId("doctype-badge")).toBeInTheDocument();
    expect(screen.getByTestId("routing-trace")).toBeInTheDocument();
  });

  it("Tab-Wechsel: PII-Tab zeigt PiiList und Click triggert Sprung im PDF (heatmap an)", async () => {
    await setup();
    render(
      <MemoryRouter>
        <JobDetailPanel jobId="ocr-71c190ec" />
      </MemoryRouter>,
    );
    await waitFor(() => screen.getByTestId("job-detail-tabs"));
    fireEvent.click(screen.getByTestId("job-detail-tab-pii"));
    expect(screen.getByTestId("job-detail-pii")).toBeInTheDocument();
    expect(screen.getByTestId("pii-item-PERSON")).toBeInTheDocument();
    // Heatmap-Toggle-Default ist aus
    const toggle = screen.getByTestId("heatmap-toggle") as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    // Click PII-Item -> Heatmap soll an gehen
    fireEvent.click(screen.getByTestId("pii-item-PERSON"));
    await waitFor(() => {
      const updated = screen.getByTestId("heatmap-toggle") as HTMLInputElement;
      expect(updated.checked).toBe(true);
    });
  });

  it("Tab 'A/B' nur sichtbar wenn ab_compare_available=true und zeigt Diff", async () => {
    await setup();
    render(
      <MemoryRouter>
        <JobDetailPanel jobId="ocr-71c190ec" />
      </MemoryRouter>,
    );
    await waitFor(() => screen.getByTestId("job-detail-tabs"));
    expect(screen.getByTestId("job-detail-tab-ab")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("job-detail-tab-ab"));
    await waitFor(() => screen.getByTestId("ab-compare"));
    expect(screen.getByTestId("ab-compare-diff")).toBeInTheDocument();
  });

  it("A/B-Tab fehlt wenn ab_compare_available=false", async () => {
    const { api } = await import("../../lib/api");
    vi.mocked(api.getJob).mockResolvedValue({
      ...detailDone,
      ab_compare_available: false,
    });
    vi.mocked(api.getJobText).mockResolvedValue(text);
    vi.mocked(api.getAbCompare).mockResolvedValue({ available: false });
    render(
      <MemoryRouter>
        <JobDetailPanel jobId="ocr-71c190ec" />
      </MemoryRouter>,
    );
    await waitFor(() => screen.getByTestId("job-detail-tabs"));
    expect(screen.queryByTestId("job-detail-tab-ab")).not.toBeInTheDocument();
  });

  it("Konsens-Tab zeigt EngineConsensusHeatmap", async () => {
    await setup();
    render(
      <MemoryRouter>
        <JobDetailPanel jobId="ocr-71c190ec" />
      </MemoryRouter>,
    );
    await waitFor(() => screen.getByTestId("job-detail-tabs"));
    fireEvent.click(screen.getByTestId("job-detail-tab-consensus"));
    expect(screen.getByTestId("engine-consensus-heatmap")).toBeInTheDocument();
    expect(screen.getByTestId("heatmap-cell-tesseract-1").textContent).toBe("94");
  });
});
