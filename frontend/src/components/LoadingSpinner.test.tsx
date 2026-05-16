import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LoadingSpinner } from "./LoadingSpinner";

describe("LoadingSpinner", () => {
  it("rendert mit role=status und Label", () => {
    render(<LoadingSpinner label="Lade..." />);
    const node = screen.getByTestId("loading-spinner");
    expect(node).toBeInTheDocument();
    expect(node).toHaveAttribute("role", "status");
    // Label ist sowohl sichtbar als auch in sr-only-Span — beide gelten
    expect(screen.getAllByText("Lade...").length).toBeGreaterThanOrEqual(1);
  });
});
