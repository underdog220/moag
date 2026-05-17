// OberonLayout — Sub-Tab-Navigation + internes Routing fuer alle Oberon-Drilldown-Bereiche.
//
// Verwendet intern <Routes> (kompatibel mit <Route path="/oberon/*" element={<OberonFeature />} />
// in App.tsx) — keine Aenderung an App.tsx noetig.
//
// Sub-Tabs: Providers · Kosten · Audit · Smoke · Instanzen · PII-Tuning · DB-Broker · Kontrakt

import { Navigate, NavLink, Route, Routes } from "react-router-dom";
import { Breadcrumb } from "../../components/Breadcrumb";
import { Tooltip } from "../../components/Tooltip";
import { ProvidersPage } from "./pages/Providers";
import { CostPage } from "./pages/Cost";
import { AuditPage } from "./pages/Audit";
import { SmokePage } from "./pages/Smoke";
import { InstancesPage } from "./pages/Instances";
import { PiiTuningPage } from "./pages/PiiTuning";
import { DbBrokerPage } from "./pages/DbBroker";
import { ContractPage } from "./pages/Contract";

interface SubTab {
  to: string;
  label: string;
  tooltip: string;
}

const SUB_TABS: SubTab[] = [
  { to: "providers",  label: "Provider",   tooltip: "LLM-Provider mit Health, Latenz und Modell-Profilen — GET /api/v1/oberon/providers" },
  { to: "cost",       label: "Kosten",     tooltip: "Aggregierte Kostenauswertung nach Client, Modell oder Tag — GET /api/v1/oberon/cost" },
  { to: "audit",      label: "Audit",      tooltip: "DSGVO-Audit-Event-Stream mit PII-Filter — GET /api/v1/oberon/audit" },
  { to: "smoke",      label: "Smoke",      tooltip: "Live-Health-Snapshot aller 6 Sub-Checks — GET /api/v1/oberon/smoke" },
  { to: "instances",  label: "Instanzen",  tooltip: "Aktive DevLoop/Chat-Sessions auf Oberon — GET /api/v1/oberon/instances" },
  { to: "pii-tuning", label: "PII-Tuning", tooltip: "PII-Erkennungs-Konfiguration der DSGVO-Engine — GET /api/v1/oberon/pii-tuning" },
  { to: "db-broker",  label: "DB-Broker",  tooltip: "Status der via Oberon-Broker provisionierten Datenbanken — GET /api/v1/oberon/db-broker/status" },
  { to: "contract",   label: "Kontrakt",   tooltip: "API-Kontrakt und verfuegbare Capabilities — GET /api/v1/oberon/contract/capabilities" },
];

export function OberonLayout() {
  return (
    <div className="flex flex-col">
      <Breadcrumb />

      {/* Sub-Tab-Navigation — dezent, kein Eingriff in globale NavBar */}
      <nav
        aria-label="Oberon-Unterbereiche"
        className="flex shrink-0 overflow-x-auto scrollbar-none gap-1
                   border-b border-white/5 bg-bg-subtle px-3 py-1"
      >
        {SUB_TABS.map((tab) => (
          <Tooltip
            key={tab.to}
            title={tab.tooltip}
            source={`GET /api/v1/oberon/${tab.to}`}
          >
            <NavLink
              to={tab.to}
              className={({ isActive }) =>
                `rounded-md whitespace-nowrap px-3 py-2.5 text-xs font-medium
                 min-h-[44px] flex items-center transition-colors ${
                  isActive
                    ? "bg-brand/15 text-brand"
                    : "text-fg-muted hover:bg-white/5 hover:text-fg"
                }`
              }
            >
              {tab.label}
            </NavLink>
          </Tooltip>
        ))}
      </nav>

      {/* Sub-Route-Inhalt */}
      <div className="flex-1 overflow-auto">
        <Routes>
          <Route index element={<Navigate to="providers" replace />} />
          <Route path="providers"  element={<ProvidersPage />} />
          <Route path="cost"       element={<CostPage />} />
          <Route path="audit"      element={<AuditPage />} />
          <Route path="smoke"      element={<SmokePage />} />
          <Route path="instances"  element={<InstancesPage />} />
          <Route path="pii-tuning" element={<PiiTuningPage />} />
          <Route path="db-broker"  element={<DbBrokerPage />} />
          <Route path="contract"   element={<ContractPage />} />
          <Route path="*"          element={<Navigate to="providers" replace />} />
        </Routes>
      </div>
    </div>
  );
}

export default OberonLayout;
