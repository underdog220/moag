import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RoutingTrace } from "./RoutingTrace";
import type { RoutingTraceEntry } from "../../lib/types";

const trace: RoutingTraceEntry[] = [
  { page: 1, engine: "tesseract", node: "Ryzenstrike", latency_ms: 280, confidence: 0.94 },
  { page: 1, engine: "easyocr", node: "WorkRyzen", latency_ms: 1100, confidence: 0.97 },
  { page: 2, engine: "tesseract", node: "Ryzenstrike", latency_ms: 320, confidence: 0.92 },
];

describe("RoutingTrace", () => {
  it("zeigt Empty-State wenn kein Trace", () => {
    render(<RoutingTrace doctype={null} trace={undefined} />);
    expect(screen.getByTestId("routing-trace-empty")).toBeInTheDocument();
  });

  it("gruppiert Engines pro Seite", () => {
    render(<RoutingTrace doctype="Rechnung" trace={trace} />);
    expect(screen.getByTestId("routing-trace")).toBeInTheDocument();
    expect(screen.getByTestId("routing-trace-page-1")).toBeInTheDocument();
    expect(screen.getByTestId("routing-trace-page-2")).toBeInTheDocument();
    // Doctype-Label sichtbar
    expect(screen.getByText("Rechnung")).toBeInTheDocument();
  });

  it("rendert Engine + Node + Latenz + Konfidenz pro Eintrag", () => {
    render(<RoutingTrace doctype="Rechnung" trace={trace} />);
    const page1 = screen.getByTestId("routing-trace-page-1");
    expect(page1.textContent).toContain("tesseract");
    expect(page1.textContent).toContain("Ryzenstrike");
    expect(page1.textContent).toContain("easyocr");
    expect(page1.textContent).toContain("WorkRyzen");
    expect(page1.textContent).toContain("94.0 %");
    expect(page1.textContent).toContain("280 ms");
  });

  it("sortiert Seiten aufsteigend", () => {
    render(
      <RoutingTrace
        doctype="X"
        trace={[
          { page: 5, engine: "a", node: "n", latency_ms: 1, confidence: 0.9 },
          { page: 1, engine: "b", node: "n", latency_ms: 1, confidence: 0.9 },
          { page: 3, engine: "c", node: "n", latency_ms: 1, confidence: 0.9 },
        ]}
      />,
    );
    const list = screen.getByTestId("routing-trace").querySelectorAll("[data-testid^='routing-trace-page-']");
    expect(list[0].getAttribute("data-testid")).toBe("routing-trace-page-1");
    expect(list[1].getAttribute("data-testid")).toBe("routing-trace-page-3");
    expect(list[2].getAttribute("data-testid")).toBe("routing-trace-page-5");
  });
});
