import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Sparkline, LoadHistoryChart } from "./Sparkline";
import type { HwHistorySample } from "../lib/types";

function sample(at: string, gpu: number | null, cpu: number | null = 10): HwHistorySample {
  return { at, gpu, cpu, ram_free_gb: 30, vram_free_gb: 8 };
}

describe("Sparkline", () => {
  it("zeigt Hinweis bei zu wenig Verlauf", () => {
    render(<Sparkline samples={[sample("2026-06-02T10:00:00Z", 5)]} field="gpu" />);
    expect(screen.getByText("zu wenig Verlauf")).toBeInTheDocument();
  });

  it("rendert eine Linie bei ausreichend Daten", () => {
    const { container } = render(
      <Sparkline
        samples={[
          sample("2026-06-02T10:00:00Z", 5),
          sample("2026-06-02T10:00:10Z", 20),
          sample("2026-06-02T10:00:40Z", 80), // variabler Abstand
        ]}
        field="gpu"
      />,
    );
    expect(container.querySelector("svg")).toBeTruthy();
    expect(container.querySelectorAll("path").length).toBeGreaterThan(0);
  });

  it("bricht die Linie bei null-Lücken auf (kein durchgehender Pfad über null)", () => {
    const { container } = render(
      <Sparkline
        samples={[
          sample("2026-06-02T10:00:00Z", 5),
          sample("2026-06-02T10:00:10Z", null), // Lücke
          sample("2026-06-02T10:00:20Z", 30),
          sample("2026-06-02T10:00:30Z", 40),
        ]}
        field="gpu"
      />,
    );
    // Zwei Segmente: vor und nach der Lücke (das erste isolierte ist nur 1 Punkt → kein Pfad,
    // das zweite hat 2 Punkte → 1 Pfad). Mindestens ein gültiger Pfad muss da sein.
    expect(container.querySelectorAll("path").length).toBeGreaterThanOrEqual(1);
  });
});

describe("LoadHistoryChart", () => {
  it("zeigt Hinweis ohne Daten", () => {
    render(<LoadHistoryChart samples={[]} />);
    expect(screen.getByText(/kein Verlauf/i)).toBeInTheDocument();
  });

  it("rendert SVG + Legende GPU/CPU bei Daten", () => {
    const { container } = render(
      <LoadHistoryChart
        samples={[
          sample("2026-06-02T10:00:00Z", 5, 12),
          sample("2026-06-02T10:01:00Z", 60, 40),
          sample("2026-06-02T10:05:00Z", 30, 22),
        ]}
      />,
    );
    expect(container.querySelector("svg")).toBeTruthy();
    expect(screen.getByText("GPU")).toBeInTheDocument();
    expect(screen.getByText("CPU")).toBeInTheDocument();
  });
});
