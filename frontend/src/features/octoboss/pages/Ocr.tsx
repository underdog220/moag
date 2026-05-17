// OctoBoss OCR — OCR-Gateway-Status + Provider-Übersicht.
// Sub-Route: /octoboss/ocr
// Datenquelle: GET /api/v1/octoboss/ocr/status

import { useQuery } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import { Tooltip } from "../../../components/Tooltip";
import { PageBadge } from "../../../components/PageBadge";
import { LoadingSpinner } from "../../../components/LoadingSpinner";

interface OcrEngine {
  name: string;
  version?: string;
  status?: string;
  node_id?: string;
}

interface OcrProvider {
  provider_id?: string;
  display_name?: string;
  provider_type?: string;
  is_online?: boolean;
  is_local?: boolean;
  is_installed?: boolean;
  install_hint?: string | null;
  supported_languages?: string[];
  [key: string]: unknown;
}

interface OcrStatus {
  status?: string;
  version?: string;
  engines?: OcrEngine[];
  // Backend liefert Provider-Objekte (nicht Strings). Frontend toleriert beides.
  providers?: Array<OcrProvider | string>;
  active_jobs?: number;
  total_processed?: number;
  [key: string]: unknown;
}

// Helper: liefert Anzeige-Name aus Provider-Objekt oder Plain-String
function providerLabel(p: OcrProvider | string): string {
  if (typeof p === "string") return p;
  return p.display_name ?? p.provider_id ?? p.provider_type ?? "(unbenannt)";
}

function providerKey(p: OcrProvider | string, idx: number): string {
  if (typeof p === "string") return `${p}-${idx}`;
  return p.provider_id ?? `provider-${idx}`;
}

