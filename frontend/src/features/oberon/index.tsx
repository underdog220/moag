// Oberon-Feature — Wrapper für Oberon-Drilldown.
// Sub-Routen: /oberon/llm, /oberon/cost, /oberon/audit, /oberon/smoke
// Bestehende Feature-Tabs aus OCRexpert-Prototyp werden als Sub-Routen eingebunden.

import { Navigate, Route, Routes } from "react-router-dom";
import { PageBadge } from "../../components/PageBadge";
import { Breadcrumb } from "../../components/Breadcrumb";
import LlmPage from "../llm";
import CostPage from "../cost";
import AuditPage from "../audit";
import SmokePage from "./SmokePage";

export function OberonFeature() {
  return (
    <div className="flex flex-col">
      <Breadcrumb />
      <div className="flex-1">
        <Routes>
          <Route index element={<Navigate to="llm" replace />} />
          <Route path="llm" element={<LlmPage />} />
          <Route path="cost" element={<CostPage />} />
          <Route path="audit" element={<AuditPage />} />
          <Route path="smoke" element={<SmokePage />} />
          <Route path="*" element={<Navigate to="llm" replace />} />
        </Routes>
      </div>
      <PageBadge id="oberon" />
    </div>
  );
}

export default OberonFeature;
