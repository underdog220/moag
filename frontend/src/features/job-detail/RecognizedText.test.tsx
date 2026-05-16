import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { RecognizedText } from "./RecognizedText";
import type { RecognizedTextDocument } from "../../lib/types";

const doc: RecognizedTextDocument = {
  job_id: "ocr-test",
  is_native: false,
  pages: [
    {
      page: 1,
      width: 595,
      height: 842,
      words: [
        { text: "Rechnung", confidence: 0.98, bbox: [50, 50, 180, 80] },
        { text: "schlecht", confidence: 0.42, bbox: [200, 50, 320, 80] },
        { text: "mittel", confidence: 0.62, bbox: [330, 50, 420, 80] },
      ],
    },
    {
      page: 2,
      words: [{ text: "Page2-only", confidence: 0.9 }],
    },
  ],
};

describe("RecognizedText", () => {
  it("zeigt Loading-Empty wenn doc undefined", () => {
    render(<RecognizedText doc={undefined} />);
    expect(screen.getByTestId("recognized-text-empty")).toBeInTheDocument();
  });

  it("rendert alle Seiten und Faerbung pro Confidence-Stufe", () => {
    render(<RecognizedText doc={doc} />);
    expect(screen.getByTestId("recognized-page-1")).toBeInTheDocument();
    expect(screen.getByTestId("recognized-page-2")).toBeInTheDocument();
    // niedriger als 0.5 = rot, niedriger 0.7 = gelb, sonst Standard
    const wordRot = screen.getByTestId("recognized-word-1-1");
    const wordGelb = screen.getByTestId("recognized-word-1-2");
    expect(wordRot.className).toContain("status-error");
    expect(wordGelb.className).toContain("status-warn");
    expect(wordRot.getAttribute("data-confidence")).toBe("0.42");
  });

  it("filtert auf eine Seite, wenn page-Prop gesetzt", () => {
    render(<RecognizedText doc={doc} page={2} />);
    expect(screen.queryByTestId("recognized-page-1")).not.toBeInTheDocument();
    expect(screen.getByTestId("recognized-page-2")).toBeInTheDocument();
  });

  it("ruft onWordClick mit Page + bbox auf", () => {
    const fn = vi.fn();
    render(<RecognizedText doc={doc} onWordClick={fn} />);
    fireEvent.click(screen.getByTestId("recognized-word-1-0"));
    expect(fn).toHaveBeenCalledWith(1, [50, 50, 180, 80]);
  });

  it("zeigt Native-Hint wenn is_native=true", () => {
    render(
      <RecognizedText
        doc={{ job_id: "x", is_native: true, pages: [{ page: 1, words: [] }] }}
      />,
    );
    expect(screen.getByTestId("native-pdf-hint")).toBeInTheDocument();
  });
});
