import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("rendert Titel und Beschreibung", () => {
    render(<EmptyState title="Nichts da" description="Beschreibung X" />);
    expect(screen.getByText("Nichts da")).toBeInTheDocument();
    expect(screen.getByText("Beschreibung X")).toBeInTheDocument();
  });
});
