// Custos-Feature — Stub (Phase 4 — noch nicht angebunden).

import { PageBadge } from "../../components/PageBadge";
import { Breadcrumb } from "../../components/Breadcrumb";

export function CustosFeature() {
  return (
    <div className="flex flex-col" data-testid="custos">
      <Breadcrumb />
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="rounded-full bg-status-warn/10 p-4">
          <span className="text-3xl">🛡</span>
        </div>
        <h1 className="text-xl font-semibold text-fg">Custos</h1>
        <p className="max-w-sm text-sm text-fg-muted">
          Phase 4 — noch nicht angebunden. Compliance-Findings, Rule-Engine und
          Top-3-offene-Findings-Karte werden in Phase 4 implementiert.
          API-Endpoint: FastAPI Port 17890.
        </p>
        <p className="text-xs text-fg-subtle">
          Hinweis: Port-Konflikt mit DevLoop prüfen (siehe CLAUDE.md).
        </p>
      </div>
      <PageBadge id="custos" />
    </div>
  );
}

export default CustosFeature;
