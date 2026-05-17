import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ActionCard } from "./ActionCard";
import * as apiModule from "../../lib/api";
import type { Action, ActionTriggerResponse } from "../../lib/types";

const MOCK_ACTION_DIAGNOSE: Action = {
  action_id: "oberon.smoke",
  system_id: "oberon",
  name: "DSGVO-Smoke ausführen",
  description: "Triggert den Oberon-Cockpit-Smoke.",
  category: "diagnose",
  sub_area: "smoke",
  requires_confirm: false,
  is_destructive: false,
  estimated_duration_s: 5,
  implemented: true,
};

const MOCK_ACTION_CONFIRM: Action = {
  action_id: "octoboss.bench.start",
  system_id: "octoboss",
  name: "Benchmark starten",
  description: "Startet einen Benchmark-Run.",
  category: "operation",
  sub_area: "bench",
  requires_confirm: true,
  is_destructive: false,
  estimated_duration_s: 30,
  implemented: true,
};

const MOCK_ACTION_DESTRUCTIVE: Action = {
  action_id: "octoboss.node.reboot",
  system_id: "octoboss",
  name: "Node neu starten",
  description: "Startet eine Node neu.",
  category: "operation",
  sub_area: "node",
  requires_confirm: true,
  is_destructive: true,
  estimated_duration_s: 60,
  implemented: true,
};

const MOCK_ACTION_NOT_IMPLEMENTED: Action = {
  action_id: "custos.rules.run",
  system_id: "custos",
  name: "Rule-Engine ausführen",
  description: "Führt alle Regeln aus.",
  category: "operation",
  sub_area: "rules",
  requires_confirm: true,
  is_destructive: false,
  estimated_duration_s: 15,
  implemented: false,
};

const MOCK_TRIGGER_RESPONSE: ActionTriggerResponse = {
  action_id: "oberon.smoke",
  triggered_at: "2026-05-17T08:00:00Z",
  status: "completed",
  result_summary: "Alle 6 Sub-Checks bestanden.",
  payload: {},
  duration_ms: 1234,
  error: null,
};

function wrapper({ children }: { children: React.ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

describe("ActionCard", () => {
  beforeEach(() => {
    vi.spyOn(apiModule.api, "triggerAction").mockResolvedValue(MOCK_TRIGGER_RESPONSE);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rendert Name und Beschreibung", () => {
    render(<ActionCard action={MOCK_ACTION_DIAGNOSE} />, { wrapper });
    expect(screen.getByText("DSGVO-Smoke ausführen")).toBeInTheDocument();
    expect(screen.getByText("Triggert den Oberon-Cockpit-Smoke.")).toBeInTheDocument();
  });

  it("zeigt Kategorie-Badge", () => {
    render(<ActionCard action={MOCK_ACTION_DIAGNOSE} />, { wrapper });
    expect(screen.getByText("Diagnose")).toBeInTheDocument();
  });

  it("zeigt Sub-Area-Badge wenn vorhanden", () => {
    render(<ActionCard action={MOCK_ACTION_DIAGNOSE} />, { wrapper });
    expect(screen.getByText("smoke")).toBeInTheDocument();
  });

  it("Start-Button ist aktiv wenn implemented=true", () => {
    render(<ActionCard action={MOCK_ACTION_DIAGNOSE} />, { wrapper });
    const btn = screen.getByTestId("action-btn-oberon.smoke");
    expect(btn).not.toBeDisabled();
  });

  it("Start-Button ist disabled wenn implemented=false", () => {
    render(<ActionCard action={MOCK_ACTION_NOT_IMPLEMENTED} />, { wrapper });
    const btn = screen.getByTestId("action-btn-custos.rules.run");
    expect(btn).toBeDisabled();
  });

  it("zeigt Phase-X-Hinweis wenn nicht implementiert", () => {
    render(<ActionCard action={MOCK_ACTION_NOT_IMPLEMENTED} />, { wrapper });
    expect(screen.getByText(/Phase X — noch nicht implementiert/)).toBeInTheDocument();
  });

  it("führt direkt triggerAction aus wenn requires_confirm=false", async () => {
    render(<ActionCard action={MOCK_ACTION_DIAGNOSE} />, { wrapper });
    fireEvent.click(screen.getByTestId("action-btn-oberon.smoke"));
    await waitFor(() => {
      expect(apiModule.api.triggerAction).toHaveBeenCalledWith("oberon.smoke");
    });
  });

  it("öffnet ConfirmDialog wenn requires_confirm=true", () => {
    render(<ActionCard action={MOCK_ACTION_CONFIRM} />, { wrapper });
    fireEvent.click(screen.getByTestId("action-btn-octoboss.bench.start"));
    expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
  });

  it("trigger nach Bestätigung im ConfirmDialog", async () => {
    render(<ActionCard action={MOCK_ACTION_CONFIRM} />, { wrapper });
    fireEvent.click(screen.getByTestId("action-btn-octoboss.bench.start"));
    fireEvent.click(screen.getByTestId("confirm-dialog-confirm"));
    await waitFor(() => {
      expect(apiModule.api.triggerAction).toHaveBeenCalledWith("octoboss.bench.start");
    });
  });

  it("zeigt Ergebnis nach Trigger", async () => {
    render(<ActionCard action={MOCK_ACTION_DIAGNOSE} />, { wrapper });
    fireEvent.click(screen.getByTestId("action-btn-oberon.smoke"));
    await waitFor(() => {
      expect(screen.getByTestId("action-result-oberon.smoke")).toBeInTheDocument();
      expect(screen.getByText("Alle 6 Sub-Checks bestanden.")).toBeInTheDocument();
    });
  });

  it("zeigt destruktiven Akzent bei is_destructive=true", () => {
    render(<ActionCard action={MOCK_ACTION_DESTRUCTIVE} />, { wrapper });
    const card = screen.getByTestId("action-card-octoboss.node.reboot");
    // Karte hat error-styling
    expect(card.className).toContain("border-status-error");
  });

  it("ruft onResult-Callback auf nach Trigger", async () => {
    const onResult = vi.fn();
    render(<ActionCard action={MOCK_ACTION_DIAGNOSE} onResult={onResult} />, { wrapper });
    fireEvent.click(screen.getByTestId("action-btn-oberon.smoke"));
    await waitFor(() => {
      expect(onResult).toHaveBeenCalledWith(MOCK_TRIGGER_RESPONSE);
    });
  });
});
