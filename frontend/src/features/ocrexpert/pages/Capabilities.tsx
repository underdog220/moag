// OCRexpert Capabilities-Seite.
// Visualisiert engines_local/engines_octoboss als Badge-Liste,
// LibreOffice und Shadow als Status-Punkte.
// ActionCard fuer ocrexpert.health.check und ocrexpert.shadow.batch.
//
// Datenquelle: GET /api/v1/ocrexpert/capabilities

import { useQuery } from "@tanstack/react-query";
import { PageBadge } from "../../../components/PageBadge";
import { Tooltip } from "../../../components/Tooltip";
import { ActionCard } from "../../aktionen/ActionCard";
import type { Action } from "../../../lib/types";
import { api } from "../../../lib/api";

// ─── Typen ────────────────────────────────────────────────────────────────────

interface OcrCapabilities {
  status: string;
  version: string;
  engines_local: string[];
  engines_octoboss: string[];
  octoboss_reachable: boolean;
  libreoffice_available: boolean;
  shadow_writable: boolean;
  source_url: string;
}

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

function StatusDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <Tooltip
      title={ok ? `${label} verfuegbar` : `${label} nicht verfuegbar`}
      source="/api/v1/ocrexpert/capabilities"
    >
      <span className="inline-flex items-center gap-1.5 text-sm">
        <span
          className={`inline-block h-2.5 w-2.5 rounded-full ${
            ok ? "bg-status-ok" : "bg-status-error"
          }`}
          aria-label={ok ? "verfuegbar" : "nicht verfuegbar"}
        />
        <span className={ok ? "text-fg" : "text-fg-muted"}>{label}</span>
      </span>
    </Tooltip>
  );
}

