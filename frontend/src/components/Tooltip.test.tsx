import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Tooltip } from "./Tooltip";

describe("Tooltip", () => {
  it("rendert Kinder ohne Tooltip bei Start", () => {
    render(
      <Tooltip title="Erklärung" source="/api/test">
        <span>Inhalt</span>
      </Tooltip>
    );
    expect(screen.getByText("Inhalt")).toBeInTheDocument();
    expect(screen.queryByTestId("tooltip-card")).not.toBeInTheDocument();
  });

  it("zeigt Tooltip-Card bei Hover", () => {
    render(
      <Tooltip title="Score-Erklärung" source="/api/v1/health" updatedAt="vor 3s" thresholds="≥70 OK">
        <span>42%</span>
      </Tooltip>
    );
    const wrapper = screen.getByText("42%").parentElement!;
    fireEvent.mouseEnter(wrapper);
    const card = screen.getByTestId("tooltip-card");
    expect(card).toBeInTheDocument();
    expect(card.textContent).toContain("Score-Erklärung");
    expect(card.textContent).toContain("/api/v1/health");
    expect(card.textContent).toContain("vor 3s");
    expect(card.textContent).toContain("≥70 OK");
  });

  it("versteckt Tooltip-Card nach MouseLeave", () => {
    render(
      <Tooltip title="Test">
        <span>X</span>
      </Tooltip>
    );
    const wrapper = screen.getByText("X").parentElement!;
    fireEvent.mouseEnter(wrapper);
    expect(screen.getByTestId("tooltip-card")).toBeInTheDocument();
    fireEvent.mouseLeave(wrapper);
    expect(screen.queryByTestId("tooltip-card")).not.toBeInTheDocument();
  });
});
