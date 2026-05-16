// qnapbackup-Feature — Stub (Phase 5 — CR offen Task #3).

import { PageBadge } from "../../components/PageBadge";
import { Breadcrumb } from "../../components/Breadcrumb";

export function QnapBackupFeature() {
  return (
    <div className="flex flex-col" data-testid="qnapbackup">
      <Breadcrumb />
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="rounded-full bg-status-warn/10 p-4">
          <span className="text-3xl">💾</span>
        </div>
        <h1 className="text-xl font-semibold text-fg">qnapbackup</h1>
        <p className="max-w-sm text-sm text-fg-muted">
          Phase 5 — CR offen (Task #3). Sobald ein HTTP-Status-API-Endpoint verfügbar ist,
          wird hier die Backup-Status-Karte mit Hero-Gauge angezeigt. Bis dahin: direkter
          Link zum bestehenden Web-UI.
        </p>
        <a
          href="http://192.168.200.71:5000"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded border border-white/10 bg-bg-panel px-4 py-2 text-sm text-fg
                     hover:bg-bg-subtle"
        >
          qnapbackup Web-UI öffnen →
        </a>
      </div>
      <PageBadge id="qnapbackup" />
    </div>
  );
}

export default QnapBackupFeature;
