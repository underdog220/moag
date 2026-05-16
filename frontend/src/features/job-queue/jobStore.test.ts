// Tests fuer jobStore — Reducer-Logik fuer WS-Events.

import { beforeEach, describe, expect, it } from "vitest";
import { useJobStore } from "./jobStore";

beforeEach(() => {
  useJobStore.getState()._reset();
});

describe("jobStore", () => {
  it("addOptimistic legt einen pending-Job an, renameOptimistic tauscht die ID", () => {
    useJobStore.getState().addOptimistic("rechnung.pdf", "tmp-1");

    let snap = useJobStore.getState();
    expect(snap.jobs.size).toBe(1);
    const before = snap.jobs.get("tmp-1");
    expect(before?.status).toBe("pending");
    expect(before?.optimistic).toBe(true);

    useJobStore.getState().renameOptimistic("tmp-1", "ocr-real-1");
    snap = useJobStore.getState();
    expect(snap.jobs.has("tmp-1")).toBe(false);
    expect(snap.jobs.get("ocr-real-1")?.filename).toBe("rechnung.pdf");
  });

  it("job_progress aktualisiert page_done/page_total und progress_pct, native-Hint setzt Flag", () => {
    useJobStore.getState().addOptimistic("a.pdf", "ocr-x");
    useJobStore.getState().applyEvent({ type: "job_started", job_id: "ocr-x", filename: "a.pdf" } as any);
    useJobStore.getState().applyEvent({
      type: "job_progress",
      job_id: "ocr-x",
      page_done: 2,
      page_total: 5,
      engine: "tesseract",
      node: "WorkRyzen",
    } as any);

    const after = useJobStore.getState().jobs.get("ocr-x")!;
    expect(after.status).toBe("running");
    expect(after.page_done).toBe(2);
    expect(after.page_total).toBe(5);
    expect(after.progress_pct).toBe(40);
    expect(after.native_text_layer).toBeFalsy();

    useJobStore.getState().applyEvent({
      type: "job_progress",
      job_id: "ocr-x",
      page_done: 3,
      page_total: 5,
      engine: "native_text_layer",
      node: "WorkRyzen",
    } as any);
    expect(useJobStore.getState().jobs.get("ocr-x")?.native_text_layer).toBe(true);
  });

  it("job_engine_done sammelt Engine-Status pro Engine, job_done setzt Status fertig", () => {
    useJobStore.getState().applyEvent({ type: "job_started", job_id: "ocr-y", filename: "x.pdf" } as any);
    useJobStore.getState().applyEvent({
      type: "job_engine_done",
      job_id: "ocr-y",
      page: 1,
      engine: "tesseract",
      latency_ms: 280,
      confidence: 0.91,
    } as any);
    useJobStore.getState().applyEvent({
      type: "job_engine_done",
      job_id: "ocr-y",
      page: 1,
      engine: "easyocr",
      latency_ms: 1200,
      confidence: 0.94,
    } as any);

    const mid = useJobStore.getState().jobs.get("ocr-y")!;
    expect(mid.engine_status?.length).toBe(2);
    expect(mid.engines_used.sort()).toEqual(["easyocr", "tesseract"]);

    useJobStore.getState().applyEvent({
      type: "job_done",
      job_id: "ocr-y",
      doctype: "Rechnung",
      doctype_confidence: 0.95,
      pii_count: 3,
      consensus_score: 0.96,
    } as any);
    const done = useJobStore.getState().jobs.get("ocr-y")!;
    expect(done.status).toBe("done");
    expect(done.progress_pct).toBe(100);
    expect(done.doctype).toBe("Rechnung");
  });

  it("job_failed setzt Status, markRetry stellt zurueck auf pending", () => {
    useJobStore.getState().applyEvent({ type: "job_started", job_id: "ocr-z", filename: "k.pdf" } as any);
    useJobStore.getState().applyEvent({
      type: "job_failed",
      job_id: "ocr-z",
      error: "PDF malformed",
    } as any);

    let s = useJobStore.getState().jobs.get("ocr-z")!;
    expect(s.status).toBe("failed");
    expect(s.error).toBe("PDF malformed");

    useJobStore.getState().markRetry("ocr-z");
    s = useJobStore.getState().jobs.get("ocr-z")!;
    expect(s.status).toBe("pending");
    expect(s.error).toBeNull();
    expect(s.progress_pct).toBe(0);
  });

  it("visibleJobs filtert nach status und sortiert neueste zuerst", () => {
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
        status: "running",
        progress_pct: 50,
        page_total: 2,
        page_done: 1,
        started_at: "2026-05-06T11:00:00Z",
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

    let visible = useJobStore.getState().visibleJobs();
    expect(visible.map((j) => j.job_id)).toEqual(["b", "a"]); // neueste zuerst

    useJobStore.getState().setFilter("running");
    visible = useJobStore.getState().visibleJobs();
    expect(visible.map((j) => j.job_id)).toEqual(["b"]);
  });
});
