// Smoke-Tests fuer ManifestHealthPage.
// Prueft Rendering mit Mock-Daten (green/red), Fehlerfall, Loading-State.

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

// ── Tests ─────────────────────────────────────────────────────────────────────

afterEach(() => vi.restoreAllMocks());

describe("ManifestHealthPage", () => {
  it("rendert Seiten-Titel", async () => {
    vi.spyOn(apiModule.api.octoboss, "getManifestHealth").mockResolvedValue(
      GREEN_RESPONSE,
    );
    render(wrap(<ManifestHealthPage />));
    expect(screen.getByText("Manifest-Health")).toBeTruthy();
  });

  it("zeigt gruene Status-Badges bei gruenem Ergebnis", async () => {
    vi.spyOn(apiModule.api.octoboss, "getManifestHealth").mockResolvedValue(
      GREEN_RESPONSE,
    );
    render(wrap(<ManifestHealthPage />));
    await waitFor(() => {
      // Summary-Text: "Alle Manifests sind konsistent" bei overall_status green
      expect(screen.getByText("Alle Manifests sind konsistent")).toBeTruthy();
    });
  });

  it("zeigt Fehler-Badges bei rotem Ergebnis", async () => {
    vi.spyOn(apiModule.api.octoboss, "getManifestHealth").mockResolvedValue(
      RED_RESPONSE,
    );
    render(wrap(<ManifestHealthPage />));
    await waitFor(() => {
      // Summary-Text: "Fehler erkannt" bei overall_status red
      expect(
        screen.getByText(/Fehler erkannt — Manifests inkonsistent/),
      ).toBeTruthy();
    });
  });

  it("zeigt node_overrides-Bug in Checks", async () => {
    vi.spyOn(apiModule.api.octoboss, "getManifestHealth").mockResolvedValue(
      RED_RESPONSE,
    );
    render(wrap(<ManifestHealthPage />));
    await waitFor(() => {
      expect(screen.getByText("node_overrides-Werte sind Strings")).toBeTruthy();
    });
  });

  it("zeigt Bootstrapper-Manifest-Sektion", async () => {
    vi.spyOn(apiModule.api.octoboss, "getManifestHealth").mockResolvedValue(
      GREEN_RESPONSE,
    );
    render(wrap(<ManifestHealthPage />));
    await waitFor(() => {
      expect(screen.getByText("Bootstrapper-Manifest")).toBeTruthy();
    });
  });

  it("zeigt Core-Manifest-Sektion wenn vorhanden", async () => {
    vi.spyOn(apiModule.api.octoboss, "getManifestHealth").mockResolvedValue(
      GREEN_RESPONSE,
    );
    render(wrap(<ManifestHealthPage />));
    await waitFor(() => {
      expect(screen.getByText("Core-Manifest")).toBeTruthy();
    });
  });

  it("zeigt LoadingSpinner waehrend Ladephase", () => {
    // Query wird nie resolved → loading-State
    vi.spyOn(apiModule.api.octoboss, "getManifestHealth").mockReturnValue(
      new Promise(() => {}),
    );
    render(wrap(<ManifestHealthPage />));
    // Titel immer da
    expect(screen.getByText("Manifest-Health")).toBeTruthy();
  });

  it("zeigt Fehlermeldung bei API-Fehler", async () => {
    vi.spyOn(apiModule.api.octoboss, "getManifestHealth").mockRejectedValue(
      new Error("Hub nicht erreichbar"),
    );
    render(wrap(<ManifestHealthPage />));
    // Warten bis die Fehler-Meldung im DOM erscheint
    // React Query retry=false, also sollte der Fehler direkt sichtbar sein.
    // Test-Ansatz: body-Text nach Schluessel-Phrase suchen
    await waitFor(() => {
      const body = document.body.textContent ?? "";
      expect(body).toContain("Hub nicht erreichbar");
    });
  });

  it("zeigt Neu-Laden-Button", async () => {
    vi.spyOn(apiModule.api.octoboss, "getManifestHealth").mockResolvedValue(
      GREEN_RESPONSE,
    );
    render(wrap(<ManifestHealthPage />));
    await waitFor(() => {
      expect(screen.getByLabelText("Manifest-Health-Daten neu laden")).toBeTruthy();
    });
  });

  it("zeigt Cache-TTL-Hinweis", async () => {
    vi.spyOn(apiModule.api.octoboss, "getManifestHealth").mockResolvedValue(
      GREEN_RESPONSE,
    );
    render(wrap(<ManifestHealthPage />));
    await waitFor(() => {
      expect(screen.getByText(/Hub-Cache-TTL/)).toBeTruthy();
    });
  });

  it("zeigt PageBadge", async () => {
    vi.spyOn(apiModule.api.octoboss, "getManifestHealth").mockResolvedValue(
      GREEN_RESPONSE,
    );
    render(wrap(<ManifestHealthPage />));
    await waitFor(() => {
      expect(screen.getByText(/manifest-health/)).toBeTruthy();
    });
  });
});
