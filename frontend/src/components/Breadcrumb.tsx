// Breadcrumb — Navigations-Pfad-Anzeige, z.B. "MOAG > Oberon > LLM > Anthropic".
// Liest aktuelle Route aus react-router-dom, zerlegt sie in Segmente mit Klick-Navigation.

import { Link, useLocation } from "react-router-dom";

// Segment-Label-Mapping: Route-Segment → lesbarer Name
const SEGMENT_LABELS: Record<string, string> = {
  "":           "MOAG",
  overview:     "Übersicht",
  oberon:       "Oberon",
  octoboss:     "OctoBoss",
  sonofseti:    "SonOfSETI",
  ocrexpert:    "OCRexpert",
  nasdominator: "NasDominator",
  qnapbackup:   "qnapbackup",
  custos:       "Custos",
  panopticor:   "Panopticor",
  settings:     "Einstellungen",
  dashboard:    "Dashboard",
  jobs:         "Jobs",
  history:      "History",
  charts:       "Charts",
  cluster:      "Cluster",
  llm:          "LLM",
  cost:         "Kosten",
  audit:        "Audit",
  smoke:        "Smoke",
};

function labelFor(segment: string): string {
  return SEGMENT_LABELS[segment] ?? segment;
}

export function Breadcrumb() {
  const location = useLocation();

  // Pfad in Segmente zerlegen
  const segments = location.pathname.split("/").filter(Boolean);

  // Crumbs aufbauen: erstes Element ist immer "MOAG" mit Pfad "/"
  const crumbs: { label: string; path: string }[] = [
    { label: "MOAG", path: "/" },
  ];

  let accumulated = "";
  for (const seg of segments) {
    accumulated += `/${seg}`;
    crumbs.push({ label: labelFor(seg), path: accumulated });
  }

  if (crumbs.length <= 1) return null; // Nur auf Unterseiten anzeigen

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center gap-1 border-b border-white/5 bg-bg-subtle px-4 py-1.5 text-xs text-fg-muted"
      data-testid="breadcrumb"
    >
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <span key={crumb.path} className="flex items-center gap-1">
            {i > 0 && <span className="text-fg-subtle">›</span>}
            {isLast ? (
              <span className="text-fg" aria-current="page">
                {crumb.label}
              </span>
            ) : (
              <Link
                to={crumb.path}
                className="hover:text-fg"
              >
                {crumb.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}

export default Breadcrumb;
