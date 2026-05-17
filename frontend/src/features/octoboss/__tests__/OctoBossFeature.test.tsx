// Smoke-Tests fuer OctoBoss-Feature-Pages.
// 1 Test pro Page + 1 fuer OctoBossLayout.

import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import type { ReactNode } from "react";

import { OctoBossLayout } from "../index";
import { NodesPage } from "../pages/Nodes";
import { NodeDetailPage } from "../pages/NodeDetail";
import { JobsPage } from "../pages/Jobs";
import { AssetsPage } from "../pages/Assets";
import { ClusterPage } from "../pages/Cluster";
import { OcrPage } from "../pages/Ocr";
import { LlmModelsPage } from "../pages/LlmModels";
import * as apiModule from "../../../lib/api";

// ── Test-Helpers ───────────────────────────────────────────────────────────────

function makeQC() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchInterval: false, staleTime: 0 },
    },
  });
}

function wrap(node: ReactNode, initialPath = "/octoboss/nodes") {
  return (
    <MemoryRouter initialEntries={[initialPath]}>
      <QueryClientProvider client={makeQC()}>{node}</QueryClientProvider>
    </MemoryRouter>
  );
}

// Minimale Mock-Daten
const MOCK_NODE = {
  node_id: "node-abc",
  hostname: "testhost",
  connected: true,
  mode: "ACTIVE",
  last_heartbeat: new Date().toISOString(),
  last_known_ip: "192.168.1.10",
  hardware: {
    gpu_name: "RTX 3090",
    gpu_load_percent: 45.0,
    cpu_load_percent: 20.0,
    cpu_model: "AMD Ryzen 9",
    ram_free_gb: 12.5,
    vram_free_gb: 18.0,
  },
  ollama: { running: true, models: ["llama3.2:3b"], version: "0.3.0" },
  modules: [{ name: "ocr", version: "1.0" }],
  engines: ["tesseract"],
};

const MOCK_JOB = {
  id: "job-001",
  state: "done",
  workload_type: "llm_inference",
  target_node_id: "node-abc",
  created_at: new Date().toISOString(),
  error: null,
};

const MOCK_ASSET = {
  name: "llama3.2:3b",
  type: "model",
  size_bytes: 2_000_000_000,
  node_id: "node-abc",
  path: "/data/models/llama3.2",
  created_at: new Date().toISOString(),
};

const MOCK_ACTIONS: import("../../../lib/types").ActionsResponse = {
  actions: [
    {
      action_id: "octoboss.cluster.status",
      system_id: "octoboss",
      name: "Cluster-Status prüfen",
      description: "Fragt den Cluster-Status ab.",
      category: "diagnose" as const,
      sub_area: "cluster",
      requires_confirm: false,
      is_destructive: false,
      estimated_duration_s: 5,
      implemented: true,
    },
    {
      action_id: "octoboss.ollama.pull",
      system_id: "octoboss",
      name: "Ollama-Modell pullen",
      description: "Lädt ein Modell auf alle Nodes.",
      category: "operation" as const,
      sub_area: "ollama",
      requires_confirm: false,
      is_destructive: false,
      estimated_duration_s: 20,
      implemented: true,
    },
    {
      action_id: "octoboss.bench.start",
      system_id: "octoboss",
      name: "LLM-Benchmark starten",
      description: "Startet einen Benchmark.",
      category: "diagnose" as const,
      sub_area: "bench",
      requires_confirm: false,
      is_destructive: false,
      estimated_duration_s: 15,
      implemented: true,
    },
  ],
  fetched_at: new Date().toISOString(),
};

// ── OctoBossLayout ────────────────────────────────────────────────────────────

describe("OctoBossLayout", () => {
  it("rendert alle Sub-Tab-Labels", () => {
    render(
      wrap(
        <Routes>
          <Route path="octoboss/*" element={<OctoBossLayout />} />
        </Routes>,
      ),
    );
    expect(screen.getByText("Nodes")).toBeInTheDocument();
    expect(screen.getByText("Jobs")).toBeInTheDocument();
    expect(screen.getByText("Assets")).toBeInTheDocument();
    expect(screen.getByText("Cluster")).toBeInTheDocument();
    expect(screen.getByText("OCR")).toBeInTheDocument();
    expect(screen.getByText("LLM-Models")).toBeInTheDocument();
  });

  it("hat aria-label auf der Nav", () => {
    render(
      wrap(
        <Routes>
          <Route path="octoboss/*" element={<OctoBossLayout />} />
        </Routes>,
      ),
    );
    expect(
      screen.getByRole("navigation", { name: "OctoBoss Sub-Navigation" }),
    ).toBeInTheDocument();
  });
});

// ── NodesPage ─────────────────────────────────────────────────────────────────

