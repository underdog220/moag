import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConfidenceHeatmap } from "./ConfidenceHeatmap";
import type { RecognizedTextPage } from "../../lib/types";

const page: RecognizedTextPage = {
  page: 1,
  width: 595,
  height: 842,
  words: [
    { text: "Rechnung", confidence: 0.98, bbox: [50, 50, 180, 80] },
    { text: "schlecht", confidence: 0.42, bbox: [200, 50, 320, 80] },
  ],
};

describe("ConfidenceHeatmap", () => {
  // jsdom liefert standardmaessig keinen 2D-Context — wir mocken minimal.
  const ctxStub = {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
  };
  let originalGetContext: typeof HTMLCanvasElement.prototype.getContext | undefined;

  beforeEach(() => {
    originalGetContext = HTMLCanvasElement.prototype.getContext;
    // @ts-expect-error vi-mock: returntype kompatibel weil wir nur die genutzten Felder bedienen
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ctxStub);
    ctxStub.clearRect.mockClear();
    ctxStub.fillRect.mockClear();
    ctxStub.strokeRect.mockClear();
  });
  afterEach(() => {
    if (originalGetContext) {
      HTMLCanvasElement.prototype.getContext = originalGetContext;
    }
  });

  it("rendert nichts, wenn visible=false", () => {
    render(<ConfidenceHeatmap page={page} scale={1} width={100} height={100} visible={false} />);
    expect(screen.queryByTestId("confidence-heatmap")).not.toBeInTheDocument();
  });

  it("rendert Canvas mit korrekter Groesse, wenn visible=true", () => {
    render(<ConfidenceHeatmap page={page} scale={1} width={300} height={400} visible />);
    const wrap = screen.getByTestId("confidence-heatmap");
    expect(wrap).toBeInTheDocument();
    const canvas = screen.getByTestId("confidence-heatmap-canvas") as HTMLCanvasElement;
    expect(canvas.width).toBe(300);
    expect(canvas.height).toBe(400);
    // Rechtecke wurden gezeichnet (2 Worte mit bbox -> 2 fillRects + 2 strokeRects)
    expect(ctxStub.fillRect).toHaveBeenCalledTimes(2);
    expect(ctxStub.strokeRect).toHaveBeenCalledTimes(2);
  });

  it("zeigt Native-Hint wenn isNative=true und unterdrueckt das Zeichnen", () => {
    render(
      <ConfidenceHeatmap page={page} scale={1} width={300} height={400} visible isNative />,
    );
    expect(screen.getByTestId("confidence-heatmap-native-hint")).toBeInTheDocument();
    // Bei native werden KEINE Rechtecke gezeichnet
    expect(ctxStub.fillRect).not.toHaveBeenCalled();
  });

  it("verarbeitet leere Word-Liste ohne Crash", () => {
    render(
      <ConfidenceHeatmap
        page={{ page: 1, words: [] }}
        scale={1}
        width={100}
        height={100}
        visible
      />,
    );
    expect(screen.getByTestId("confidence-heatmap")).toBeInTheDocument();
    expect(ctxStub.fillRect).not.toHaveBeenCalled();
  });
});
