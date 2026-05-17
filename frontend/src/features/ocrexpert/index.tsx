// OCRexpert-Feature — Wrapper fuer OCRexpert-Drilldown.
// Sub-Routen: /ocrexpert/jobs, /ocrexpert/history, /ocrexpert/charts,
//             /ocrexpert/capabilities, /ocrexpert/logs

import { NavLink, Navigate, Route, Routes, useResolvedPath } from "react-router-dom";
import { PageBadge } from "../../components/PageBadge";
import { Breadcrumb } from "../../components/Breadcrumb";
import JobsPage from "../job-queue";
import HistoryPage from "../history";
import ChartsPage from "../charts";
import { CapabilitiesPage } from "./pages/Capabilities";
import { LogsPage } from "./pages/Logs";

// ─── Sub-Nav-Tab-Leiste ───────────────────────────────────────────────────────

const TABS = [
  { to: "jobs",         label: "Jobs" },
  { to: "history",      label: "History" },
  { to: "charts",       label: "Charts" },
  { to: "capabilities", label: "Capabilities" },
  { to: "logs",         label: "Logs" },
] as const;

function OcrSubNav() {
  const base = useResolvedPath("").pathname;

  return (
    <nav
      aria-label="OCRexpert Sub-Navigation"
      className="flex gap-0.5 border-b border-white/10 bg-bg-subtle px-4 pt-2"
    >
      {TABS.map(({ to, label }) => (
        <NavLink
          key={to}
          to={`${base}/${to}`}
          className={({ isActive }) =>
            `rounded-t border border-b-0 px-3 py-1.5 text-xs font-medium transition-colors ${
              isActive
                ? "border-white/15 bg-bg-panel text-fg"
                : "border-transparent text-fg-muted hover:text-fg"
            }`
          }
        >
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

// ─── Feature-Wrapper ──────────────────────────────────────────────────────────

export function OCRexpertFeature() {
  return (
    <div className="flex flex-col">
      <Breadcrumb />
      <OcrSubNav />
      <div className="flex-1">
        <Routes>
          <Route index element={<Navigate to="jobs" replace />} />
          <Route path="jobs" element={<JobsPage />} />
          <Route path="jobs/:jobId" element={<JobsPage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="charts" element={<ChartsPage />} />
          <Route path="capabilities" element={<CapabilitiesPage />} />
          <Route path="logs" element={<LogsPage />} />
          <Route path="*" element={<Navigate to="jobs" replace />} />
        </Routes>
      </div>
      <PageBadge id="ocrexpert" />
    </div>
  );
}

export default OCRexpertFeature;