function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="text-fg-subtle">—</span>;
  const color =
    status === "ok" || status === "healthy"
      ? "bg-status-ok/15 text-status-ok border-status-ok/30"
      : status === "degraded" || status === "warn"
        ? "bg-status-warn/15 text-status-warn border-status-warn/30"
        : "bg-status-error/15 text-status-error border-status-error/30";
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 text-xs font-medium ${color}`}>
      {status}
    </span>
  );
}

export function OcrPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["octoboss", "ocr", "status"],
    queryFn: () => api.octoboss.getOcrStatus(),
    refetchInterval: 20_000,
  });

  const ocrStatus = data as OcrStatus | null | undefined;

  const engines: OcrEngine[] = (() => {
    if (!ocrStatus) return [];
    if (Array.isArray(ocrStatus.engines)) return ocrStatus.engines;
    return [];
  })();

  const providers: Array<OcrProvider | string> = (() => {
    if (!ocrStatus) return [];
    if (Array.isArray(ocrStatus.providers)) return ocrStatus.providers;
    return [];
  })();

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold text-fg">OCR-Gateway</h2>

      {isLoading && <LoadingSpinner />}
      {error && (
        <div className="rounded border border-status-error/30 bg-status-error/10 px-3 py-2 text-sm text-status-error">
          Fehler: {(error as Error).message}
        </div>
      )}

      {ocrStatus && (
        <>
          {/* Status-Übersicht */}
          <div className="rounded border border-white/10 bg-bg-panel">
            <div className="border-b border-white/10 px-4 py-3">
              <h3 className="text-sm font-semibold text-fg">Gateway-Status</h3>
            </div>
            <div className="grid grid-cols-2 gap-0 sm:grid-cols-4">
              <div className="border-b border-white/5 px-4 py-3 sm:border-b-0 sm:border-r">
                <Tooltip title="Gesamtstatus des OCR-Gateways" source="/api/v1/octoboss/ocr/status">
                  <p className="mb-1 text-xs text-fg-muted">Status</p>
                </Tooltip>
                <StatusBadge status={ocrStatus.status} />
              </div>
              <div className="border-b border-white/5 px-4 py-3 sm:border-b-0 sm:border-r">
                <Tooltip title="OCR-Engine-Version" source="/api/v1/octoboss/ocr/status">
                  <p className="mb-1 text-xs text-fg-muted">Version</p>
                </Tooltip>
                <span className="text-sm text-fg">{ocrStatus.version ?? "—"}</span>
              </div>
              <div className="border-b border-white/5 px-4 py-3 sm:border-b-0 sm:border-r">
                <Tooltip
                  title="Aktuell laufende OCR-Jobs"
                  source="/api/v1/octoboss/ocr/status"
                  thresholds="0 = idle · >0 = aktiv"
                >
                  <p className="mb-1 text-xs text-fg-muted">Aktive Jobs</p>
                </Tooltip>
                <span className={`text-sm tabular-nums ${(ocrStatus.active_jobs ?? 0) > 0 ? "text-brand" : "text-fg-muted"}`}>
                  {ocrStatus.active_jobs ?? 0}
                </span>
              </div>
              <div className="px-4 py-3">
                <Tooltip
                  title="Gesamtzahl verarbeiteter Dokumente"
                  source="/api/v1/octoboss/ocr/status"
                >
                  <p className="mb-1 text-xs text-fg-muted">Gesamt verarbeitet</p>
                </Tooltip>
                <span className="text-sm tabular-nums text-fg">
                  {ocrStatus.total_processed?.toLocaleString("de-DE") ?? "—"}
                </span>
              </div>
            </div>
          </div>

          {/* Provider-Liste */}
          {providers.length > 0 && (
            <div>
              <Tooltip
                title="Registrierte OCR-Provider auf diesem OctoBoss-Cluster"
                source="/api/v1/octoboss/ocr/status"
              >
                <h3 className="mb-2 text-sm font-medium text-fg-muted">
                  Provider ({providers.length})
                </h3>
              </Tooltip>
              <div className="flex flex-wrap gap-2">
                {providers.map((p, idx) => {
                  const label = providerLabel(p);
                  const tooltipTitle =
                    typeof p === "string"
                      ? `OCR-Provider: ${label}`
                      : `${label} (${p.provider_type ?? "?"}) · online: ${p.is_online ? "ja" : "nein"} · lokal: ${p.is_local ? "ja" : "nein"}`;
                  const isOnline = typeof p === "string" ? true : Boolean(p.is_online);
                  return (
                    <Tooltip
                      key={providerKey(p, idx)}
                      title={tooltipTitle}
                      source="/api/v1/octoboss/ocr/status"
                    >
                      <span className={`inline-block rounded border px-2 py-0.5 text-xs ${
                        isOnline
                          ? "border-status-ok/30 bg-status-ok/10 text-status-ok"
                          : "border-white/10 bg-bg-elevated text-fg-muted"
                      }`}>
                        {label}
                      </span>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          )}

          {/* Engines-Tabelle */}
          {engines.length > 0 && (
            <div className="overflow-x-auto rounded border border-white/10">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-bg-panel text-left text-xs text-fg-muted">
                    <th className="px-3 py-2">
                      <Tooltip title="OCR-Engine-Name" source="/api/v1/octoboss/ocr/status">Engine</Tooltip>
                    </th>
                    <th className="px-3 py-2">
                      <Tooltip title="Engine-Version" source="/api/v1/octoboss/ocr/status">Version</Tooltip>
                    </th>
                    <th className="px-3 py-2">
                      <Tooltip title="Engine-Status" source="/api/v1/octoboss/ocr/status" thresholds="ok/healthy = grün · sonst = gelb/rot">Status</Tooltip>
                    </th>
                    <th className="px-3 py-2">
                      <Tooltip title="Node-ID auf der die Engine läuft" source="/api/v1/octoboss/ocr/status">Node</Tooltip>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {engines.map((engine, i) => (
                    <tr key={engine.name ?? i} className="border-b border-white/5 hover:bg-bg-elevated/40">
                      <td className="px-3 py-2 font-medium text-fg">{engine.name ?? "—"}</td>
                      <td className="px-3 py-2 text-fg-muted text-xs">{engine.version ?? "—"}</td>
                      <td className="px-3 py-2">
                        <StatusBadge status={engine.status} />
                      </td>
                      <td className="px-3 py-2 text-fg-subtle text-xs">{engine.node_id ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {engines.length === 0 && providers.length === 0 && (
            <p className="text-sm text-fg-muted">
              Keine Engines oder Provider gefunden — Gateway möglicherweise nicht verbunden.
            </p>
          )}
        </>
      )}

      {!isLoading && !error && !ocrStatus && (
        <p className="text-sm text-fg-muted">Keine OCR-Status-Daten verfügbar.</p>
      )}

      <PageBadge id="octoboss.ocr" />
    </div>
  );
}

export default OcrPage;
