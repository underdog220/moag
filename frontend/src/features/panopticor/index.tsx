// Panopticor-Feature — Stub (Phase 6 — CR offen Task #4).

import { PageBadge } from "../../components/PageBadge";
import { Breadcrumb } from "../../components/Breadcrumb";

export function PanopticorFeature() {
  return (
    <div className="flex flex-col" data-testid="panopticor">
      <Breadcrumb />
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="rounded-full bg-status-warn/10 p-4">
          <span className="text-3xl">🔬</span>
        </div>
        <h1 className="text-xl font-semibold text-fg">Panopticor</h1>
        <p className="max-w-sm text-sm text-fg-muted">
          Phase 6 — CR offen (Task #4). Sobald ein FastAPI-Headless-Status-Endpoint
          verfügbar ist, werden hier Sandbox-Test-Runs, Scenario-Status und
          Action-Trigger-Buttons angezeigt.
        </p>
      </div>
      <PageBadge id="panopticor" />
    </div>
  );
}

export default PanopticorFeature;
