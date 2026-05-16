import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Breadcrumb } from "./Breadcrumb";

describe("Breadcrumb", () => {
  it("rendert nichts auf Root-Pfad", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Breadcrumb />
      </MemoryRouter>
    );
    expect(screen.queryByTestId("breadcrumb")).not.toBeInTheDocument();
  });

  it("zeigt MOAG + Segment auf einer Unterseite", () => {
    render(
      <MemoryRouter initialEntries={["/oberon"]}>
        <Breadcrumb />
      </MemoryRouter>
    );
    const nav = screen.getByTestId("breadcrumb");
    expect(nav).toBeInTheDocument();
    expect(nav.textContent).toContain("MOAG");
    expect(nav.textContent).toContain("Oberon");
  });

  it("zeigt tiefen Pfad korrekt", () => {
    render(
      <MemoryRouter initialEntries={["/oberon/llm"]}>
        <Breadcrumb />
      </MemoryRouter>
    );
    const nav = screen.getByTestId("breadcrumb");
    expect(nav.textContent).toContain("MOAG");
    expect(nav.textContent).toContain("Oberon");
    expect(nav.textContent).toContain("LLM");
  });
});
