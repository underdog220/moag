import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { EngineConsensusHeatmap } from "./EngineConsensusHeatmap";

describe("EngineConsensusHeatmap", () => {
  it("zeigt Empty-State wenn keine Daten vorhanden", () => {
    render(<EngineConsensusHeatmap data={undefined} />);
    expect(screen.getByTestId("engine-consensus-empty")).toBeInTheDocument();
  });

  it("rendert Tabelle mit allen Engines x Seiten", () => {
    render(
      <EngineConsensusHeatmap
        data={[
          { page: 1, tesseract: 0.94, easyocr: 0.97 },
          { page: 2, tesseract: 0.92, easyocr: 0.96 },
        ]}
      />,
    );
    expect(screen.getByTestId("engine-consensus-heatmap")).toBeInTheDocument();
    expect(screen.getByTestId("engine-row-tesseract")).toBeInTheDocument();
    expect(screen.getByTestId("engine-row-easyocr")).toBeInTheDocument();
    expect(screen.getByTestId("heatmap-cell-tesseract-1").textContent).toBe("94");
    expect(screen.getByTestId("heatmap-cell-easyocr-2").textContent).toBe("96");
  });

  it("respektiert engines-Prop fuer Reihenfolge / Filter", () => {
    render(
      <EngineConsensusHeatmap
        data={[{ page: 1, tesseract: 0.9, easyocr: 0.8, paddleocr: 0.7 }]}
        engines={["paddleocr", "tesseract"]}
      />,
    );
    expect(screen.getByTestId("engine-row-paddleocr")).toBeInTheDocument();
    expect(screen.getByTestId("engine-row-tesseract")).toBeInTheDocument();
    expect(screen.queryByTestId("engine-row-easyocr")).not.toBeInTheDocument();
  });

  it("zeigt Mdash bei fehlenden Werten", () => {
    render(
      <EngineConsensusHeatmap
        data={[{ page: 1, tesseract: 0.9 }, { page: 2, tesseract: 0.8 }]}
        engines={["tesseract", "missing-engine"]}
      />,
    );
    const row = screen.getByTestId("engine-row-missing-engine");
    expect(row.textContent).toContain("—");
  });
});
