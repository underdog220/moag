import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageBadge } from "./PageBadge";

describe("PageBadge", () => {
  it("rendert die Page-ID + Build-Hash", () => {
    render(<PageBadge id="gui.dashboard" />);
    const badge = screen.getByTestId("page-badge");
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).toContain("pg:");
    expect(badge.textContent).toContain("gui.dashboard");
  });
});
