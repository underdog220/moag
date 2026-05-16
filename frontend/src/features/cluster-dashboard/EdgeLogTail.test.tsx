import { describe, expect, it, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EdgeLogTail } from "./EdgeLogTail";

beforeEach(() => {
  Object.defineProperty(window, "location", {
    value: new URL("http://localhost:5173/dashboard?mock=true"),
    writable: true,
  });
});

function renderWithProviders(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchInterval: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("EdgeLogTail", () => {
  it("rendert die Mock-Events mit Level + Source + Message", async () => {
    renderWithProviders(<EdgeLogTail refetchIntervalMs={60_000} />);
    await waitFor(() =>
      expect(screen.getByTestId("edge-log-tail")).toBeInTheDocument()
    );
    // Im Mock sind 5 Events
    expect(screen.getByTestId("edge-log-line-0")).toBeInTheDocument();
    expect(screen.getByTestId("edge-log-line-4")).toBeInTheDocument();
    // Level-Marker
    expect(screen.getByTestId("edge-log-line-4")).toHaveAttribute("data-level", "WARN");
    // Inhalt
    expect(screen.getByText(/heartbeat from WorkRyzen ok/)).toBeInTheDocument();
  });

  it("Kopieren-Button schreibt Klartext in Zwischenablage und zeigt Toast", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    renderWithProviders(<EdgeLogTail refetchIntervalMs={60_000} />);
    await waitFor(() =>
      expect(screen.getByTestId("edge-log-copy")).toBeInTheDocument()
    );
    fireEvent.click(screen.getByTestId("edge-log-copy"));

    await waitFor(() =>
      expect(screen.getByTestId("edge-log-toast")).toHaveTextContent("Kopiert")
    );
    expect(writeText).toHaveBeenCalledTimes(1);
    const arg = writeText.mock.calls[0][0] as string;
    // Klartext-Format: enthaelt Level + Source + Message ohne HTML
    expect(arg).toContain("INFO ");
    expect(arg).toContain("hub");
    expect(arg).toContain("heartbeat from WorkRyzen ok");
    // Klartext (kein HTML-Markup): keine spitzen Klammern aus Tags.
    // (Inhaltliche `<` wie in Lib-Versionswarnungen sind ok.)
    expect(arg).not.toMatch(/<\/?(span|div|button|table|td|tr|p|ul|li)/i);
  });

  it("Auto-Scroll-Toggle wechselt von checked zu unchecked", async () => {
    renderWithProviders(<EdgeLogTail refetchIntervalMs={60_000} />);
    await waitFor(() =>
      expect(screen.getByTestId("edge-log-autoscroll-toggle")).toBeInTheDocument()
    );
    const cb = screen.getByTestId("edge-log-autoscroll-toggle") as HTMLInputElement;
    expect(cb.checked).toBe(true);
    fireEvent.click(cb);
    expect(cb.checked).toBe(false);
  });

  it("Empty-State wenn keine Events vom Server kommen", async () => {
    // Trick: wir umgehen den Mock-Loader nicht — also nutzen wir einen frischen
    // Loader-Fall: Custom-Render ohne mock. Wir mocken hier einfach getEdgeLog.
    const apiModule = await import("../../lib/api");
    const original = apiModule.api.getEdgeLog;
    apiModule.api.getEdgeLog = vi.fn().mockResolvedValue({ events: [] });

    try {
      renderWithProviders(<EdgeLogTail refetchIntervalMs={60_000} />);
      await waitFor(() =>
        expect(screen.getByText("Noch keine Events")).toBeInTheDocument()
      );
    } finally {
      apiModule.api.getEdgeLog = original;
    }
  });
});
