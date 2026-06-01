import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NodeDetailPage } from "./NodeDetail";
import * as apiModule from "../../../lib/api";

const MOCK_NODE = {
  node_id: "abc-123",
  hostname: "Ryzenstrike",
  connected: true,
  mode: "IDLE",
  node_pool: "production",
  power_status: "online",
  last_heartbeat: "2026-06-01T20:27:23Z",
  first_seen: "2026-05-27T14:06:28Z",
  last_known_ip: "192.168.200.113",
  mac_address: "",
  platform: "Windows",
  agent_version: "0.3.9-rc5.21",
  vision_capable: true,
  gpu_fallback_detected: false,
  capabilities: ["installer", "hw-monitor", "host-control"],
  hardware: {
    gpu_name: "NVIDIA GeForce RTX 2060 SUPER",
    gpu_load_percent: null,
    cpu_load_percent: null,
    cpu_model: "AMD64 Family 23",
    ram_free_gb: 14.5,
    vram_free_gb: null,
    gpu_present: false,
    gpu_runtime_ready: false,
  },
  ollama: {
    running: true,
    installed_models: ["llama3.1:8b", "llava:13b"],
    active_model: null,
    compute_device: "unknown",
    bind_host: "0.0.0.0",
    port: 11434,
  },
  installed_modules_detail: [
    { name: "host-control", version: "1.5.2", status: "running", direct_port: 18800, pid: 46596, min_core_version: "0.3.9" },
    { name: "hw-monitor", version: "1.1.2", status: "running", port: 54379, pid: 38016 },
  ],
  drift_modules: [],
  alerts: [],
};

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/octoboss/nodes/abc-123"]}>
        <Routes>
          <Route path="/octoboss/nodes/:node_id" element={children} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("NodeDetailPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("rendert Hostname + Panels nach dem Laden", async () => {
    vi.spyOn(apiModule.api.octoboss, "getNode").mockResolvedValue(MOCK_NODE);
    render(<NodeDetailPage />, { wrapper });
    await waitFor(() => {
      expect(screen.getAllByText("Ryzenstrike").length).toBeGreaterThan(0);
      expect(screen.getByText("Identität")).toBeInTheDocument();
      expect(screen.getByText("GPU / KI-Status")).toBeInTheDocument();
    });
  });

  it("zeigt Module-Liste + Ollama-Modelle (echte Felder)", async () => {
    vi.spyOn(apiModule.api.octoboss, "getNode").mockResolvedValue(MOCK_NODE);
    render(<NodeDetailPage />, { wrapper });
    await waitFor(() => {
      // host-control / hw-monitor stehen sowohl in der Modul-Liste als auch
      // als Capability-Chip -> getAllByText (mehrere Treffer erwartet).
      expect(screen.getAllByText("host-control").length).toBeGreaterThan(0);
      expect(screen.getAllByText("hw-monitor").length).toBeGreaterThan(0);
      expect(screen.getByText("llama3.1:8b")).toBeInTheDocument();
      expect(screen.getByText("llava:13b")).toBeInTheDocument();
    });
  });

  it("zeigt Core-Version (agent_version)", async () => {
    vi.spyOn(apiModule.api.octoboss, "getNode").mockResolvedValue(MOCK_NODE);
    render(<NodeDetailPage />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText("0.3.9-rc5.21")).toBeInTheDocument();
    });
  });
});
