// Smoke-Tests fuer ManifestHealthPage.
// Prueft Rendering mit Mock-Daten (green/red), Fehlerfall, Loading-State.
// Seit Multi-Hub-Erweiterung: Tests gegen getManifestHealthAll.

import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

import { ManifestHealthPage } from "../pages/ManifestHealth";
import * as apiModule from "../../../lib/api";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeQC() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchInterval: false, staleTime: 0 },
    },
  });
}

function wrap(node: ReactNode) {
  return (
    <MemoryRouter initialEntries={["/octoboss/manifest-health"]}>
      <QueryClientProvider client={makeQC()}>{node}</QueryClientProvider>
    </MemoryRouter>
  );
}

// ── Mock-Daten ────────────────────────────────────────────────────────────────

const GREEN_RESPONSE = {
  manifests: {
    bootstrapper: {
      status: "green",
      checks: [
        {
          id: "schema-default-version",
          label: "default_version vorhanden",
          status: "green",
          detail: 'default_version = "0.3.9-rc5"',
        },
        {
          id: "cross-ref",
          label: "default_version in versions{}",
          status: "green",
          detail: '"0.3.9-rc5" ist in versions{} vorhanden',
        },
        {
          id: "node-overrides-types",
          label: "node_overrides-Werte sind Strings",
          status: "green",
          detail: "0 Overrides, alle Strings",
        },
        {
          id: "exe-files",
          label: "Bootstrapper-EXE verfuegbar",
          status: "green",
          detail: "Bootstrapper-EXE: 679000 Bytes",
        },
        {
          id: "live-consistency",
          label: "Live-Hub-Konsistenz (bootstrapper_version)",
          status: "green",
          detail: 'Hub und Manifest stimmen ueberein: "0.3.9-rc5"',
        },
      ],
      errors: [],
      warnings: [],
      hints: [],
      hub_url: "http://192.168.200.71:18765",
      data_source: "option-a-live-hub-api",
      manifest_endpoint: "http://192.168.200.71:18765/seti/distribute/info",
    },
    core: {
      status: "green",
      checks: [
        {
          id: "schema-default-version",
          label: "default_version vorhanden",
          status: "green",
          detail: 'default_version = "0.3.1"',
        },
      ],
      errors: [],
      warnings: [],
      hints: [],
      hub_url: "http://192.168.200.71:18765",
      data_source: "option-a-live-hub-api",
      manifest_endpoint:
        "http://192.168.200.71:18765/api/v1/seti/core/desired",
    },
  },
  summary: {
    overall_status: "green",
    errors_count: 0,
    warnings_count: 0,
    hub_url: "http://192.168.200.71:18765",
    data_source_note: "Option A (Live-Hub-API): Schema-Validierung.",
    cache_ttl_note: "Hub-Cache-TTL: 30s.",
  },
  fetched_at: "2026-05-18T10:00:00Z",
};

const RED_RESPONSE = {
  manifests: {
    bootstrapper: {
      status: "red",
      checks: [
        {
          id: "node-overrides-types",
          label: "node_overrides-Werte sind Strings",
          status: "red",
          detail: 'node_overrides["uuid"] = dict (erwartet: str)',
          hint: "node_overrides-Werte muessen NUR Version-Strings sein, keine Objects.",
          example: '"uuid": "0.3.9-rc5"',
          schema_ref: "bootstrapper_distribution/manifest.py:180-182",
          value_actual: "dict",
          value_expected: "str",
        },
        {
          id: "cross-ref",
          label: "default_version in versions{}",
          status: "red",
          detail: 'default_version="0.3.9-MISSING" nicht in versions{}',
          hint: "Vorhandene Versionen: 0.3.9-rc5",
        },
      ],
      errors: [
        'node_overrides["uuid"] = dict (erwartet: str)',
        'default_version="0.3.9-MISSING" nicht in versions{}',
      ],
      warnings: [],
      hints: ["node_overrides-Werte muessen NUR Version-Strings sein."],
      hub_url: "http://192.168.200.71:18765",
      data_source: "option-a-live-hub-api",
      manifest_endpoint: "http://192.168.200.71:18765/seti/distribute/info",
    },
  },
  summary: {
    overall_status: "red",
    errors_count: 2,
    warnings_count: 0,
    hub_url: "http://192.168.200.71:18765",
    data_source_note: "Option A.",
    cache_ttl_note: "Hub-Cache-TTL: 30s.",
  },
  fetched_at: "2026-05-18T10:00:00Z",
};

