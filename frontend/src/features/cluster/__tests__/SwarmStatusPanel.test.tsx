// Tests fuer SwarmStatusPanel — Modul H3.
// Wir testen:
//   - Rendering "Mein Hub"-Box mit Mock-Daten
//   - Peers-Tabelle mit Sortierung (primary > replica > standalone)
//   - Master-Box mit last_election
//   - Election-Trigger-Button: ohne Token deaktiviert,
//     mit Token Confirm-Dialog -> Mutation -> Feedback
//   - Cooldown blockiert den Button
//   - Loading-State
//   - Error-State

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { SwarmStatusPanel } from "../SwarmStatusPanel";
import type {
  ClusterPeer,
  ClusterStatus,
  ElectionTriggerResponse,
  Settings,
} from "../../../lib/types";
import * as apiModule from "../../../lib/api";

// ── Helpers ────────────────────────────────────────────────────────────────

function renderWithProviders(ui: ReactNode) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchInterval: false },
    },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const STATUS_PRIMARY: ClusterStatus = {
  instance_id: "vdr-uuid-001",
  hostname: "vdr-server",
  mode: "primary",
  epoch: 7,
  priority: 20,
  primary_id: "vdr-uuid-001",
  primary_address: "192.168.200.71:18765",
  node_count: 3,
  compute_score: 320,
  operator_priority: 20,
  uptime_seconds: 12345,
  version: "0.9.0",
  site_id: "ts-home",
  last_election: {
    timestamp: "2026-05-08T07:32:00Z",
    winner_id: "vdr-uuid-001",
    reason: "cold-start",
    cooldown_remaining_s: 0,
  },
};

const PEERS: ClusterPeer[] = [
  {
    instance_id: "nas-uuid-002",
    hostname: "octoboss-nas",
    address: "192.168.200.169",
    port: 8765,
    url: "http://192.168.200.169:8765",
    mode: "replica",
    epoch: 7,
    last_beacon: "2026-05-08T12:01:00Z",
    online: true,
  },
  {
    instance_id: "vdr-uuid-001",
    hostname: "vdr-server",
    address: "192.168.200.71",
    port: 18765,
    url: "http://192.168.200.71:18765",
    mode: "primary",
    epoch: 7,
    last_beacon: "2026-05-08T12:01:05Z",
    online: true,
  },
  {
    instance_id: "test-uuid-003",
    hostname: "octoboss-nas-test",
    address: "192.168.200.169",
    port: 8766,
    url: "http://192.168.200.169:8766",
    mode: "standalone",
    epoch: 0,
    last_beacon: "2026-05-07T22:14:11Z",
    online: false,
  },
];

const SETTINGS_WITH_TOKEN: Settings = {
  hubs: [{ id: "vdr", name: "VDR-Production", url: "http://localhost", token: null }],
  default_hub_id: "vdr",
  cluster_enabled: true,
  voting_engines: ["tesseract"],
  voting_strategy: "consensus",
  fallback_to_local: true,
  api_token: "panopticor-test-token",
  pipeline_log_enabled: true,
  doctype_text_gewicht: 0.5,
  doctype_layout_gewicht: 0.5,
};

