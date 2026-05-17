// NasDominator-Feature — Drilldown mit Sub-Tabs: Services | Metriken | Container
// Phase 3: echte HTTP-Anbindung an FastAPI Port 9090 auf QNAP-NAS.

import { Navigate, Route, Routes } from "react-router-dom";
import { NasDominatorLayout } from "./NasDominatorLayout";
import ServicesPage from "./pages/Services";
import MetricsPage from "./pages/Metrics";
import ContainerPage from "./pages/Container";

export function NasDominatorFeature() {
  return (
    <Routes>
      <Route element={<NasDominatorLayout />}>
        <Route index element={<Navigate to="services" replace />} />
        <Route path="services" element={<ServicesPage />} />
        <Route path="metrics" element={<MetricsPage />} />
        <Route path="containers" element={<ContainerPage />} />
        <Route path="*" element={<Navigate to="services" replace />} />
      </Route>
    </Routes>
  );
}

export default NasDominatorFeature;
