// Toggle-Smoke-Test.

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Toggle } from "./Toggle";

describe("Toggle", () => {
  it("rendert mit Label und korrektem aria-checked", () => {
    render(<Toggle checked={true} onChange={() => {}} label="Demo" testId="t1" />);
    const sw = screen.getByTestId("t1");
    expect(sw).toHaveAttribute("role", "switch");
    expect(sw).toHaveAttribute("aria-checked", "true");
    expect(sw).toHaveAttribute("aria-label", "Demo");
  });

  it("ruft onChange mit invertiertem Wert beim Klick", () => {
    const cb = vi.fn();
    render(<Toggle checked={false} onChange={cb} label="x" testId="t2" />);
    fireEvent.click(screen.getByTestId("t2"));
    expect(cb).toHaveBeenCalledWith(true);
  });
});
