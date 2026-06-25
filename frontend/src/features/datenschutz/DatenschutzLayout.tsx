// DatenschutzLayout — Feature-Shell fuer /datenschutz/*.
// Enthaelt Breadcrumb + internes Routing mit Sub-Tabs.
// In App.tsx eingebunden als <Route path="/datenschutz/*" element={<DatenschutzFeature />} />.

import { Navigate, NavLink, Route, Routes } from "react-router-dom";
import { Breadcrumb } from "../../components/Breadcrumb";
import { Tooltip } from "../../components/Tooltip";
import { KonzeptPage } from "./pages/KonzeptPage";

interface SubTab {
  to: string;
  label: string;
  tooltip: string;
}

const SUB_TABS: SubTab[] = [
  {
    to: "konzept",
    label: "Konzept",
    tooltip:
      "Aktuelles Datenschutzkonzept mit Prosa, Claims, Quellen und Problem-Flags — GET /api/v1/oberon/datenschutz-konzept",
  },
];

export function DatenschutzLayout() {
  return (
    <div className="flex flex-col">
      <Breadcrumb />

      {/* Sub-Tab-Navigation */}
      <nav
        aria-label="Datenschutz-Unterbereiche"
        className="flex shrink-0 overflow-x-auto scrollbar-none gap-1
                   border-b border-white/5 bg-bg-subtle px-3 py-1"
      >
        {SUB_TABS.map((tab) => (
          <Tooltip
            key={tab.to}
            title={tab.tooltip}
            source={`GET /api/v1/oberon/datenschutz-${tab.to}`}
          >
            <NavLink
              to={tab.to}
              className={({ isActive }) =>
                `rounded-md whitespace-nowrap px-3 py-2.5 text-xs font-medium
                 min-h-[44px] flex items-center transition-colors ${
                   isActive
                     ? "bg-accent/15 text-accent border border-accent/20"
                     : "text-fg-muted hover:text-fg hover:bg-bg-elevated/30 border border-transparent"
                 }`
              }
            >
              {tab.label}
            </NavLink>
          </Tooltip>
        ))}
      </nav>

      {/* Internes Routing */}
      <div className="flex-1">
        <Routes>
          <Route index element={<Navigate to="konzept" replace />} />
          <Route path="konzept" element={<KonzeptPage />} />
          <Route path="*" element={<Navigate to="konzept" replace />} />
        </Routes>
      </div>
    </div>
  );
}

export default DatenschutzLayout;
