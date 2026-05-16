import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusDot } from "./StatusDot";

describe("StatusDot", () => {
  it("rendert mit data-status-Attribut", () => {
    render(<StatusDot status="ok" label="alles gut" />);
    const dot = screen.getByTestId("status-dot");
    expect(dot).toHaveAttribute("data-status", "ok");
    expect(dot).toHaveAttribute("aria-label", "alles gut");
  });
});
