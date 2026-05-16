// Feature: Job-Detail (Subagent E)
// Re-Export der Komponenten + Default-Page-Komponente fuer das Routing.
// Wird von features/job-queue/index.tsx eingebettet wenn die Route /jobs/:jobId aktiv ist.

import { useParams } from "react-router-dom";
import { JobDetailEmpty, JobDetailPanel } from "./JobDetailPanel";

export { AbCompareView } from "./AbCompareView";
export { ConfidenceHeatmap } from "./ConfidenceHeatmap";
export { DoctypeBadge } from "./DoctypeBadge";
export { EngineConsensusHeatmap } from "./EngineConsensusHeatmap";
export { JobDetailEmpty, JobDetailPanel } from "./JobDetailPanel";
export { PdfPreview } from "./PdfPreview";
export { PiiList } from "./PiiList";
export { RecognizedText } from "./RecognizedText";
export { RoutingTrace } from "./RoutingTrace";

/**
 * Default-Export: Lazy-Wrapper, der die Job-ID aus der Route holt.
 * Fallbacks zur leeren Variante wenn keine ID gesetzt ist.
 */
export default function JobDetail() {
  const params = useParams<{ jobId?: string }>();
  if (!params.jobId) return <JobDetailEmpty />;
  return <JobDetailPanel jobId={params.jobId} />;
}
