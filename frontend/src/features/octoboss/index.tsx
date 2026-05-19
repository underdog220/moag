// OctoBoss-Feature — Layout mit Sub-Tab-Navigation.
// Sub-Routen: /octoboss/nodes, /nodes/:node_id, /jobs, /assets, /cluster, /ocr, /llm-models
// Ersetzte: alte Dashboard/Cluster-Weiterleitung (2026-05-17)

import { NavLink, Outlet, Route, Routes, Navigate } from "react-router-dom";
import { PageBadge } from "../../components/PageBadge";
import { NodesPage } from "./pages/Nodes";
import { NodeDetailPage } from "./pages/NodeDetail";
import { JobsPage } from "./pages/Jobs";
import { AssetsPage } from "./pages/Assets";
import { ClusterPage } from "./pages/Cluster";
import { OcrPage } from "./pages/Ocr";
import { LlmModelsPage } from "./pages/LlmModels";
import { ManifestHealthPage } from "./pages/ManifestHealth";
import { BenchmarksPage } from "./pages/Benchmarks";

// Sub-Tab-Definitionen
const TABS = [
  { to: "nodes",           label: "Nodes" },
  { to: "jobs",            label: "Jobs" },
  { to: "assets",          label: "Assets" },
  { to: "cluster",         label: "Cluster" },
  { to: "ocr",             label: "OCR" },
  { to: "llm-models",      label: "LLM-Models" },
  { to: "manifest-health", label: "Manifest-Health" },
  { to: "benchmarks",      label: "Benchmarks" },
] as const;

// Layout mit Sub-Tab-Leiste und Outlet
export function OctoBossLayout() {
  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Sub-Tab-Navigation */}
      <nav
        className="flex gap-1 border-b border-white/10 pb-0 overflow-x-auto scrollbar-none"
        aria-label="OctoBoss Sub-Navigation"
      >
        {TABS.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `px-3 py-2.5 text-sm font-medium transition-colors rounded-t
               border-b-2 -mb-px whitespace-nowrap min-h-[44px] flex items-center
               ${isActive
                 ? "border-brand text-brand"
                 : "border-transparent text-fg-muted hover:text-fg hover:border-white/20"
               }`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Seiten-Inhalt */}
      <div className="flex-1">
        <Outlet />
      </div>

      <PageBadge id="octoboss" />
    </div>
  );
}

// Routes-Wrapper für den eingebetteten Routing-Modus (wird von App.tsx genutzt)
export function OctoBossFeature() {
  return (
    <Routes>
      <Route element={<OctoBossLayout />}>
        <Route index element={<Navigate to="nodes" replace />} />
        <Route path="nodes" element={<NodesPage />} />
        <Route path="nodes/:node_id" element={<NodeDetailPage />} />
        <Route path="jobs" element={<JobsPage />} />
        <Route path="assets" element={<AssetsPage />} />
        <Route path="cluster" element={<ClusterPage />} />
        <Route path="ocr" element={<OcrPage />} />
        <Route path="llm-models" element={<LlmModelsPage />} />
        <Route path="manifest-health" element={<ManifestHealthPage />} />
        <Route path="benchmarks" element={<BenchmarksPage />} />
        <Route path="*" element={<Navigate to="nodes" replace />} />
      </Route>
    </Routes>
  );
}

export default OctoBossFeature;