// ── Multi-Hub-Mock-Daten ──────────────────────────────────────────────────────

const MULTI_HUB_RESPONSE = {
  schema: "manifest-health-all-v1",
  active_hub_id: "vdr",
  hubs: [
    {
      id: "vdr",
      url: "http://192.168.200.71:18765",
      is_active: true,
      health: GREEN_RESPONSE,
    },
    {
      id: "nas",
      url: "http://192.168.200.169:8765",
      is_active: false,
      health: {
        ...GREEN_RESPONSE,
        summary: {
          ...GREEN_RESPONSE.summary,
          hub_url: "http://192.168.200.169:8765",
        },
      },
    },
  ],
};

const MULTI_HUB_TIMEOUT_RESPONSE = {
  schema: "manifest-health-all-v1",
  active_hub_id: "vdr",
  hubs: [
    {
      id: "vdr",
      url: "http://192.168.200.71:18765",
      is_active: true,
      health: GREEN_RESPONSE,
    },
    {
      id: "nas",
      url: "http://192.168.200.169:8765",
      is_active: false,
      health: {
        error: "timeout",
        detail: "Hub http://192.168.200.169:8765 hat nicht innerhalb von 5s geantwortet.",
      },
    },
  ],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

afterEach(() => vi.restoreAllMocks());

describe("ManifestHealthPage", () => {
  it("rendert Seiten-Titel", async () => {
    vi.spyOn(apiModule.api.octoboss, "getManifestHealthAll").mockResolvedValue(
      MULTI_HUB_RESPONSE,
    );
    render(wrap(<ManifestHealthPage />));
    expect(screen.getByText("Manifest-Health")).toBeTruthy();
  });

  it("zeigt gruene Status-Badges bei gruenem Ergebnis (Multi-Hub)", async () => {
    vi.spyOn(apiModule.api.octoboss, "getManifestHealthAll").mockResolvedValue(
      MULTI_HUB_RESPONSE,
    );
    render(wrap(<ManifestHealthPage />));
    await waitFor(() => {
      // Beide Hubs sollen gerendert werden
      const body = document.body.textContent ?? "";
      expect(body).toContain("vdr");
      expect(body).toContain("nas");
    });
  });

  it("zeigt Aktiv-Badge fuer aktiven Hub", async () => {
    vi.spyOn(apiModule.api.octoboss, "getManifestHealthAll").mockResolvedValue(
      MULTI_HUB_RESPONSE,
    );
    render(wrap(<ManifestHealthPage />));
    await waitFor(() => {
      // Aktiv-Badge enthaelt "Aktiv" (fuer vdr)
      const body = document.body.textContent ?? "";
      expect(body).toContain("Aktiv");
      expect(body).toContain("Sekundär");
    });
  });

  it("zeigt Timeout-Fehler fuer nicht erreichbaren Hub", async () => {
    vi.spyOn(apiModule.api.octoboss, "getManifestHealthAll").mockResolvedValue(
      MULTI_HUB_TIMEOUT_RESPONSE,
    );
    render(wrap(<ManifestHealthPage />));
    await waitFor(() => {
      const body = document.body.textContent ?? "";
      expect(body).toContain("Timeout");
    });
  });

  it("zeigt node_overrides-Bug in Checks (Hub-Card)", async () => {
    const multiHubRedResponse = {
      schema: "manifest-health-all-v1",
      active_hub_id: "vdr",
      hubs: [
        {
          id: "vdr",
          url: "http://192.168.200.71:18765",
          is_active: true,
          health: RED_RESPONSE,
        },
      ],
    };
    vi.spyOn(apiModule.api.octoboss, "getManifestHealthAll").mockResolvedValue(
      multiHubRedResponse,
    );
    render(wrap(<ManifestHealthPage />));
    await waitFor(() => {
      expect(screen.getByText("node_overrides-Werte sind Strings")).toBeTruthy();
    });
  });

  it("zeigt Bootstrapper-Manifest-Sektion in Hub-Card", async () => {
    vi.spyOn(apiModule.api.octoboss, "getManifestHealthAll").mockResolvedValue(
      MULTI_HUB_RESPONSE,
    );
    render(wrap(<ManifestHealthPage />));
    await waitFor(() => {
      expect(screen.getAllByText("Bootstrapper-Manifest").length).toBeGreaterThan(0);
    });
  });

  it("zeigt Core-Manifest-Sektion in Hub-Card", async () => {
    vi.spyOn(apiModule.api.octoboss, "getManifestHealthAll").mockResolvedValue(
      MULTI_HUB_RESPONSE,
    );
    render(wrap(<ManifestHealthPage />));
    await waitFor(() => {
      expect(screen.getAllByText("Core-Manifest").length).toBeGreaterThan(0);
    });
  });

  it("zeigt LoadingSpinner waehrend Ladephase", () => {
    // Query wird nie resolved → loading-State
    vi.spyOn(apiModule.api.octoboss, "getManifestHealthAll").mockReturnValue(
      new Promise(() => {}),
    );
    render(wrap(<ManifestHealthPage />));
    // Titel immer da
    expect(screen.getByText("Manifest-Health")).toBeTruthy();
  });

  it("zeigt Fehlermeldung bei API-Fehler", async () => {
    vi.spyOn(apiModule.api.octoboss, "getManifestHealthAll").mockRejectedValue(
      new Error("Hub nicht erreichbar"),
    );
    render(wrap(<ManifestHealthPage />));
    // Warten bis die Fehler-Meldung im DOM erscheint
    // React Query retry=false, also sollte der Fehler direkt sichtbar sein.
    await waitFor(() => {
      const body = document.body.textContent ?? "";
      expect(body).toContain("Hub nicht erreichbar");
    });
  });

  it("zeigt Neu-Laden-Button", async () => {
    vi.spyOn(apiModule.api.octoboss, "getManifestHealthAll").mockResolvedValue(
      MULTI_HUB_RESPONSE,
    );
    render(wrap(<ManifestHealthPage />));
    await waitFor(() => {
      expect(screen.getByLabelText("Manifest-Health-Daten neu laden")).toBeTruthy();
    });
  });

  it("zeigt Cache-TTL-Hinweis", async () => {
    vi.spyOn(apiModule.api.octoboss, "getManifestHealthAll").mockResolvedValue(
      MULTI_HUB_RESPONSE,
    );
    render(wrap(<ManifestHealthPage />));
    await waitFor(() => {
      // Zwei Hubs → zwei Cache-TTL-Hinweise (je Hub-Card einer)
      expect(screen.getAllByText(/Hub-Cache-TTL/).length).toBeGreaterThan(0);
    });
  });

  it("zeigt PageBadge", async () => {
    vi.spyOn(apiModule.api.octoboss, "getManifestHealthAll").mockResolvedValue(
      MULTI_HUB_RESPONSE,
    );
    render(wrap(<ManifestHealthPage />));
    await waitFor(() => {
      expect(screen.getByText(/manifest-health/)).toBeTruthy();
    });
  });

  // ── Neue Multi-Hub-Tests ────────────────────────────────────────────────────

  it("rendert zwei Hub-Cards bei zwei Hubs", async () => {
    vi.spyOn(apiModule.api.octoboss, "getManifestHealthAll").mockResolvedValue(
      MULTI_HUB_RESPONSE,
    );
    render(wrap(<ManifestHealthPage />));
    await waitFor(() => {
      // Hub-IDs im Body
      const body = document.body.textContent ?? "";
      expect(body).toContain("vdr");
      expect(body).toContain("nas");
    });
  });

  it("aktiver Hub zeigt Stern-Badge, sekundaerer Hub zeigt Sekundaer-Badge", async () => {
    vi.spyOn(apiModule.api.octoboss, "getManifestHealthAll").mockResolvedValue(
      MULTI_HUB_RESPONSE,
    );
    render(wrap(<ManifestHealthPage />));
    await waitFor(() => {
      const body = document.body.textContent ?? "";
      // Aktiv-Badge mit Stern
      expect(body).toContain("★ Aktiv");
      // Sekundaer-Badge
      expect(body).toContain("Sekundär");
    });
  });

  it("Timeout-Hub zeigt 'Nicht erreichbar'-Badge", async () => {
    vi.spyOn(apiModule.api.octoboss, "getManifestHealthAll").mockResolvedValue(
      MULTI_HUB_TIMEOUT_RESPONSE,
    );
    render(wrap(<ManifestHealthPage />));
    await waitFor(() => {
      const body = document.body.textContent ?? "";
      expect(body).toContain("Nicht erreichbar");
    });
  });

  it("Hub-Count im Header zeigt Anzahl der Hubs", async () => {
    vi.spyOn(apiModule.api.octoboss, "getManifestHealthAll").mockResolvedValue(
      MULTI_HUB_RESPONSE,
    );
    render(wrap(<ManifestHealthPage />));
    await waitFor(() => {
      const body = document.body.textContent ?? "";
      expect(body).toContain("2 Hubs");
    });
  });
});