describe("NodesPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("rendert ohne Crash und zeigt Überschrift", async () => {
    vi.spyOn(apiModule.api.octoboss, "getNodes").mockResolvedValue([MOCK_NODE]);
    render(wrap(<NodesPage />));
    expect(screen.getByText("Nodes")).toBeInTheDocument();
  });

  it("zeigt Node-Hostname nach Laden", async () => {
    vi.spyOn(apiModule.api.octoboss, "getNodes").mockResolvedValue([MOCK_NODE]);
    render(wrap(<NodesPage />));
    await waitFor(() => {
      expect(screen.getByText("testhost")).toBeInTheDocument();
    });
  });

  it("zeigt Leermeldung wenn keine Nodes", async () => {
    vi.spyOn(apiModule.api.octoboss, "getNodes").mockResolvedValue([]);
    render(wrap(<NodesPage />));
    await waitFor(() => {
      expect(screen.getByText("Keine Nodes registriert.")).toBeInTheDocument();
    });
  });

  it("hat PageBadge", async () => {
    vi.spyOn(apiModule.api.octoboss, "getNodes").mockResolvedValue([]);
    render(wrap(<NodesPage />));
    expect(document.querySelector('[data-testid="page-badge"]')).not.toBeNull();
  });
});

// ── NodeDetailPage ────────────────────────────────────────────────────────────

describe("NodeDetailPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("rendert ohne Crash mit node_id", async () => {
    vi.spyOn(apiModule.api.octoboss, "getNode").mockResolvedValue(MOCK_NODE);
    render(
      <MemoryRouter initialEntries={["/octoboss/nodes/node-abc"]}>
        <QueryClientProvider client={makeQC()}>
          <Routes>
            <Route path="/octoboss/nodes/:node_id" element={<NodeDetailPage />} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    );
    await waitFor(() => {
      // "testhost" erscheint mehrfach (h2-Titel + Tabellen-Zelle) — getAllByText verwenden
      expect(screen.getAllByText("testhost").length).toBeGreaterThan(0);
    });
  });

  it("hat PageBadge", async () => {
    vi.spyOn(apiModule.api.octoboss, "getNode").mockResolvedValue(MOCK_NODE);
    render(
      <MemoryRouter initialEntries={["/octoboss/nodes/node-abc"]}>
        <QueryClientProvider client={makeQC()}>
          <Routes>
            <Route path="/octoboss/nodes/:node_id" element={<NodeDetailPage />} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    );
    expect(document.querySelector('[data-testid="page-badge"]')).not.toBeNull();
  });
});

// ── JobsPage ─────────────────────────────────────────────────────────────────

describe("JobsPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("rendert ohne Crash und zeigt Überschrift", async () => {
    vi.spyOn(apiModule.api.octoboss, "getJobs").mockResolvedValue([MOCK_JOB]);
    render(wrap(<JobsPage />));
    expect(screen.getByText("Jobs")).toBeInTheDocument();
  });

  it("zeigt Job-Daten nach Laden", async () => {
    vi.spyOn(apiModule.api.octoboss, "getJobs").mockResolvedValue([MOCK_JOB]);
    render(wrap(<JobsPage />));
    await waitFor(() => {
      expect(screen.getByText("job-001")).toBeInTheDocument();
    });
  });

  it("zeigt State-Filter-Dropdown", () => {
    vi.spyOn(apiModule.api.octoboss, "getJobs").mockResolvedValue([]);
    render(wrap(<JobsPage />));
    expect(screen.getByText("State:")).toBeInTheDocument();
  });

  it("hat PageBadge", () => {
    vi.spyOn(apiModule.api.octoboss, "getJobs").mockResolvedValue([]);
    render(wrap(<JobsPage />));
    expect(document.querySelector('[data-testid="page-badge"]')).not.toBeNull();
  });
});

// ── AssetsPage ────────────────────────────────────────────────────────────────

describe("AssetsPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("rendert ohne Crash und zeigt Überschrift", async () => {
    vi.spyOn(apiModule.api.octoboss, "getAssets").mockResolvedValue([MOCK_ASSET]);
    render(wrap(<AssetsPage />));
    expect(screen.getByText("Assets")).toBeInTheDocument();
  });

  it("zeigt Asset-Name nach Laden", async () => {
    vi.spyOn(apiModule.api.octoboss, "getAssets").mockResolvedValue([MOCK_ASSET]);
    render(wrap(<AssetsPage />));
    await waitFor(() => {
      expect(screen.getByText("llama3.2:3b")).toBeInTheDocument();
    });
  });

  it("zeigt Typ-Filter-Dropdown", () => {
    vi.spyOn(apiModule.api.octoboss, "getAssets").mockResolvedValue([]);
    render(wrap(<AssetsPage />));
    expect(screen.getByText("Typ:")).toBeInTheDocument();
  });

  it("hat PageBadge", () => {
    vi.spyOn(apiModule.api.octoboss, "getAssets").mockResolvedValue([]);
    render(wrap(<AssetsPage />));
    expect(document.querySelector('[data-testid="page-badge"]')).not.toBeNull();
  });
});

