import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { HubHealthDot, deriveHubStatus } from "./HubHealthDot";

describe("HubHealthDot", () => {
  it("rendert OK-Status fuer erreichbaren Hub mit niedriger Latenz", () => {
    render(<HubHealthDot reachable={true} latencyMs={4} />);
    const dot = screen.getByTestId("status-dot");
    expect(dot).toHaveAttribute("data-status", "ok");
  });

  it("rendert Warn-Status bei hoher Latenz", () => {
    render(<HubHealthDot reachable={true} latencyMs={650} />);
    const dot = screen.getByTestId("status-dot");
    expect(dot).toHaveAttribute("data-status", "warn");
  });

  it("rendert Error-Status fuer nicht erreichbaren Hub", () => {
    render(<HubHealthDot reachable={false} />);
    const dot = screen.getByTestId("status-dot");
    expect(dot).toHaveAttribute("data-status", "error");
  });

  it("rendert Neutral-Status wenn reachable=null (Pruefung ausstehend)", () => {
    render(<HubHealthDot reachable={null} />);
    const dot = screen.getByTestId("status-dot");
    expect(dot).toHaveAttribute("data-status", "neutral");
  });

  it("deriveHubStatus liefert sinnvolle Labels", () => {
    expect(deriveHubStatus(true, 3).label).toMatch(/Erreichbar/);
    expect(deriveHubStatus(false, null).kind).toBe("error");
    expect(deriveHubStatus(null, null).kind).toBe("neutral");
  });
});
