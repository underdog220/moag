// TabBar — horizontale Navigation fuer die 5 Top-Level-Routen.

import { NavLink } from "react-router-dom";

export interface TabItem {
  to: string;
  label: string;
}

const TABS: TabItem[] = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/jobs", label: "Jobs" },
  { to: "/history", label: "History" },
  { to: "/charts", label: "Charts" },
  { to: "/cluster", label: "Cluster" },
  { to: "/llm", label: "LLM" },
  { to: "/cost", label: "Kosten" },
  { to: "/audit", label: "Audit" },
  { to: "/settings", label: "Settings" },
];

export function TabBar() {
  return (
    <nav
      aria-label="Hauptnavigation"
      className="flex shrink-0 items-center gap-1 border-b border-white/5 bg-bg-subtle px-3"
    >
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) =>
            `relative px-3 py-2 text-sm transition-colors ${
              isActive
                ? "text-fg after:absolute after:bottom-0 after:left-2 after:right-2 after:h-0.5 after:bg-brand"
                : "text-fg-muted hover:text-fg"
            }`
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}

export default TabBar;
