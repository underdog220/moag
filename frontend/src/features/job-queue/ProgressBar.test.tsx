// Tests fuer ProgressBar — Bar-Width, Native-PDF-Hint, Engine-Sub-Steps.

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProgressBar } from "./ProgressBar";

describe("ProgressBar", () => {
  it("clampt pct-Werte zwischen 0 und 100", () => {
    const { rerender } = render(<ProgressBar pct={150} />);
    let fill = screen.getByTestId("progress-bar-fill") as HTMLElement;
    expect(fill.style.width).toBe("100%");

    rerender(<ProgressBar pct={-10} />);
    fill = screen.getByTestId("progress-bar-fill") as HTMLElement;
    expect(fill.style.width).toBe("0%");
  });

  it("zeigt Seite X/Y wenn pageTotal gesetzt ist, sonst Prozent", () => {
    const { rerender, container } = render(
      <ProgressBar pct={40} pageDone={2} pageTotal={5} />,
    );
    expect(container.textContent).toContain("Seite 2/5");

    rerender(<ProgressBar pct={40} />);
    expect(container.textContent).toContain("40 %");
  });

  it("zeigt Native-PDF-Hint statt Engine-Liste", () => {
    render(
      <ProgressBar
        pct={50}
        nativeTextLayer
        engineStatus={[{ engine: "tesseract", status: "done" }]}
      />,
    );
    expect(screen.getByTestId("native-pdf-hint")).toBeInTheDocument();
    expect(screen.queryByTestId("engine-status")).not.toBeInTheDocument();
  });

  it("rendert Engine-Sub-Steps wenn engineStatus gesetzt ist", () => {
    render(
      <ProgressBar
        pct={50}
        engineStatus={[
          { engine: "tesseract", status: "done", confidence: 0.91 },
          { engine: "easyocr", status: "running" },
        ]}
      />,
    );
    const status = screen.getByTestId("engine-status");
    expect(status.textContent).toContain("tesseract");
    expect(status.textContent).toContain("easyocr");
  });
});
