// Tests fuer SettingsTab — Smoke + Dirty-State + Save-Pfad + Reset-Confirm.
//
// Wir mocken `api` aus lib/api, damit der Test keinen echten Backend-Call macht
// und wir verifizieren koennen, dass beim Save die richtigen Endpoints in der
// richtigen Reihenfolge angesprochen werden.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Settings } from "../../lib/types";

// --- API mocken ------------------------------------------------------------
// vi.mock wird hochgehoben, daher Mocks via vi.hoisted() definieren, damit
// die Variable beim Mock-Factory-Lauf bereits existiert.
const mocked = vi.hoisted(() => ({
  api: {
    getSettings: vi.fn(),
    updateSettings: vi.fn(),
    updateHubs: vi.fn(),
    setDefaultHub: vi.fn(),
  },
}));

vi.mock("../../lib/api", () => ({
  api: mocked.api,
  ApiError: class ApiError extends Error {
    constructor(public status: number, public path: string, message: string) {
      super(message);
    }
  },
}));

// Build-Info stabilisieren (Diagnose-Sektion zeigt sie an)
vi.mock("../../lib/env", () => ({
  BUILD_HASH: "test123",
  BUILD_TS: "2026-05-06T00:00:00Z",
  isMockMode: () => false,
  setMockMode: () => {},
}));

import { SettingsTab } from "./SettingsTab";

const mockApi = mocked.api;

// --- Test-Fixture ----------------------------------------------------------
function makeSettings(over: Partial<Settings> = {}): Settings {
  return {
    hubs: [
      { id: "vdr", name: "VDR", url: "http://192.168.200.71:18765" },
      { id: "nas", name: "NAS", url: "http://192.168.200.169:8765" },
    ],
    default_hub_id: "vdr",
    cluster_enabled: true,
    voting_engines: ["tesseract", "easyocr"],
    voting_strategy: "consensus",
    fallback_to_local: true,
    api_token: "abcd1234",
    pipeline_log_enabled: true,
    doctype_text_gewicht: 0.7,
    doctype_layout_gewicht: 0.3,
    active_env: { OCREXPERT_USE_OCTOBOSS: "true" },
    settings_path: "C:/Users/test/.ocrexpert/gui_settings.json",
    ...over,
  };
}

function renderTab() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <SettingsTab />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  for (const fn of Object.values(mockApi)) (fn as ReturnType<typeof vi.fn>).mockReset();
});

