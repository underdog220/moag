// NasDominator-Layout — Sub-Tabs: Services | Metriken | Container
// Wraps alle NasDominator-Unterseiten in ein einheitliches Tab-Layout.

import { NavLink, Outlet } from "react-router-dom";
import { Breadcrumb } from "../../components/Breadcrumb";

const TABS = [
  { label: "Services", to: "services" },
  { label: "Metriken", to: "metrics" },
  { label: "Container", to: "containers" },
] as const;

export function NasDominatorLayout() {
  return (
    <div className="flex flex-col min-h-0 flex-1">
      <Breadcrumb />
      <div className="flex gap-1 border-b border-white/10 px-4 pt-2">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `px-3 py-1.5 text-sm rounded-t transition-colors border-b-2 -mb-px ` +
              (isActive
                ? "border-accent text-fg font-medium"
                : "border-transparent text-fg-muted hover:text-fg hover:border-white/20")
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </div>
      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
}

export default NasDominatorLayout;
