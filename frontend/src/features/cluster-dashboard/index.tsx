// Feature: Cluster-Dashboard (Subagent C)
// Stapelt Hub-Multi-Tabelle + Engine-Matrix + GPU-Bars + Modul-Versionen +
// Round-Robin + Edge-Log und triggert WS-basierte Cache-Invalidierung.

import { ClusterDashboard } from "./ClusterDashboard";
import { PageBadge } from "../../components/PageBadge";

export { ClusterDashboard } from "./ClusterDashboard";
export { EngineMatrix } from "./EngineMatrix";
export { GpuLiveBars } from "./GpuLiveBars";
export { ModuleVersionsTable } from "./ModuleVersionsTable";
export { RoundRobinBar } from "./RoundRobinBar";
export { EdgeLogTail } from "./EdgeLogTail";

export default function ClusterDashboardPage() {
  return (
    <>
      <ClusterDashboard />
      <PageBadge id="gui.dashboard" />
    </>
  );
}
