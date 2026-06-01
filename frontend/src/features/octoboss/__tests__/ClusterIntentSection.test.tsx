// Smoke-Tests fuer ClusterIntentSection (Versionen, Overrides, Module-Drift, Default-Flip).
//
// Strategie: api.octoboss-Methoden gemockt. Komponente wird isoliert mit
// einem HubInventory-Mock-Objekt gerendert.

import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { render, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

import {
  ClusterIntentSection,
  type HubInventory,
} from "../components/ClusterIntentSection";
import * as apiModule from "../../../lib/api";

function makeQC() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchInterval: false, staleTime: 0 },
    },
  });
}

function wrap(node: ReactNode) {
  return (
    <MemoryRouter>
      <QueryClientProvider client={makeQC()}>{node}</QueryClientProvider>
    </MemoryRouter>
  );
}

// ── Mock-Inventory ────────────────────────────────────────────────────────────

const INV_GREEN: HubInventory = {
  core: {
    default: "0.3.9-rc5.10b",
    versions: [
      { version: "0.3.8-rc4", sha256: "a".repeat(64), size_bytes: 100_000 },
      { version: "0.3.9-rc5.10b", sha256: "b".repeat(64), size_bytes: 200_000 },
    ],
    overrides: [{ node_id: "11111111-1111-1111-1111-111111111111", version: "0.3.8-rc4" }],
    asset_inventory_versions: ["0.3.8-rc4", "0.3.9-rc5.10b"],
    supports_versions_api: true,
    error: null,
  },
  bootstrapper: {
    default: "0.3.9-rc5",
    versions: [{ version: "0.3.9-rc5", sha256: "c".repeat(64), size_bytes: 679000 }],
    overrides: [],
    supports_versions_api: false,
    cr_pending: "2026-05-23-bootstrapper-admin-api",
    available: true,
    sha256: "c".repeat(64),
    size_bytes: 679000,
    error: null,
  },
  modules: {
    by_node: [
      {
        node_id: "11111111-1111-1111-1111-111111111111",
        hostname: "ryzen",
        connected: true,
        node_pool: "production",
        modules: [
          { name: "ocr-worker", version: "0.4.2", status: "running" },
          { name: "hw-monitor", version: "0.2.0", status: "running" },
        ],
      },
      {
        node_id: "22222222-2222-2222-2222-222222222222",
        hostname: "intel",
        connected: true,
        node_pool: "production",
        modules: [
          { name: "ocr-worker", version: "0.4.1", status: "running" },
          { name: "hw-monitor", version: "0.2.0", status: "running" },
        ],
      },
    ],
    drift: [
      {
        module: "ocr-worker",
        versions: {
          "0.4.2": ["11111111-1111-1111-1111-111111111111"],
          "0.4.1": ["22222222-2222-2222-2222-222222222222"],
        },
        version_count: 2,
      },
    ],
    node_count: 2,
    module_count: 2,
    error: null,
  },
};

// Bootstrapper-Admin freigeschaltet (OctoBoss-CR 2026-05-23 durch):
// supports_versions_api=true, mehrere Versionen, ein Override.
const INV_BOOTSTRAPPER_ENABLED: HubInventory = {
  ...INV_GREEN,
  bootstrapper: {
    default: "0.3.9-rc5",
    versions: [
      { version: "0.3.8-rc4" },
      { version: "0.3.9-rc5" },
    ],
    overrides: [{ node_id: "22222222-2222-2222-2222-222222222222", version: "0.3.8-rc4" }],
    supports_versions_api: true,
    available: true,
    sha256: "c".repeat(64),
    size_bytes: 679000,
    error: null,
  },
};

// ── Tests ─────────────────────────────────────────────────────────────────────

afterEach(() => vi.restoreAllMocks());

