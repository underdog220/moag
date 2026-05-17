// OctoBoss Assets — Asset-Inventar mit Type-Filter.
// Sub-Route: /octoboss/assets
// Datenquelle: GET /api/v1/octoboss/assets

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import { Tooltip } from "../../../components/Tooltip";
import { PageBadge } from "../../../components/PageBadge";
import { LoadingSpinner } from "../../../components/LoadingSpinner";
import type { OctoBossAsset } from "../../../lib/types";

const TYPE_OPTIONS = [
  { value: "", label: "Alle" },
  { value: "model", label: "Model" },
  { value: "bundle", label: "Bundle" },
  { value: "dataset", label: "Dataset" },
  { value: "config", label: "Config" },
];

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function relTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const s = Math.floor(diff / 1000);
    if (s < 60) return `vor ${s}s`;
    if (s < 3600) return `vor ${Math.floor(s / 60)}min`;
    const h = Math.floor(s / 3600);
    if (h < 24) return `vor ${h}h`;
    return `vor ${Math.floor(h / 24)}d`;
  } catch {
    return iso;
  }
}

export function AssetsPage() {
  const [typeFilter, setTypeFilter] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["octoboss", "assets", typeFilter],
    queryFn: () => api.octoboss.getAssets({ type: typeFilter || undefined }),
    refetchInterval: 30_000,
  });

  const assets: OctoBossAsset[] = (() => {
    if (!data) return [];
    if (Array.isArray(data)) return data as OctoBossAsset[];
    const d = data as Record<string, unknown>;
    if (Array.isArray(d.assets)) return d.assets as OctoBossAsset[];
    return [];
  })();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold text-fg">Assets</h2>
        <div className="flex items-center gap-2">
          <label className="text-xs text-fg-muted">Typ:</label>
          <Tooltip title="Filtert das Asset-Inventar nach Typ" source="/api/v1/octoboss/assets">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="rounded border border-white/10 bg-bg-elevated px-2 py-1 text-xs text-fg
                         focus:outline-none focus:ring-1 focus:ring-brand/50"
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Tooltip>
        </div>
      </div>

      {isLoading && <LoadingSpinner />}
      {error && (
        <div className="rounded border border-status-error/30 bg-status-error/10 px-3 py-2 text-sm text-status-error">
          Fehler: {(error as Error).message}
        </div>
      )}

      {!isLoading && !error && assets.length === 0 && (
        <p className="text-sm text-fg-muted">Keine Assets gefunden.</p>
      )}

      {assets.length > 0 && (
        <div className="overflow-x-auto rounded border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-bg-panel text-left text-xs text-fg-muted">
                <th className="px-3 py-2">
                  <Tooltip title="Asset-Name" source="/api/v1/octoboss/assets">Name</Tooltip>
                </th>
                <th className="px-3 py-2">
                  <Tooltip title="Asset-Typ (model/bundle/dataset/config)" source="/api/v1/octoboss/assets">Typ</Tooltip>
                </th>
                <th className="px-3 py-2">
                  <Tooltip title="Dateigröße" source="/api/v1/octoboss/assets">Größe</Tooltip>
                </th>
                <th className="px-3 py-2">
                  <Tooltip title="Node auf der das Asset liegt" source="/api/v1/octoboss/assets">Node</Tooltip>
                </th>
                <th className="px-3 py-2">
                  <Tooltip title="Dateipfad auf der Node" source="/api/v1/octoboss/assets">Pfad</Tooltip>
                </th>
                <th className="px-3 py-2">
                  <Tooltip title="Erstellungszeit (relativ)" source="/api/v1/octoboss/assets" updatedAt="alle 30s">Erstellt</Tooltip>
                </th>
              </tr>
            </thead>
            <tbody>
              {assets.map((asset, i) => (
                <tr key={asset.name ?? i} className="border-b border-white/5 hover:bg-bg-elevated/40">
                  <td className="px-3 py-2 font-medium text-fg">{asset.name ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span className="rounded bg-bg-elevated px-1.5 py-0.5 text-xs text-fg-muted">
                      {asset.type ?? "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-fg-muted tabular-nums">
                    <Tooltip
                      title={asset.size_bytes != null ? `${asset.size_bytes.toLocaleString("de-DE")} Bytes` : "Unbekannte Größe"}
                      source="/api/v1/octoboss/assets"
                    >
                      {formatBytes(asset.size_bytes)}
                    </Tooltip>
                  </td>
                  <td className="px-3 py-2 text-fg-subtle text-xs">{asset.node_id ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs text-fg-subtle max-w-[20rem] truncate" title={asset.path ?? ""}>
                    {asset.path ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-fg-subtle text-xs">{relTime(asset.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PageBadge id="octoboss.assets" />
    </div>
  );
}

export default AssetsPage;
