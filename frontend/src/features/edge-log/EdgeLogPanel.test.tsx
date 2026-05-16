// Tests fuer EdgeLogPanel — Filter, Clipboard-Copy, Empty-State.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { EdgeLogPanel } from "./EdgeLogPanel";
import type { EdgeLogEvent } from "../../lib/types";
import { _getToastsForTest, clearAllToasts } from "../../lib/toast";

beforeEach(() => {
  clearAllToasts();
  // Mock-Modus aktivieren, damit useWebSocket nicht echte Socket-Verbindung versucht
  Object.defineProperty(window, "location", {
    value: new URL("http://localhost:5173/?mock=true"),
    writable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const SAMPLE: EdgeLogEvent[] = [
  { ts: "2026-05-06T10:30:00Z", level: "INFO", source: "hub", message: "tick 1" },
  { ts: "2026-05-06T10:30:05Z", level: "WARN", source: "engine/easyocr", message: "deprecation" },
  { ts: "2026-05-06T10:30:10Z", level: "ERROR", source: "ocr/run", message: "boom" },
];

describe("EdgeLogPanel", () => {
  it("rendert seedEvents in Zeilen", () => {
    render(<EdgeLogPanel seedEvents={SAMPLE} />);
    const rows = screen.getAllByTestId("edge-log-row");
    expect(rows.length).toBe(3);
    expect(screen.getByText("tick 1")).toBeInTheDocument();
    expect(screen.getByText("deprecation")).toBeInTheDocument();
    expect(screen.getByText("boom")).toBeInTheDocument();
  });

  it("filtert nach Level", () => {
    render(<EdgeLogPanel seedEvents={SAMPLE} />);
    fireEvent.click(screen.getByTestId("edge-filter-WARN"));
    const rows = screen.getAllByTestId("edge-log-row");
    expect(rows.length).toBe(1);
    expect(rows[0].getAttribute("data-level")).toBe("WARN");
  });

  it("kopiert gefilterte Eintraege via copyImpl in die Zwischenablage und zeigt Erfolg-Toast", async () => {
    const copy = vi.fn().mockResolvedValue(undefined);
    render(<EdgeLogPanel seedEvents={SAMPLE} copyImpl={copy} />);

    fireEvent.click(screen.getByTestId("edge-copy"));

    await Promise.resolve();
    await Promise.resolve();

    expect(copy).toHaveBeenCalledTimes(1);
    const text = copy.mock.calls[0][0] as string;
    expect(text).toContain("tick 1");
    expect(text).toContain("deprecation");
    expect(text).toContain("boom");

    const toasts = _getToastsForTest();
    expect(toasts.some((t) => t.kind === "success" && t.message.includes("kopiert"))).toBe(true);
  });

  it("zeigt 'Keine Events' bei leerem Log", () => {
    render(<EdgeLogPanel seedEvents={[]} />);
    expect(screen.getByText("Keine Events.")).toBeInTheDocument();
  });
});
