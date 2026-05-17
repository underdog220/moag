// Custos-Feature — Compliance-Rule-Engine-Drilldown.
// Sub-Routen: /custos/findings, /custos/rules, /custos/audit

import { Navigate, Route, Routes } from "react-router-dom";
import { Breadcrumb } from "../../components/Breadcrumb";
import { CustosLayout } from "./CustosLayout";
import { FindingsPage } from "./pages/Findings";
import { RulesPage } from "./pages/Rules";
import { AuditPage } from "./pages/Audit";

export function CustosFeature() {
  return (
    <div className="flex flex-col" data-testid="custos">
      <Breadcrumb />
      <Routes>
        <Route element={<CustosLayout />}>
          <Route index element={<Navigate to="findings" replace />} />
          <Route path="findings" element={<FindingsPage />} />
          <Route path="rules" element={<RulesPage />} />
          <Route path="audit" element={<AuditPage />} />
          <Route path="*" element={<Navigate to="findings" replace />} />
        </Route>
      </Routes>
    </div>
  );
}

export default CustosFeature;