describe("ClusterIntentSection", () => {
  it("zeigt Core-Default + Versionen + Overrides", () => {
    render(wrap(<ClusterIntentSection inventory={INV_GREEN} hubId="vdr" />));
    // Versions-Liste aufklappen (Core hat 2 Versionen → standardmaessig eingeklappt)
    const toggle = document.querySelector('[data-testid="versions-toggle-core-versionen"]') as HTMLElement;
    fireEvent.click(toggle);
    const body = document.body.textContent ?? "";
    expect(body).toContain("Core-Versionen");
    expect(body).toContain("0.3.9-rc5.10b");
    expect(body).toContain("0.3.8-rc4");
  });

  it("kennzeichnet Bootstrapper-Sektion mit 'CR pending' wenn supports_versions_api=false", () => {
    render(wrap(<ClusterIntentSection inventory={INV_GREEN} hubId="vdr" />));
    const body = document.body.textContent ?? "";
    expect(body).toContain("CR pending");
  });

  it("listet Module-Drift fuer ocr-worker", () => {
    render(wrap(<ClusterIntentSection inventory={INV_GREEN} hubId="vdr" />));
    const drift = document.querySelector('[data-testid="drift-list"]');
    expect(drift).toBeTruthy();
    expect((drift as HTMLElement).textContent).toContain("ocr-worker");
    expect((drift as HTMLElement).textContent).toContain("2 verschiedenen Versionen");
  });

  it("zeigt Override-Zeile fuer gepinnten Node + 'festverankern' fuer freie Node", () => {
    render(wrap(<ClusterIntentSection inventory={INV_GREEN} hubId="vdr" />));
    const body = document.body.textContent ?? "";
    expect(body).toContain("ryzen");
    expect(body).toContain("intel");
    expect(body).toContain("0.3.8-rc4");
    expect(body).toContain("aendern");        // ryzen ist gepinnt → "aendern"
    expect(body).toContain("festverankern");  // intel ist nicht gepinnt → "festverankern"
  });

  it("Default-Tausch-Button auf gepinnter Default-Version fehlt (★ aktive Version)", () => {
    render(wrap(<ClusterIntentSection inventory={INV_GREEN} hubId="vdr" />));
    // Liste aufklappen
    fireEvent.click(
      document.querySelector('[data-testid="versions-toggle-core-versionen"]') as HTMLElement,
    );
    // Knopf existiert NUR fuer Versionen != default
    const setDefaultBtn = document.querySelector(
      `[data-testid="versions-set-default-0.3.8-rc4"]`,
    );
    expect(setDefaultBtn).toBeTruthy();
    const noBtnForActive = document.querySelector(
      `[data-testid="versions-set-default-0.3.9-rc5.10b"]`,
    );
    expect(noBtnForActive).toBeFalsy();
  });

  it("Bootstrapper-Versionen zeigen keinen Default-Tausch-Button (CR pending)", () => {
    render(wrap(<ClusterIntentSection inventory={INV_GREEN} hubId="vdr" />));
    // Core-Liste aufklappen, Bootstrapper hat nur 1 Version (= default) → ohne Toggle
    fireEvent.click(
      document.querySelector('[data-testid="versions-toggle-core-versionen"]') as HTMLElement,
    );
    const btns = document.querySelectorAll('[data-testid^="versions-set-default-"]');
    // Genau einer fuer Core 0.3.8-rc4 — keiner fuer Bootstrapper
    expect(btns.length).toBe(1);
  });
});