// --- Tests ------------------------------------------------------------------
describe("SettingsTab", () => {
  it("rendert alle 5 Sektionen + Diagnose-Felder (Akzeptanz 1+7)", async () => {
    mockApi.getSettings.mockResolvedValueOnce(makeSettings());
    renderTab();

    await screen.findByText("1. Hubs");
    expect(screen.getByText("2. Cluster")).toBeInTheDocument();
    expect(screen.getByText("3. Pipeline")).toBeInTheDocument();
    expect(screen.getByText("4. Auth")).toBeInTheDocument();
    expect(screen.getByText("5. Diagnose")).toBeInTheDocument();
    // Diagnose: ENV + Settings-Pfad + Build-Hash sichtbar
    expect(screen.getByText("OCREXPERT_USE_OCTOBOSS")).toBeInTheDocument();
    expect(screen.getByText(/gui_settings\.json/)).toBeInTheDocument();
    // Build-Hash erscheint sowohl in der Diagnose-Tabelle als auch im PageBadge
    expect(screen.getAllByText(/test123/).length).toBeGreaterThanOrEqual(1);
  });

  it("Save-Button ist initial disabled, aktiviert sich bei Aenderung (Akzeptanz UX-Dirty-State)", async () => {
    mockApi.getSettings.mockResolvedValueOnce(makeSettings());
    renderTab();

    const saveBtn = (await screen.findByTestId("save-button")) as HTMLButtonElement;
    expect(saveBtn).toBeDisabled();
    expect(saveBtn.textContent).toContain("Gespeichert");

    // Toggle Cluster aus -> dirty
    fireEvent.click(screen.getByTestId("toggle-cluster-enabled"));
    expect(saveBtn).not.toBeDisabled();
    expect(saveBtn.textContent).toContain("Speichern");
  });

  it("verbirgt API-Token initial und zeigt ihn nach Klick auf Anzeigen (Akzeptanz 6)", async () => {
    mockApi.getSettings.mockResolvedValueOnce(makeSettings({ api_token: "topsecret" }));
    renderTab();

    const input = (await screen.findByTestId("api-token-input")) as HTMLInputElement;
    expect(input.type).toBe("password");
    expect(input.value).toBe("topsecret");

    fireEvent.click(screen.getByTestId("api-token-toggle"));
    expect(input.type).toBe("text");
  });

  it("validiert Token (zu kurz -> Save disabled)", async () => {
    mockApi.getSettings.mockResolvedValueOnce(makeSettings());
    renderTab();

    const input = (await screen.findByTestId("api-token-input")) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "ab" } });

    const saveBtn = screen.getByTestId("save-button") as HTMLButtonElement;
    expect(saveBtn).toBeDisabled();
    expect(
      screen.getByText(/Token muss mindestens 4 Zeichen/)
    ).toBeInTheDocument();
  });

  it("Save ruft updateHubs/setDefaultHub/updateSettings je nach Diff (Akzeptanz 4+5)", async () => {
    const initial = makeSettings();
    // mockResolvedValue (nicht Once), weil settingsQuery.refetch() nach Save nochmal feuert
    mockApi.getSettings.mockResolvedValue(initial);
    mockApi.updateSettings.mockResolvedValueOnce({ ...initial, cluster_enabled: false });
    renderTab();

    // Warte bis geladen
    await screen.findByTestId("toggle-cluster-enabled");

    // 1) Cluster-Toggle aendern (kein Hub-Diff)
    fireEvent.click(screen.getByTestId("toggle-cluster-enabled"));
    fireEvent.click(screen.getByTestId("save-button"));

    await waitFor(() => expect(mockApi.updateSettings).toHaveBeenCalledTimes(1));
    expect(mockApi.updateHubs).not.toHaveBeenCalled();
    expect(mockApi.setDefaultHub).not.toHaveBeenCalled();
    const patch = mockApi.updateSettings.mock.calls[0][0] as Partial<Settings>;
    expect(patch.cluster_enabled).toBe(false);
  });

  it("Reset-Button oeffnet Confirm-Dialog und setzt Defaults (Akzeptanz 8)", async () => {
    mockApi.getSettings.mockResolvedValueOnce(makeSettings({ default_hub_id: "nas" }));
    renderTab();

    fireEvent.click(await screen.findByTestId("reset-button"));
    // Dialog offen
    expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("confirm-dialog-ok"));

    // Nach Reset: default_hub_id wieder "vdr" (aus DEFAULT_SETTINGS) -> dirty
    const saveBtn = screen.getByTestId("save-button") as HTMLButtonElement;
    expect(saveBtn).not.toBeDisabled();
    // Default-Radio fuer vdr ist gesetzt
    const radio = screen.getByLabelText("Hub vdr als Default") as HTMLInputElement;
    expect(radio.checked).toBe(true);
  });

  it("Doctype-Slider veraendert Text-Gewicht und zeigt komplementaeres Layout-Gewicht (Akzeptanz 5)", async () => {
    mockApi.getSettings.mockResolvedValueOnce(makeSettings());
    renderTab();

    const slider = (await screen.findByTestId("text-weight-slider")) as HTMLInputElement;
    // Default 0.7 -> Layout 0.30
    expect(slider.value).toBe("0.7");
    fireEvent.change(slider, { target: { value: "0.4" } });
    expect(slider.value).toBe("0.4");
    // Layout-Anzeige aktualisiert sich (0.6)
    expect(screen.getByText("0.60")).toBeInTheDocument();
  });
});