// ── ClusterPage ───────────────────────────────────────────────────────────────

describe("ClusterPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("rendert ohne Crash und zeigt Überschrift", async () => {
    vi.spyOn(apiModule.api.octoboss, "getClusterStatus").mockResolvedValue({ mode: "primary", cluster_id: "c1", peer_count: 2 });
    vi.spyOn(apiModule.api.octoboss, "getClusterPeers").mockResolvedValue([]);
    vi.spyOn(apiModule.api, "getActions").mockResolvedValue(MOCK_ACTIONS);
    render(wrap(<ClusterPage />));
    expect(screen.getByText("Cluster")).toBeInTheDocument();
  });

  it("zeigt ActionCard für cluster.status", async () => {
    vi.spyOn(apiModule.api.octoboss, "getClusterStatus").mockResolvedValue({});
    vi.spyOn(apiModule.api.octoboss, "getClusterPeers").mockResolvedValue([]);
    vi.spyOn(apiModule.api, "getActions").mockResolvedValue(MOCK_ACTIONS);
    render(wrap(<ClusterPage />));
    await waitFor(() => {
      expect(screen.getByText("Cluster-Status prüfen")).toBeInTheDocument();
    });
  });

  it("hat PageBadge", () => {
    vi.spyOn(apiModule.api.octoboss, "getClusterStatus").mockResolvedValue({});
    vi.spyOn(apiModule.api.octoboss, "getClusterPeers").mockResolvedValue([]);
    vi.spyOn(apiModule.api, "getActions").mockResolvedValue(MOCK_ACTIONS);
    render(wrap(<ClusterPage />));
    expect(document.querySelector('[data-testid="page-badge"]')).not.toBeNull();
  });
});

// ── OcrPage ───────────────────────────────────────────────────────────────────

describe("OcrPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("rendert ohne Crash und zeigt Überschrift", async () => {
    vi.spyOn(apiModule.api.octoboss, "getOcrStatus").mockResolvedValue({ status: "ok", version: "1.0.0" });
    render(wrap(<OcrPage />));
    expect(screen.getByText("OCR-Gateway")).toBeInTheDocument();
  });

  it("zeigt Status-Badge nach Laden", async () => {
    vi.spyOn(apiModule.api.octoboss, "getOcrStatus").mockResolvedValue({ status: "ok", version: "1.0.0" });
    render(wrap(<OcrPage />));
    await waitFor(() => {
      expect(screen.getByText("ok")).toBeInTheDocument();
    });
  });

  it("hat PageBadge", () => {
    vi.spyOn(apiModule.api.octoboss, "getOcrStatus").mockResolvedValue({});
    render(wrap(<OcrPage />));
    expect(document.querySelector('[data-testid="page-badge"]')).not.toBeNull();
  });
});

// ── LlmModelsPage ─────────────────────────────────────────────────────────────

describe("LlmModelsPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("rendert ohne Crash und zeigt Überschrift", async () => {
    vi.spyOn(apiModule.api.octoboss, "getLlmModels").mockResolvedValue({ data: [] });
    vi.spyOn(apiModule.api, "getActions").mockResolvedValue(MOCK_ACTIONS);
    render(wrap(<LlmModelsPage />));
    expect(screen.getByText("LLM-Modelle")).toBeInTheDocument();
  });

  it("zeigt ActionCards für ollama.pull und bench.start", async () => {
    vi.spyOn(apiModule.api.octoboss, "getLlmModels").mockResolvedValue({ data: [] });
    vi.spyOn(apiModule.api, "getActions").mockResolvedValue(MOCK_ACTIONS);
    render(wrap(<LlmModelsPage />));
    await waitFor(() => {
      expect(screen.getByText("Ollama-Modell pullen")).toBeInTheDocument();
      expect(screen.getByText("LLM-Benchmark starten")).toBeInTheDocument();
    });
  });

  it("zeigt Modell-Tabelle wenn Daten vorhanden", async () => {
    vi.spyOn(apiModule.api.octoboss, "getLlmModels").mockResolvedValue({
      data: [{ id: "llama3.2:3b", object: "model", created: 1700000000, owned_by: "ollama" }],
    });
    vi.spyOn(apiModule.api, "getActions").mockResolvedValue(MOCK_ACTIONS);
    render(wrap(<LlmModelsPage />));
    await waitFor(() => {
      expect(screen.getByText("llama3.2:3b")).toBeInTheDocument();
    });
  });

  it("hat PageBadge", () => {
    vi.spyOn(apiModule.api.octoboss, "getLlmModels").mockResolvedValue({ data: [] });
    vi.spyOn(apiModule.api, "getActions").mockResolvedValue(MOCK_ACTIONS);
    render(wrap(<LlmModelsPage />));
    expect(document.querySelector('[data-testid="page-badge"]')).not.toBeNull();
  });
});