function EngineBadge({ name, group }: { name: string; group: "lokal" | "octoboss" }) {
  const color =
    group === "lokal"
      ? "bg-brand/15 text-brand border-brand/30"
      : "bg-status-warn/15 text-status-warn border-status-warn/30";
  return (
    <Tooltip
      title={`OCR-Engine: ${name} (${group === "lokal" ? "lokal auf VDR" : "ueber OctoBoss-Cluster"})`}
      source="/api/v1/ocrexpert/capabilities"
    >
      <span
        className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${color}`}
      >
        {name}
      </span>
    </Tooltip>
  );
}

// ─── Aktionen als Konstanten (Metadaten, Handler laeuft ueber api.triggerAction) ─

const ACTION_HEALTH: Action = {
  action_id: "ocrexpert.health.check",
  system_id: "ocrexpert",
  name: "OCRexpert Health-Check",
  description:
    "Ruft OCRexpert /api/v1/health auf und liefert den aktuellen Status: " +
    "OCR-Engines, OctoBoss-Erreichbarkeit, LibreOffice und Shadow-Modus.",
  category: "diagnose",
  sub_area: "health",
  requires_confirm: false,
  is_destructive: false,
  estimated_duration_s: 3,
  implemented: true,
};

const ACTION_SHADOW: Action = {
  action_id: "ocrexpert.shadow.batch",
  system_id: "ocrexpert",
  name: "Shadow-Batch starten",
  description:
    "Startet einen Shadow-Verarbeitungs-Batch. " +
    "Default-Pfad: /mnt/qnap_public/Dokumente/test.pdf. " +
    "Das Shadow-Modul legt eine PDF/A-Kopie in Dokumente_pdfa/ ab.",
  category: "operation",
  sub_area: "shadow",
  requires_confirm: false,
  is_destructive: false,
  estimated_duration_s: 30,
  implemented: true,
};

// ─── Capabilities-Page ────────────────────────────────────────────────────────

export function CapabilitiesPage() {
  const { data, isLoading, isError, error, refetch } = useQuery<OcrCapabilities>({
    queryKey: ["ocrexpert", "capabilities"],
    queryFn: async () => {
      const res = await fetch("/api/v1/ocrexpert/capabilities");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<OcrCapabilities>;
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  // Echte Aktionen aus der Registry holen (fuer korrekte implemented-Flags)
  const { data: actionsData } = useQuery({
    queryKey: ["actions"],
    queryFn: api.getActions,
    staleTime: 60_000,
  });
  const registryActions = actionsData?.actions ?? [];
  const healthAction =
    registryActions.find((a) => a.action_id === "ocrexpert.health.check") ?? ACTION_HEALTH;
  const shadowAction =
    registryActions.find((a) => a.action_id === "ocrexpert.shadow.batch") ?? ACTION_SHADOW;

  return (
    <div className="flex flex-col gap-6 p-4">
      {/* Seitentitel */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-fg">OCRexpert — Capabilities</h2>
        <Tooltip
          title="Capability-Snapshot aktualisieren"
          source="/api/v1/ocrexpert/capabilities"
        >
          <button
            type="button"
            onClick={() => void refetch()}
            className="rounded border border-white/10 bg-bg-elevated px-3 py-1.5
                       text-xs text-fg-muted hover:text-fg transition-colors"
          >
            Aktualisieren
          </button>
        </Tooltip>
      </div>

      {/* Lade- / Fehlerzustand */}
      {isLoading && (
        <p className="text-sm text-fg-muted">Capabilities werden geladen…</p>
      )}
      {isError && (
        <p className="rounded border border-status-error/30 bg-status-error/10 px-3 py-2
                      text-sm text-status-error">
          Fehler beim Laden: {(error as Error).message}
        </p>
      )}

      {/* Capabilities-Panel */}
      {data && (
        <div className="flex flex-col gap-6">
          {/* Versionzeile */}
          <div className="flex items-center gap-3 text-sm">
            <Tooltip
              title={`OCRexpert-Version + Status. Quelle: ${data.source_url}`}
              source="/api/v1/ocrexpert/capabilities"
            >
              <span className="font-medium text-fg">
                v{data.version}
              </span>
            </Tooltip>
            <span
              className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                data.status === "ok"
                  ? "bg-status-ok/15 text-status-ok"
                  : data.status === "degraded"
                    ? "bg-status-warn/15 text-status-warn"
                    : "bg-status-error/15 text-status-error"
              }`}
            >
              {data.status}
            </span>
          </div>

          {/* Engines */}
          <div>
            <Tooltip
              title={`Lokale OCR-Engines auf VDR (${data.engines_local.length} verfuegbar). Quelle: /api/v1/health`}
              source="/api/v1/ocrexpert/capabilities"
              thresholds=">0 Engines = Grundbetrieb moeglich"
            >
              <h3 className="mb-2 text-sm font-medium text-fg-muted">
                Lokale Engines ({data.engines_local.length})
              </h3>
            </Tooltip>
            {data.engines_local.length === 0 ? (
              <p className="text-xs text-fg-subtle italic">Keine lokalen Engines verfuegbar</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {data.engines_local.map((e) => (
                  <EngineBadge key={e} name={e} group="lokal" />
                ))}
              </div>
            )}
          </div>

          <div>
            <Tooltip
              title={`OctoBoss-Cluster-Engines (${data.engines_octoboss.length} verfuegbar). Quelle: /api/v1/health`}
              source="/api/v1/ocrexpert/capabilities"
              thresholds=">0 = Cluster-OCR aktiv"
            >
              <h3 className="mb-2 text-sm font-medium text-fg-muted">
                OctoBoss-Engines ({data.engines_octoboss.length})
              </h3>
            </Tooltip>
            {data.engines_octoboss.length === 0 ? (
              <p className="text-xs text-fg-subtle italic">Keine OctoBoss-Engines erreichbar</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {data.engines_octoboss.map((e) => (
                  <EngineBadge key={e} name={e} group="octoboss" />
                ))}
              </div>
            )}
          </div>

          {/* Status-Punkte */}
          <div>
            <h3 className="mb-2 text-sm font-medium text-fg-muted">Dienste</h3>
            <div className="flex flex-wrap gap-4">
              <StatusDot ok={data.octoboss_reachable} label="OctoBoss erreichbar" />
              <StatusDot ok={data.libreoffice_available} label="LibreOffice" />
              <StatusDot ok={data.shadow_writable} label="Shadow schreibbar" />
            </div>
          </div>
        </div>
      )}

      {/* Aktionen */}
      <div>
        <h3 className="mb-3 text-sm font-medium text-fg-muted">Aktionen</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <ActionCard action={healthAction} />
          <ActionCard action={shadowAction} />
        </div>
      </div>

      <PageBadge id="ocrexpert.capabilities" />
    </div>
  );
}

export default CapabilitiesPage;
