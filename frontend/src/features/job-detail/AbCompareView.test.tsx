import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AbCompareView } from "./AbCompareView";
import type { AbCompareResult } from "../../lib/types";

describe("AbCompareView", () => {
  it("zeigt Loading-Hint", () => {
    render(<AbCompareView data={undefined} loading />);
    expect(screen.getByTestId("ab-compare-loading")).toBeInTheDocument();
  });

  it("zeigt Error-Banner bei error-Prop", () => {
    render(<AbCompareView data={undefined} error="HTTP 500" />);
    expect(screen.getByTestId("ab-compare-error")).toBeInTheDocument();
    expect(screen.getByRole("alert").textContent).toContain("HTTP 500");
  });

  it("zeigt 'nicht verfuegbar' Hint wenn available=false", () => {
    render(
      <AbCompareView
        data={{ available: false, reason: "Job ohne --ab-compare gestartet" }}
      />,
    );
    expect(screen.getByTestId("ab-compare-unavailable")).toBeInTheDocument();
    expect(screen.getByText(/--ab-compare/)).toBeInTheDocument();
  });

  it("rendert Diff-Liste mit Linien-Klassen wenn diff vorhanden", () => {
    const data: AbCompareResult = {
      available: true,
      local: { text: "x", latency_ms: 4200, engines: ["tesseract"] },
      cluster: { text: "y", latency_ms: 1800, engines: ["tesseract", "easyocr"] },
      diff: [
        { type: "equal", text: "Foo" },
        { type: "local-only", text: "Bar" },
        { type: "cluster-only", text: "Baz" },
      ],
    };
    render(<AbCompareView data={data} />);
    expect(screen.getByTestId("ab-compare")).toBeInTheDocument();
    expect(screen.getByTestId("ab-compare-diff")).toBeInTheDocument();
    expect(screen.getByTestId("ab-compare-diff-line-equal").textContent).toContain("Foo");
    expect(screen.getByTestId("ab-compare-diff-line-local-only").textContent).toContain("Bar");
    expect(screen.getByTestId("ab-compare-diff-line-cluster-only").textContent).toContain("Baz");
    // Latenzen
    expect(screen.getByTestId("ab-compare-local-meta").textContent).toContain("4.20 s");
    expect(screen.getByTestId("ab-compare-cluster-meta").textContent).toContain("1.80 s");
  });

  it("zeigt Side-by-side Texte wenn kein diff", () => {
    const data: AbCompareResult = {
      available: true,
      local: { text: "Lokal-Text", latency_ms: 100, engines: ["t"] },
      cluster: { text: "Cluster-Text", latency_ms: 50, engines: ["t", "e"] },
    };
    render(<AbCompareView data={data} />);
    expect(screen.getByTestId("ab-compare-side-by-side")).toBeInTheDocument();
    expect(screen.getByTestId("ab-compare-local-text").textContent).toBe("Lokal-Text");
    expect(screen.getByTestId("ab-compare-cluster-text").textContent).toBe("Cluster-Text");
  });
});