describe("ClusterIntentSection — Default-Tausch-Dialog", () => {
  beforeEach(() => {
    // Dialog ruft jetzt direkt getManifestDefaultImpact(target, ...).
    vi.spyOn(apiModule.api.octoboss, "getManifestDefaultImpact").mockResolvedValue({
      target_version: "0.3.8-rc4",
      hub_id: "vdr",
      nodes_total: 2,
      nodes_affected: 1,
      nodes_pinned: 1,
      overrides: [{ node_id: "11111111-1111-1111-1111-111111111111", version: "0.3.8-rc4" }],
      current_default: "0.3.9-rc5.10b",
    });
  });

  it("oeffnet Dialog mit Impact-Vorschau + zeigt pending-Verdict", async () => {
    render(wrap(<ClusterIntentSection inventory={INV_GREEN} hubId="vdr" />));
    fireEvent.click(
      document.querySelector('[data-testid="versions-toggle-core-versionen"]') as HTMLElement,
    );
    const btn = document.querySelector('[data-testid="versions-set-default-0.3.8-rc4"]') as HTMLElement;
    expect(btn).toBeTruthy();
    fireEvent.click(btn);

    await waitFor(() => {
      const dialog = document.querySelector('[data-testid="default-flip-impact"]');
      expect(dialog).toBeTruthy();
    });

    const body = document.body.textContent ?? "";
    expect(body).toContain("Cluster-Betroffenheit");
    expect(body).toContain("Werden umgestellt");
    expect(body).toContain("Pretest");
  });

  it("Apply-Button ist disabled solange kein Pretest GREEN", async () => {
    render(wrap(<ClusterIntentSection inventory={INV_GREEN} hubId="vdr" />));
    fireEvent.click(
      document.querySelector('[data-testid="versions-toggle-core-versionen"]') as HTMLElement,
    );
    fireEvent.click(
      document.querySelector('[data-testid="versions-set-default-0.3.8-rc4"]') as HTMLElement,
    );

    await waitFor(() => {
      const apply = document.querySelector('[data-testid="default-flip-apply"]') as HTMLButtonElement;
      expect(apply).toBeTruthy();
      expect(apply.disabled).toBe(true);
    });
  });
});

describe("ClusterIntentSection — Pin-Dialog", () => {
  it("Klick auf 'festverankern' oeffnet Dialog mit Versions-Dropdown", async () => {
    render(wrap(<ClusterIntentSection inventory={INV_GREEN} hubId="vdr" />));
    const pinBtn = document.querySelector(
      '[data-testid="override-pin-22222222-2222-2222-2222-222222222222"]',
    ) as HTMLElement;
    expect(pinBtn).toBeTruthy();
    fireEvent.click(pinBtn);

    await waitFor(() => {
      const sel = document.querySelector('[data-testid="pin-version-select"]') as HTMLSelectElement;
      expect(sel).toBeTruthy();
      // Beide Core-Versionen muessen im Dropdown stehen
      const options = Array.from(sel.options).map((o) => o.value);
      expect(options).toContain("0.3.8-rc4");
      expect(options).toContain("0.3.9-rc5.10b");
    });

    // Bei nicht-gepinnter Node sollte "Pinning entfernen" NICHT auftauchen
    expect(document.querySelector('[data-testid="pin-unpin"]')).toBeFalsy();
  });

  it("gepinnte Node zeigt zusaetzlich 'Pinning entfernen'-Button", async () => {
    render(wrap(<ClusterIntentSection inventory={INV_GREEN} hubId="vdr" />));
    fireEvent.click(
      document.querySelector(
        '[data-testid="override-pin-11111111-1111-1111-1111-111111111111"]',
      ) as HTMLElement,
    );
    await waitFor(() => {
      expect(document.querySelector('[data-testid="pin-unpin"]')).toBeTruthy();
    });
  });
});

// ── Bootstrapper-Admin freigeschaltet (OctoBoss-CR 2026-05-23) ─────────────────

