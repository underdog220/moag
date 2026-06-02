import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
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

  it("verwendet 'relative block w-full' wenn block=true gesetzt ist", () => {
    render(
      <Tooltip title="Block-Test" block>
        <div>Block-Inhalt</div>
      </Tooltip>
    );
    const wrapper = screen.getByText("Block-Inhalt").parentElement!;
    expect(wrapper.className).toContain("block");
    expect(wrapper.className).toContain("w-full");
    expect(wrapper.className).not.toContain("inline-block");
  });

  it("verwendet 'relative inline-block' wenn block nicht gesetzt ist (default)", () => {
    render(
      <Tooltip title="Inline-Test">
        <span>Inline-Inhalt</span>
      </Tooltip>
    );
    const wrapper = screen.getByText("Inline-Inhalt").parentElement!;
    expect(wrapper.className).toContain("inline-block");
    expect(wrapper.className).not.toContain("w-full");
  });

  describe("Long-Press (Mobile)", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("öffnet Tooltip nach 500ms Long-Press (onTouchStart → Timer abwarten)", () => {
      render(
        <Tooltip title="Mobile-Erklärung" source="/api/test">
          <button type="button">Touch-Ziel</button>
        </Tooltip>
      );
      const wrapper = screen.getByText("Touch-Ziel").closest("span")!;

      // Tooltip noch nicht sichtbar
      expect(screen.queryByTestId("tooltip-card")).not.toBeInTheDocument();

      // Touch starten
      fireEvent.touchStart(wrapper);

      // Nach 499ms: noch kein Tooltip
      act(() => { vi.advanceTimersByTime(499); });
      expect(screen.queryByTestId("tooltip-card")).not.toBeInTheDocument();

      // Nach 500ms (Gesamt): Tooltip muss erscheinen
      act(() => { vi.advanceTimersByTime(1); });
      expect(screen.getByTestId("tooltip-card")).toBeInTheDocument();
      expect(screen.getByTestId("tooltip-card").textContent).toContain("Mobile-Erklärung");
    });

    it("öffnet keinen Tooltip bei kurzem Tap (<500ms, onTouchEnd vor Timer)", () => {
      render(
        <Tooltip title="Kurzer Tap">
          <button type="button">Tap-Ziel</button>
        </Tooltip>
      );
      const wrapper = screen.getByText("Tap-Ziel").closest("span")!;

      fireEvent.touchStart(wrapper);
      // Sofort onTouchEnd (kurzer Tap — < 500ms)
      fireEvent.touchEnd(wrapper);

      // Timer voll abwarten — Tooltip darf nicht erscheinen
      act(() => { vi.advanceTimersByTime(600); });
      expect(screen.queryByTestId("tooltip-card")).not.toBeInTheDocument();
    });

    it("bricht Long-Press bei onTouchMove ab (Scroll-Geste)", () => {
      render(
        <Tooltip title="Scroll-Test">
          <button type="button">Scroll-Ziel</button>
        </Tooltip>
      );
      const wrapper = screen.getByText("Scroll-Ziel").closest("span")!;

      fireEvent.touchStart(wrapper);
      act(() => { vi.advanceTimersByTime(300); });
      // Finger bewegt sich (Scroll) → bricht Long-Press ab
      fireEvent.touchMove(wrapper);
      act(() => { vi.advanceTimersByTime(300); });
      // Kein Tooltip trotz 600ms Gesamt-Wartezeit
      expect(screen.queryByTestId("tooltip-card")).not.toBeInTheDocument();
    });
  });
});
