// Feature: Jobs-Tab (Route /jobs und /jobs/:jobId).
// Linke Spalte: Drop-Zone (Subagent D), Live-Job-Queue (Subagent D),
// Edge-Log-Tail (Subagent D).
// Rechte Spalte: Job-Detail-Panel (Subagent E) — PDF-Preview, Engine-Konsens,
// Routing-Trace, A/B-Diff; reagiert auf :jobId aus der Route.

import { useParams } from "react-router-dom";
import { Card } from "../../components/Card";
import { PageBadge } from "../../components/PageBadge";
import { Dropzone } from "../dropzone/Dropzone";
import { EdgeLogPanel } from "../edge-log/EdgeLogPanel";
import JobDetail from "../job-detail";
import { JobQueue } from "./JobQueue";

export default function JobsPage() {
  const { jobId } = useParams<{ jobId?: string }>();

  return (
    <div className="grid h-full gap-4 p-4 lg:grid-cols-2">
      {/* Linke Spalte: Drop-Zone + Live-Queue + Edge-Log */}
      <div className="flex flex-col gap-4">
        <Card title="Dateien hochladen" description="Drag-and-Drop oder Klick">
          <Dropzone />
        </Card>
        <Card title="Job-Queue" bodyClassName="max-h-[28rem] overflow-y-auto">
          <JobQueue />
        </Card>
        <Card title="Edge-Log" description="Live-Events vom Hub">
          <EdgeLogPanel />
        </Card>
      </div>

      {/* Rechte Spalte: Job-Detail (Subagent E) */}
      <div className="flex flex-col gap-4">
        <JobDetail />
      </div>

      <PageBadge id={jobId ? "gui.jobs.detail" : "gui.jobs"} />
    </div>
  );
}