describe("ClusterIntentSection — Bootstrapper entsperrt", () => {
  it("zeigt KEIN 'CR pending' wenn supports_versions_api=true", () => {
    render(wrap(<ClusterIntentSection inventory={INV_BOOTSTRAPPER_ENABLED} hubId="vdr" />));
    const body = document.body.textContent ?? "";
    // Core ist im Fixture supports_versions_api=true, Bootstrapper jetzt auch
    // ⇒ nirgends mehr "CR pending"
    expect(body).not.toContain("CR pending");
    expect(body).not.toContain("2026-05-23-bootstrapper-admin-api");
  });

  it("zeigt 'wartet auf CR'-Hinweis nur fuer alte Hubs (supports_versions_api=false)", () => {
    // INV_GREEN hat bootstrapper.supports_versions_api=false (alter Hub)
    render(wrap(<ClusterIntentSection inventory={INV_GREEN} hubId="vdr" />));
    expect(document.body.textContent ?? "").toContain("CR pending");
  });

  it("Bootstrapper-Versionen bekommen Default-Tausch-Button wenn freigeschaltet", () => {
    render(wrap(<ClusterIntentSection inventory={INV_BOOTSTRAPPER_ENABLED} hubId="vdr" />));
    // Bootstrapper-Liste aufklappen (2 Versionen → eingeklappt)
    const toggle = document.querySelector(
      '[data-testid="versions-toggle-bootstrapper-versionen"]',
    ) as HTMLElement;
    expect(toggle).toBeTruthy();
    fireEvent.click(toggle);
    // Default-Tausch-Button fuer die Nicht-Default-Version 0.3.8-rc4
    const btn = document.querySelector('[data-testid="versions-set-default-0.3.8-rc4"]');
    expect(btn).toBeTruthy();
  });

  it("Bootstrapper-Default-Tausch ruft getManifestDefaultImpact('bootstrapper', ...)", async () => {
    const impactSpy = vi
      .spyOn(apiModule.api.octoboss, "getManifestDefaultImpact")
      .mockResolvedValue({
        target_version: "0.3.8-rc4",
        hub_id: "vdr",
        nodes_total: 2,
        nodes_affected: 1,
        nodes_pinned: 1,
        overrides: [],
        current_default: "0.3.9-rc5",
      });

    render(wrap(<ClusterIntentSection inventory={INV_BOOTSTRAPPER_ENABLED} hubId="vdr" />));
    fireEvent.click(
      document.querySelector('[data-testid="versions-toggle-bootstrapper-versionen"]') as HTMLElement,
    );
    fireEvent.click(
      document.querySelector('[data-testid="versions-set-default-0.3.8-rc4"]') as HTMLElement,
    );

    await waitFor(() => {
      expect(document.querySelector('[data-testid="default-flip-impact"]')).toBeTruthy();
    });
    // Erstes Argument muss "bootstrapper" sein
    expect(impactSpy).toHaveBeenCalledWith("bootstrapper", "0.3.8-rc4", "vdr");
    expect(document.body.textContent ?? "").toContain("Bootstrapper-Default-Version global tauschen");
  });

  it("Bootstrapper-Pin-Dialog setzt Override via setManifestOverride('bootstrapper', ...)", async () => {
    const setSpy = vi
      .spyOn(apiModule.api.octoboss, "setManifestOverride")
      .mockResolvedValue({ ok: true });

    render(wrap(<ClusterIntentSection inventory={INV_BOOTSTRAPPER_ENABLED} hubId="vdr" />));
    // Es gibt zwei Override-Tabellen (Core + Bootstrapper) mit gleicher node_id.
    // Die Bootstrapper-Tabelle ist die zweite — querySelectorAll und [1] nehmen.
    const pinBtns = document.querySelectorAll(
      '[data-testid="override-pin-11111111-1111-1111-1111-111111111111"]',
    );
    // ryzen (node-a) ist im Bootstrapper NICHT gepinnt → "festverankern" in beiden Tabellen
    expect(pinBtns.length).toBe(2);
    fireEvent.click(pinBtns[1] as HTMLElement); // Bootstrapper-Tabelle

    await waitFor(() => {
      expect(document.querySelector('[data-testid="pin-version-select"]')).toBeTruthy();
    });
    fireEvent.click(document.querySelector('[data-testid="pin-apply"]') as HTMLElement);

    await waitFor(() => {
      expect(setSpy).toHaveBeenCalled();
    });
    expect(setSpy.mock.calls[0][0]).toBe("bootstrapper");
  });
});
