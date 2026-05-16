import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorBoundary } from "./ErrorBoundary";

function Boom(): JSX.Element {
  throw new Error("kaputt");
}

describe("ErrorBoundary", () => {
  it("zeigt Fallback bei Fehler", () => {
    // console.error unterdruecken (React rauscht stark)
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByTestId("error-boundary")).toBeInTheDocument();
    expect(screen.getByText(/Etwas ist schiefgelaufen/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /neu laden/i })).toBeInTheDocument();
    errSpy.mockRestore();
  });

  it("rendert Children im Normalfall", () => {
    render(
      <ErrorBoundary>
        <p>alles gut</p>
      </ErrorBoundary>
    );
    expect(screen.getByText("alles gut")).toBeInTheDocument();
  });
});
