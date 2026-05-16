import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { PdfPreview, type PdfPreviewHandle } from "./PdfPreview";

describe("PdfPreview (mock-mode, ohne pdf.js)", () => {
  let originalGetContext: typeof HTMLCanvasElement.prototype.getContext | undefined;
  beforeEach(() => {
    // jsdom-Canvas-Stub
    originalGetContext = HTMLCanvasElement.prototype.getContext;
    // @ts-expect-error vi mock
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      fillText: vi.fn(),
      fillStyle: "",
      font: "",
    }));
  });
  afterEach(() => {
    if (originalGetContext) HTMLCanvasElement.prototype.getContext = originalGetContext;
  });

  it("zeigt Empty-State wenn url=null", () => {
    render(<PdfPreview url={null} />);
    expect(screen.getByTestId("pdf-empty")).toBeInTheDocument();
  });

  it("rendert Toolbar + Canvas im Mock-Modus", () => {
    render(<PdfPreview url="x" mock mockPageCount={3} />);
    expect(screen.getByTestId("pdf-canvas")).toBeInTheDocument();
    expect(screen.getByTestId("pdf-page-indicator").textContent).toContain("1 / 3");
  });

  it("Page-Navigation: Naechste/Vor schalten Seiten weiter", () => {
    render(<PdfPreview url="x" mock mockPageCount={3} />);
    const next = screen.getByTestId("pdf-next");
    fireEvent.click(next);
    expect(screen.getByTestId("pdf-page-indicator").textContent).toContain("2 / 3");
    fireEvent.click(next);
    expect(screen.getByTestId("pdf-page-indicator").textContent).toContain("3 / 3");
    // Beim letzten ist Naechste disabled
    expect(next).toBeDisabled();
    fireEvent.click(screen.getByTestId("pdf-prev"));
    expect(screen.getByTestId("pdf-page-indicator").textContent).toContain("2 / 3");
  });

  it("Zoom-In/Out/Reset funktionieren", () => {
    render(<PdfPreview url="x" mock mockPageCount={1} />);
    fireEvent.click(screen.getByTestId("pdf-zoom-in"));
    expect(screen.getByTestId("pdf-zoom-reset").textContent).toContain("125%");
    fireEvent.click(screen.getByTestId("pdf-zoom-out"));
    expect(screen.getByTestId("pdf-zoom-reset").textContent).toContain("100%");
    fireEvent.click(screen.getByTestId("pdf-zoom-out"));
    expect(screen.getByTestId("pdf-zoom-reset").textContent).toContain("75%");
    // Reset bringt zurueck auf 100%
    fireEvent.click(screen.getByTestId("pdf-zoom-reset"));
    expect(screen.getByTestId("pdf-zoom-reset").textContent).toContain("100%");
  });

  it("ruft onPageChange beim Wechsel", () => {
    const fn = vi.fn();
    render(<PdfPreview url="x" mock mockPageCount={2} onPageChange={fn} />);
    // erster Call beim Mount
    expect(fn).toHaveBeenCalledWith(1, 2);
    fireEvent.click(screen.getByTestId("pdf-next"));
    expect(fn).toHaveBeenLastCalledWith(2, 2);
  });

  it("goToPage via Ref springt zur Seite", () => {
    const ref = createRef<PdfPreviewHandle>();
    render(<PdfPreview ref={ref} url="x" mock mockPageCount={5} />);
    act(() => {
      ref.current?.goToPage(4);
    });
    expect(screen.getByTestId("pdf-page-indicator").textContent).toContain("4 / 5");
  });
});
