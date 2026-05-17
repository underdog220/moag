// UploadHubPage.test.tsx — Smoke-Tests für die komplette Hub-Page.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UploadHubPage } from "./UploadHubPage";
import * as apiModule from "../../lib/api";
import type { UploadListResponse } from "../../lib/types";

const MOCK_UPLOADS: UploadListResponse = {
  uploads: [],
  total: 0,
  limit: 20,
  offset: 0,
};

function wrapper(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        {ui}
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("UploadHubPage", () => {
  beforeEach(() => {
    vi.spyOn(apiModule.api.upload, "list").mockResolvedValue(MOCK_UPLOADS);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rendert ohne Crash (Smoke)", () => {
    expect(() => wrapper(<UploadHubPage />)).not.toThrow();
  });

  it("zeigt Header-Text", () => {
    wrapper(<UploadHubPage />);
    expect(screen.getByText("MOAG — Upload-Hub")).toBeTruthy();
  });

  it("zeigt MultiDropZone", () => {
    wrapper(<UploadHubPage />);
    expect(screen.getByTestId("multi-drop-zone")).toBeTruthy();
  });

  it("zeigt alle 10 OperationCards", () => {
    wrapper(<UploadHubPage />);
    const expectedIds = [
      "ocr.standard", "ocr.shadow", "ocr.direct",
      "llm.text", "llm.vision", "llm.plan",
      "audio.transcribe",
      "dsgvo.redact", "pii.scan",
      "pdf.split",
    ];
    for (const id of expectedIds) {
      expect(
        screen.getByTestId(`operation-card-${id}`),
        `OperationCard für ${id} fehlt`,
      ).toBeTruthy();
    }
  });

  it("zeigt Cluster-Gruppen OCR, LLM-Analyse, Audio", () => {
    wrapper(<UploadHubPage />);
    expect(screen.getByTestId("cluster-ocr")).toBeTruthy();
    expect(screen.getByTestId("cluster-llm")).toBeTruthy();
    expect(screen.getByTestId("cluster-audio")).toBeTruthy();
  });

  it("zeigt Upload-Historie", () => {
    wrapper(<UploadHubPage />);
    expect(screen.getByTestId("upload-history")).toBeTruthy();
  });

  it("zeigt PageBadge", () => {
    wrapper(<UploadHubPage />);
    expect(screen.getByTestId("page-badge")).toBeTruthy();
  });
});