const SETTINGS_NO_TOKEN: Settings = { ...SETTINGS_WITH_TOKEN, api_token: null };

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe("SwarmStatusPanel", () => {
  it("rendert Mein-Hub-Box mit mode/epoch/priority/instance_id", async () => {
    vi.spyOn(apiModule.api, "getSwarmStatus").mockResolvedValue(STATUS_PRIMARY);
    vi.spyOn(apiModule.api, "getSwarmPeers").mockResolvedValue({ peers: PEERS });
    vi.spyOn(apiModule.api, "getSettings").mockResolvedValue(SETTINGS_WITH_TOKEN);

    renderWithProviders(<SwarmStatusPanel />);

    await waitFor(() =>
      expect(screen.getByTestId("swarm-my-hub")).toBeInTheDocument()
    );
    const myHub = screen.getByTestId("swarm-my-hub");
    expect(myHub.textContent).toContain("primary");
    expect(myHub.textContent).toContain("vdr-uuid-001");
    expect(myHub.textContent).toContain("7"); // epoch
    expect(myHub.textContent).toContain("20"); // priority
  });

  it("rendert Master-Box mit last_election", async () => {
    vi.spyOn(apiModule.api, "getSwarmStatus").mockResolvedValue(STATUS_PRIMARY);
    vi.spyOn(apiModule.api, "getSwarmPeers").mockResolvedValue({ peers: PEERS });
    vi.spyOn(apiModule.api, "getSettings").mockResolvedValue(SETTINGS_WITH_TOKEN);

    renderWithProviders(<SwarmStatusPanel />);

    await waitFor(() =>
      expect(screen.getByTestId("swarm-master")).toBeInTheDocument()
    );
    const master = screen.getByTestId("swarm-master");
    expect(master.textContent).toContain("vdr-uuid-001");
    expect(master.textContent).toContain("cold-start");
    expect(screen.getByTestId("master-primary-id").textContent).toBe(
      "vdr-uuid-001"
    );
  });

  it("Peers-Tabelle ist sortiert (primary > replica > standalone) und zeigt online-Badges", async () => {
    vi.spyOn(apiModule.api, "getSwarmStatus").mockResolvedValue(STATUS_PRIMARY);
    vi.spyOn(apiModule.api, "getSwarmPeers").mockResolvedValue({ peers: PEERS });
    vi.spyOn(apiModule.api, "getSettings").mockResolvedValue(SETTINGS_WITH_TOKEN);

    renderWithProviders(<SwarmStatusPanel />);

    await waitFor(() => {
      expect(screen.getByTestId("peer-row-vdr-uuid-001")).toBeInTheDocument();
    });

    const rows = screen.getAllByTestId(/^peer-row-/);
    expect(rows).toHaveLength(3);
    // Erste Reihe: primary
    expect(rows[0].getAttribute("data-testid")).toBe("peer-row-vdr-uuid-001");
    // Zweite: replica
    expect(rows[1].getAttribute("data-testid")).toBe("peer-row-nas-uuid-002");
    // Dritte: standalone
    expect(rows[2].getAttribute("data-testid")).toBe("peer-row-test-uuid-003");

    // Mode-Pill zeigt mode an
    const pills = screen.getAllByTestId("mode-pill");
    expect(pills.some((p) => p.getAttribute("data-mode") === "primary")).toBe(true);
    expect(pills.some((p) => p.getAttribute("data-mode") === "replica")).toBe(true);
    expect(pills.some((p) => p.getAttribute("data-mode") === "standalone")).toBe(true);
  });

  it("Trigger-Button ist deaktiviert wenn kein Operator-Token konfiguriert ist", async () => {
    vi.spyOn(apiModule.api, "getSwarmStatus").mockResolvedValue(STATUS_PRIMARY);
    vi.spyOn(apiModule.api, "getSwarmPeers").mockResolvedValue({ peers: PEERS });
    vi.spyOn(apiModule.api, "getSettings").mockResolvedValue(SETTINGS_NO_TOKEN);

    renderWithProviders(<SwarmStatusPanel />);

    await waitFor(() =>
      expect(screen.getByTestId("trigger-election-btn")).toBeInTheDocument()
    );
    const btn = screen.getByTestId("trigger-election-btn") as HTMLButtonElement;
    expect(btn).toBeDisabled();
    expect(screen.getByTestId("no-token-hint")).toBeInTheDocument();
  });

  it("Trigger-Button oeffnet Confirm-Dialog und ruft API bei Bestaetigung", async () => {
    vi.spyOn(apiModule.api, "getSwarmStatus").mockResolvedValue(STATUS_PRIMARY);
    vi.spyOn(apiModule.api, "getSwarmPeers").mockResolvedValue({ peers: PEERS });
    vi.spyOn(apiModule.api, "getSettings").mockResolvedValue(SETTINGS_WITH_TOKEN);
    const triggerSpy = vi
      .spyOn(apiModule.api, "triggerElection")
      .mockResolvedValue({
        accepted: true,
        election_id: "el-77",
        cooldown_remaining_s: 0,
        message: null,
      } satisfies ElectionTriggerResponse);

    renderWithProviders(<SwarmStatusPanel />);

    await waitFor(() =>
      expect(screen.getByTestId("trigger-election-btn")).toBeInTheDocument()
    );

    // Dialog noch nicht da
    expect(screen.queryByTestId("election-confirm-dialog")).not.toBeInTheDocument();

    // Button klicken oeffnet Dialog
    fireEvent.click(screen.getByTestId("trigger-election-btn"));
    expect(screen.getByTestId("election-confirm-dialog")).toBeInTheDocument();

    // Bestaetigen ruft die API
    fireEvent.click(screen.getByTestId("trigger-election-confirm"));

    await waitFor(() => expect(triggerSpy).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByTestId("election-feedback").textContent).toContain("el-77")
    );
  });

  it("Trigger-Confirm-Dialog kann mit Abbrechen-Button geschlossen werden", async () => {
    vi.spyOn(apiModule.api, "getSwarmStatus").mockResolvedValue(STATUS_PRIMARY);
    vi.spyOn(apiModule.api, "getSwarmPeers").mockResolvedValue({ peers: PEERS });
    vi.spyOn(apiModule.api, "getSettings").mockResolvedValue(SETTINGS_WITH_TOKEN);
    const triggerSpy = vi.spyOn(apiModule.api, "triggerElection");

    renderWithProviders(<SwarmStatusPanel />);

    await waitFor(() =>
      expect(screen.getByTestId("trigger-election-btn")).toBeInTheDocument()
    );

    fireEvent.click(screen.getByTestId("trigger-election-btn"));
    expect(screen.getByTestId("election-confirm-dialog")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("trigger-election-cancel"));
    await waitFor(() =>
      expect(
        screen.queryByTestId("election-confirm-dialog")
      ).not.toBeInTheDocument()
    );
    expect(triggerSpy).not.toHaveBeenCalled();
  });

  it("Cooldown > 0 deaktiviert den Button", async () => {
    const cooldownStatus: ClusterStatus = {
      ...STATUS_PRIMARY,
      last_election: {
        timestamp: "2026-05-08T07:32:00Z",
        winner_id: "vdr-uuid-001",
        reason: "cold-start",
        cooldown_remaining_s: 45,
      },
    };
    vi.spyOn(apiModule.api, "getSwarmStatus").mockResolvedValue(cooldownStatus);
    vi.spyOn(apiModule.api, "getSwarmPeers").mockResolvedValue({ peers: PEERS });
    vi.spyOn(apiModule.api, "getSettings").mockResolvedValue(SETTINGS_WITH_TOKEN);

    renderWithProviders(<SwarmStatusPanel />);

    await waitFor(() =>
      expect(screen.getByTestId("trigger-election-btn")).toBeInTheDocument()
    );
    const btn = screen.getByTestId("trigger-election-btn") as HTMLButtonElement;
    expect(btn).toBeDisabled();
    expect(screen.getByTestId("election-cooldown").textContent).toContain("45");
  });

  it("zeigt Loading-State bevor die Daten geladen sind", async () => {
    let resolveStatus!: (s: ClusterStatus) => void;
    vi.spyOn(apiModule.api, "getSwarmStatus").mockImplementation(
      () => new Promise<ClusterStatus>((res) => (resolveStatus = res))
    );
    vi.spyOn(apiModule.api, "getSwarmPeers").mockResolvedValue({ peers: PEERS });
    vi.spyOn(apiModule.api, "getSettings").mockResolvedValue(SETTINGS_WITH_TOKEN);

    renderWithProviders(<SwarmStatusPanel />);

    expect(screen.getByTestId("swarm-loading")).toBeInTheDocument();

    // Aufloesen damit React-Query nicht offene Promises behaelt
    resolveStatus(STATUS_PRIMARY);
    await waitFor(() =>
      expect(screen.queryByTestId("swarm-loading")).not.toBeInTheDocument()
    );
  });

  it("zeigt Error-State wenn getSwarmStatus fehlschlaegt", async () => {
    vi.spyOn(apiModule.api, "getSwarmStatus").mockRejectedValue(
      new Error("connection refused")
    );
    vi.spyOn(apiModule.api, "getSwarmPeers").mockResolvedValue({ peers: PEERS });
    vi.spyOn(apiModule.api, "getSettings").mockResolvedValue(SETTINGS_WITH_TOKEN);

    renderWithProviders(<SwarmStatusPanel />);

    await waitFor(() =>
      expect(screen.getByTestId("swarm-error")).toBeInTheDocument()
    );
    expect(screen.getByTestId("swarm-error").textContent).toContain(
      "connection refused"
    );
  });

  it("zeigt 'Keine Peers bekannt' wenn die Liste leer ist", async () => {
    vi.spyOn(apiModule.api, "getSwarmStatus").mockResolvedValue(STATUS_PRIMARY);
    vi.spyOn(apiModule.api, "getSwarmPeers").mockResolvedValue({ peers: [] });
    vi.spyOn(apiModule.api, "getSettings").mockResolvedValue(SETTINGS_WITH_TOKEN);

    renderWithProviders(<SwarmStatusPanel />);

    await waitFor(() =>
      expect(screen.getByTestId("swarm-peers")).toBeInTheDocument()
    );
    expect(screen.getByTestId("swarm-peers").textContent).toContain(
      "Keine Peers bekannt"
    );
  });

  // ── Hub-0.9.3-Felder ────────────────────────────────────────────────────

  it("rendert election_eligible als 'Ja' wenn true", async () => {
    const status: ClusterStatus = { ...STATUS_PRIMARY, election_eligible: true };
    vi.spyOn(apiModule.api, "getSwarmStatus").mockResolvedValue(status);
    vi.spyOn(apiModule.api, "getSwarmPeers").mockResolvedValue({ peers: [] });
    vi.spyOn(apiModule.api, "getSettings").mockResolvedValue(SETTINGS_WITH_TOKEN);

    renderWithProviders(<SwarmStatusPanel />);

    await waitFor(() =>
      expect(screen.getByTestId("hub-election-eligible")).toBeInTheDocument()
    );
    expect(screen.getByTestId("hub-election-eligible").textContent).toBe("Ja");
  });

  it("rendert load_threshold_percent mit Prozent-Zeichen", async () => {
    const status: ClusterStatus = { ...STATUS_PRIMARY, load_threshold_percent: 85 };
    vi.spyOn(apiModule.api, "getSwarmStatus").mockResolvedValue(status);
    vi.spyOn(apiModule.api, "getSwarmPeers").mockResolvedValue({ peers: [] });
    vi.spyOn(apiModule.api, "getSettings").mockResolvedValue(SETTINGS_WITH_TOKEN);

    renderWithProviders(<SwarmStatusPanel />);

    await waitFor(() =>
      expect(screen.getByTestId("hub-load-threshold")).toBeInTheDocument()
    );
    expect(screen.getByTestId("hub-load-threshold").textContent).toBe("85%");
  });

  it("rendert mode_aware_routing_enabled als 'Nein' wenn false", async () => {
    const status: ClusterStatus = {
      ...STATUS_PRIMARY,
      mode_aware_routing_enabled: false,
    };
    vi.spyOn(apiModule.api, "getSwarmStatus").mockResolvedValue(status);
    vi.spyOn(apiModule.api, "getSwarmPeers").mockResolvedValue({ peers: [] });
    vi.spyOn(apiModule.api, "getSettings").mockResolvedValue(SETTINGS_WITH_TOKEN);

    renderWithProviders(<SwarmStatusPanel />);

    await waitFor(() =>
      expect(screen.getByTestId("hub-mode-aware-routing")).toBeInTheDocument()
    );
    expect(screen.getByTestId("hub-mode-aware-routing").textContent).toBe("Nein");
  });

  it("fehlende Optional-Felder rendern '—' statt undefined", async () => {
    // STATUS_PRIMARY hat keine election_eligible / load_threshold_percent /
    // mode_aware_routing_enabled gesetzt — alle drei sind undefined.
    const statusOhneFelder: ClusterStatus = {
      ...STATUS_PRIMARY,
      election_eligible: undefined,
      load_threshold_percent: undefined,
      mode_aware_routing_enabled: undefined,
    };
    vi.spyOn(apiModule.api, "getSwarmStatus").mockResolvedValue(statusOhneFelder);
    vi.spyOn(apiModule.api, "getSwarmPeers").mockResolvedValue({ peers: [] });
    vi.spyOn(apiModule.api, "getSettings").mockResolvedValue(SETTINGS_WITH_TOKEN);

    renderWithProviders(<SwarmStatusPanel />);

    await waitFor(() =>
      expect(screen.getByTestId("hub-election-eligible")).toBeInTheDocument()
    );
    expect(screen.getByTestId("hub-election-eligible").textContent).toBe("—");
    expect(screen.getByTestId("hub-load-threshold").textContent).toBe("—");
    expect(screen.getByTestId("hub-mode-aware-routing").textContent).toBe("—");
  });
});
