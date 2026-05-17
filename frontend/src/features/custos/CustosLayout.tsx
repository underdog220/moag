// CustosLayout — Sub-Tabs [Findings] [Rules] [Audit] fuer das Custos-Feature.

import { NavLink, Outlet } from "react-router-dom";

const SUB_TABS = [
  { to: "findings", label: "Findings" },
  { to: "rules", label: "Regeln" },
  { to: "audit", label: "Audit" },
] as const;

export function CustosLayout() {
  return (
    <div className="flex flex-col" data-testid="custos-layout">
      {/* Sub-Tab-Leiste */}
      <nav
        aria-label="Custos-Navigation"
        className="flex shrink-0 items-center gap-1 border-b border-white/5 bg-bg-subtle px-3"
      >
        {SUB_TABS.map((tab) => (
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

      {/* Sub-Route-Inhalt */}
      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
}

export default CustosLayout;
