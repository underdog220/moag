// OctoBoss-Feature — Wrapper für OctoBoss-Drilldown.
// Sub-Routen: /octoboss/dashboard, /octoboss/cluster

import { Navigate, Route, Routes } from "react-router-dom";
import { PageBadge } from "../../components/PageBadge";
import { Breadcrumb } from "../../components/Breadcrumb";
import DashboardPage from "../cluster-dashboard";
import ClusterPage from "../cluster";

export function OctoBossFeature() {
  return (
    <div className="flex flex-col">
      <Breadcrumb />
      <div className="flex-1">
        <Routes>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="cluster" element={<ClusterPage />} />
          <Route path="*" element={<Navigate to="dashboard" replace />} />
        </Routes>
      </div>
      <PageBadge id="octoboss" />
    </div>
  );
}

export default OctoBossFeature;
