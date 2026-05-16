import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PiiList } from "./PiiList";
import type { PiiFinding } from "../../lib/types";

const findings: PiiFinding[] = [
  {
    type: "PERSON",
    count: 2,
    examples: ["**** Mueller"],
    hits: [{ page: 1, bbox: [120, 80, 280, 105] }],
  },
  {
    type: "IBAN",
    count: 1,
    examples: ["DE** **** ****"],
    hits: [{ page: 3, bbox: [80, 400, 380, 420] }],
  },
  {
    // Ohne hits -> nicht klickbar
    type: "PHONE",
    count: 5,
    examples: ["+49 *** ***"],
  },
];

describe("PiiList", () => {
  it("zeigt Empty-State bei leerer Liste", () => {
    render(<PiiList findings={[]} />);
    expect(screen.getByTestId("pii-list-empty")).toBeInTheDocument();
  });

  it("rendert alle Findings mit Typ, Beispiel und Anzahl", () => {
    render(<PiiList findings={findings} />);
    expect(screen.getByTestId("pii-item-PERSON")).toBeInTheDocument();
    expect(screen.getByTestId("pii-item-IBAN")).toBeInTheDocument();
    expect(screen.getByTestId("pii-item-PHONE")).toBeInTheDocument();
    expect(screen.getByText("**** Mueller")).toBeInTheDocument();
    expect(screen.getByText("×2")).toBeInTheDocument();
    expect(screen.getByText("×5")).toBeInTheDocument();
  });

  it("ruft onNavigate(page, bbox) bei Click auf klickbares Item auf", () => {
    const onNavigate = vi.fn();
    render(<PiiList findings={findings} onNavigate={onNavigate} />);
    const item = screen.getByTestId("pii-item-PERSON");
    fireEvent.click(item);
    expect(onNavigate).toHaveBeenCalledWith(1, [120, 80, 280, 105]);
  });

  it("macht Items ohne hits nicht klickbar", () => {
    const onNavigate = vi.fn();
    render(<PiiList findings={findings} onNavigate={onNavigate} />);
    const phoneItem = screen.getByTestId("pii-item-PHONE");
    fireEvent.click(phoneItem);
    expect(onNavigate).not.toHaveBeenCalled();
    expect(phoneItem).not.toHaveAttribute("role", "button");
  });
});
