// OCRexpert-Feature — Wrapper für OCRexpert-Drilldown.
// Sub-Routen: /ocrexpert/jobs, /ocrexpert/history, /ocrexpert/charts

import { Navigate, Route, Routes } from "react-router-dom";
import { PageBadge } from "../../components/PageBadge";
import { Breadcrumb } from "../../components/Breadcrumb";
import JobsPage from "../job-queue";
import HistoryPage from "../history";
import ChartsPage from "../charts";

export function OCRexpertFeature() {
  return (
    <div className="flex flex-col">
      <Breadcrumb />
      <div className="flex-1">
        <Routes>
          <Route index element={<Navigate to="jobs" replace />} />
          <Route path="jobs" element={<JobsPage />} />
          <Route path="jobs/:jobId" element={<JobsPage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="charts" element={<ChartsPage />} />
          <Route path="*" element={<Navigate to="jobs" replace />} />
        </Routes>
      </div>
      <PageBadge id="ocrexpert" />
    </div>
  );
}

export default OCRexpertFeature;
