import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DoctypeBadge } from "./DoctypeBadge";

describe("DoctypeBadge", () => {
  it("zeigt Empty-State wenn kein Doctype klassifiziert", () => {
    render(<DoctypeBadge doctype={null} confidence={null} />);
    expect(screen.getByTestId("doctype-badge-empty")).toBeInTheDocument();
  });

  it("rendert Doctype-Label, Konfidenz und Two-Stage-Bars", () => {
    render(
      <DoctypeBadge
        doctype="Rechnung"
        confidence={0.94}
        textScore={0.97}
        layoutScore={0.86}
      />,
    );
    expect(screen.getByTestId("doctype-badge")).toBeInTheDocument();
    expect(screen.getByText("Rechnung")).toBeInTheDocument();
    expect(screen.getByText("94.0 %")).toBeInTheDocument();
    expect(screen.getByTestId("doctype-bar-text")).toBeInTheDocument();
    expect(screen.getByTestId("doctype-bar-layout")).toBeInTheDocument();
    // Bar-Breite spiegelt Score
    expect(screen.getByTestId("doctype-bar-text").getAttribute("style")).toContain("97%");
    expect(screen.getByTestId("doctype-bar-layout").getAttribute("style")).toContain("86%");
  });

  it("zeigt Tooltip mit Top-3-Alternativen on hover", () => {
    render(
      <DoctypeBadge
        doctype="Rechnung"
        confidence={0.94}
        alternatives={[
          { label: "Mahnung", score: 0.04 },
          { label: "Lieferschein", score: 0.02 },
          { label: "Sonstiges", score: 0.01 },
          { label: "Nicht-relevant", score: 0.005 },
        ]}
      />,
    );
    const trigger = screen.getByText("Konfidenz").parentElement!;
    fireEvent.mouseEnter(trigger);
    const tooltip = screen.getByTestId("doctype-alternatives-tooltip");
    expect(tooltip).toBeInTheDocument();
    expect(tooltip.textContent).toContain("Mahnung");
    expect(tooltip.textContent).toContain("Lieferschein");
    expect(tooltip.textContent).toContain("Sonstiges");
    // Top-3 abgeschnitten
    expect(tooltip.textContent).not.toContain("Nicht-relevant");
  });
});
