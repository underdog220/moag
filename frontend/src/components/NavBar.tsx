// NavBar — MOAG-Hauptnavigation.
// Zwei klar unterschiedliche Top-Achsen: "Übersicht" und "Aktionen".
// Sekundäre System-Links erscheinen nur unter der Übersicht-Achse.

import { NavLink, useLocation } from "react-router-dom";

// Sekundäre System-Links (nur sichtbar wenn Übersicht-Achse aktiv ist)
const SYSTEM_NAV: { to: string; label: string; group: string }[] = [
  { to: "/oberon",       label: "Oberon",       group: "KI" },
  { to: "/octoboss",     label: "OctoBoss",     group: "KI" },
  { to: "/ocrexpert",    label: "OCRexpert",    group: "KI" },
  { to: "/nasdominator", label: "NasDominator", group: "Infra" },
  { to: "/qnapbackup",   label: "qnapbackup",   group: "Infra" },
  { to: "/custos",       label: "Custos",       group: "C&T" },
  { to: "/panopticor",   label: "Panopticor",   group: "C&T" },
  { to: "/settings",     label: "Settings",     group: "" },
];

/** Prüft ob der aktuelle Pfad zur Aktionen-Achse gehört. */
function isAktionenPath(pathname: string): boolean {
  return pathname.startsWith("/aktionen");
}

export function NavBar() {
  const { pathname } = useLocation();
  const aktionenActive = isAktionenPath(pathname);
  // Übersicht-Achse ist aktiv wenn nicht Aktionen-Achse
  const uebersichtActive = !aktionenActive;

  return (
    <nav aria-label="Hauptnavigation" className="shrink-0">
      {/* Erste Zeile: Haupt-Achsen-Buttons */}
      <div className="flex items-center gap-1 border-b border-white/10
                      bg-bg-elevated px-3">
        {/* Achse 1: Übersicht */}
        <NavLink
          to="/"
          end
          data-testid="nav-achse-uebersicht"
          className={() =>
            `relative whitespace-nowrap px-4 py-2.5 text-sm font-semibold
             transition-colors ${
               uebersichtActive
                 ? "text-fg after:absolute after:bottom-0 after:left-2 after:right-2 after:h-0.5 after:bg-brand"
                 : "text-fg-muted hover:text-fg"
             }`
          }
        >
          Übersicht
        </NavLink>

        {/* Achse 2: Aktionen */}
        <NavLink
          to="/aktionen"
          data-testid="nav-achse-aktionen"
          className={({ isActive }) =>
            `relative whitespace-nowrap px-4 py-2.5 text-sm font-semibold
             transition-colors ${
               isActive
                 ? "text-fg after:absolute after:bottom-0 after:left-2 after:right-2 after:h-0.5 after:bg-brand"
                 : "text-fg-muted hover:text-fg"
             }`
          }
        >
          Aktionen
        </NavLink>
      </div>

      {/* Zweite Zeile: Sekundäre System-Links (nur unter Übersicht-Achse) */}
      {uebersichtActive && (
        <div
          className="flex shrink-0 items-center gap-0.5 overflow-x-auto
                     border-b border-white/5 bg-bg-subtle px-3 scrollbar-none"
          aria-label="System-Navigation"
        >
          {SYSTEM_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `relative whitespace-nowrap px-3 py-1.5 text-xs transition-colors ${
                  isActive
                    ? "text-fg after:absolute after:bottom-0 after:left-1 after:right-1 after:h-0.5 after:bg-brand"
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
        </div>
      )}
    </nav>
  );
}

export default NavBar;
