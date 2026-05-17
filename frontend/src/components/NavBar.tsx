// NavBar — MOAG-Hauptnavigation (ersetzt OCRexpert-TabBar für MOAG-Routen).
// Zeigt Top-Level-Gruppen und -Routen.

import { NavLink } from "react-router-dom";

interface NavItem {
  to: string;
  label: string;
  group?: string;
}

// SonOfSETI 2026-05-17 entfernt — Nodes werden ueber OctoBoss-Drilldown sichtbar.
const NAV_ITEMS: NavItem[] = [
  { to: "/",            label: "Übersicht" },
  { to: "/oberon",      label: "Oberon",       group: "KI" },
  { to: "/octoboss",    label: "OctoBoss",     group: "KI" },
  { to: "/ocrexpert",   label: "OCRexpert",    group: "KI" },
  { to: "/nasdominator",label: "NasDominator", group: "Infra" },
  { to: "/qnapbackup",  label: "qnapbackup",   group: "Infra" },
  { to: "/custos",      label: "Custos",       group: "C&T" },
  { to: "/panopticor",  label: "Panopticor",   group: "C&T" },
  { to: "/settings",    label: "Settings" },
];

export function NavBar() {
  return (
    <nav
      aria-label="Hauptnavigation"
      className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-white/5
                 bg-bg-subtle px-3 scrollbar-none"
    >
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === "/"}
          className={({ isActive }) =>
            `relative whitespace-nowrap px-3 py-2 text-sm transition-colors ${
              isActive
                ? "text-fg after:absolute after:bottom-0 after:left-2 after:right-2 after:h-0.5 after:bg-brand"
                : "text-fg-muted hover:text-fg"
            }`
          }
        >
          {item.label}
          {item.group && (
            <span className="ml-1 text-xxs text-fg-subtle">{item.group}</span>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

export default NavBar;
