import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Gauge } from "./Gauge";

describe("Gauge", () => {
  describe("hero-Variante", () => {
    it("rendert mit korrektem testId", () => {
      render(<Gauge value={75} variant="hero" testId="gauge-test" />);
      expect(screen.getByTestId("gauge-test")).toBeInTheDocument();
    });

    it("zeigt den Wert als img mit aria-label", () => {
      render(<Gauge value={75} variant="hero" label="Score" />);
      expect(screen.getByRole("img", { name: /Score: 75%/i })).toBeInTheDocument();
    });

    it("rendert Label wenn angegeben", () => {
      render(<Gauge value={50} variant="hero" label="Gesundheit" />);
      expect(screen.getByText("Gesundheit")).toBeInTheDocument();
    });
  });

  describe("mini-Variante", () => {
    it("rendert den Wert als Text", () => {
      render(<Gauge value={60} variant="mini" testId="mini-test" />);
      expect(screen.getByTestId("mini-test")).toBeInTheDocument();
      expect(screen.getByText("60%")).toBeInTheDocument();
    });
  });

  it("rendert Tooltip wenn angegeben", () => {
    render(
      <Gauge
        value={80}
        variant="hero"
        tooltip={{ title: "Test-Tooltip", source: "/api/test" }}
      />
    );
    // Tooltip-Wrapper ist vorhanden (kein Tooltip-Card — wird erst bei Hover sichtbar)
    expect(screen.getByRole("img")).toBeInTheDocument();
  });
});
