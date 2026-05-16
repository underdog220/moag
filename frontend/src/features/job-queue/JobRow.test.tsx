// Tests fuer JobRow — Status-Anzeige, Doctype-Badge, Retry-Button.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { JobRow } from "./JobRow";
import type { JobRowState } from "./jobStore";
import { useJobStore } from "./jobStore";
import { _getToastsForTest, clearAllToasts } from "../../lib/toast";

beforeEach(() => {
  useJobStore.getState()._reset();
  clearAllToasts();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeJob(overrides: Partial<JobRowState> = {}): JobRowState {
  return {
    job_id: "ocr-test",
    filename: "test.pdf",
    status: "running",
    progress_pct: 50,
    page_total: 4,
    page_done: 2,
    started_at: "2026-05-06T10:00:00Z",
    finished_at: null,
    doctype: null,
    doctype_confidence: null,
    pii_count: null,
    consensus_score: null,
    engines_used: [],
    nodes_used: [],
    error: null,
    ...overrides,
  };
}

describe("JobRow", () => {
  it("rendert Filename, Status und Doctype-Badge", () => {
    render(<JobRow job={makeJob({ doctype: "Rechnung", doctype_confidence: 0.94 })} />);
    expect(screen.getByText("test.pdf")).toBeInTheDocument();
    const badge = screen.getByTestId("doctype-badge");
    expect(badge.textContent).toContain("Rechnung");
    expect(badge.textContent).toContain("94%");
  });

  it("zeigt Retry-Button nur bei status=failed und ruft API + markRetry auf", async () => {
    const job = makeJob({ status: "failed", error: "Engine timeout" });
    // markRetry-Spy
    const markSpy = vi.spyOn(useJobStore.getState(), "markRetry");

    // api-Modul mocken — wir importieren es via vi.mock vor JobRow-Render
    const { api } = await import("../../lib/api");
    const retrySpy = vi.spyOn(api, "retryJob").mockResolvedValue({ ok: true });

    render(<JobRow job={job} />);
    const btn = screen.getByTestId("retry-button");
    fireEvent.click(btn);

    // Microtasks abwarten
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(retrySpy).toHaveBeenCalledWith("ocr-test");
    expect(markSpy).toHaveBeenCalledWith("ocr-test");
    const toasts = _getToastsForTest();
    expect(toasts.some((t) => t.kind === "success" && t.message.includes("Retry"))).toBe(true);
  });

  it("ruft onClick mit job_id auf, wenn die Zeile angeklickt wird", () => {
    const onClick = vi.fn();
    render(<JobRow job={makeJob({ job_id: "ocr-abc" })} onClick={onClick} />);
    const row = screen.getByTestId("job-row");
    fireEvent.click(row);
    expect(onClick).toHaveBeenCalledWith("ocr-abc");
  });

  it("zeigt Error-Tooltip bei failed", () => {
    render(<JobRow job={makeJob({ status: "failed", error: "PDF-Header malformed" })} />);
    const err = screen.getByTestId("job-error");
    expect(err.textContent).toContain("PDF-Header malformed");
    expect(err.getAttribute("title")).toBe("PDF-Header malformed");
  });
});
