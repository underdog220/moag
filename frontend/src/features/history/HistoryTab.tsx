// HistoryTab: Tabelle aller Jobs mit Filter, Sort, Pagination, Export.
// URL-Params werden als Source-of-Truth fuer Filter benutzt (Sharebar).

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../lib/api";
import { qk } from "../../lib/queryKeys";
import { Card } from "../../components/Card";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { EmptyState } from "../../components/EmptyState";
import { PageBadge } from "../../components/PageBadge";
import { formatDateTime, formatLatency, truncate } from "../../lib/format";
import type { JobStatus } from "../../lib/types";
import {
  DEFAULT_FILTERS,
  filtersFromSearchParams,
  filtersToSearchParams,
  type HistoryFilters,
  type SortKey,
} from "./filters";
import { downloadBlob, jobsToCsv, jobsToJson } from "./export";

interface ColumnDef {
  key: SortKey;
  label: string;
  className?: string;
}

const COLUMNS: ColumnDef[] = [
  { key: "started_at", label: "Datum" },
  { key: "filename", label: "Datei" },
  { key: "doctype", label: "Doctype" },
  { key: "status", label: "Status" },
  { key: "consensus_score", label: "Konsens", className: "text-right" },
  { key: "pii_count", label: "PII", className: "text-right" },
  { key: "page_total", label: "Seiten", className: "text-right" },
];

function statusClass(status: JobStatus["status"]): string {
  switch (status) {
    case "done":
      return "text-status-ok";
    case "running":
      return "text-status-info";
    case "failed":
      return "text-status-error";
    default:
      return "text-fg-muted";
  }
}

function ariaSort(key: SortKey, filters: HistoryFilters): "ascending" | "descending" | "none" {
  if (filters.sortBy !== key) return "none";
  return filters.sortDir === "asc" ? "ascending" : "descending";
}

function compareJobs(a: JobStatus, b: JobStatus, sortBy: SortKey, dir: "asc" | "desc"): number {
  const av = (a as unknown as Record<string, unknown>)[sortBy];
  const bv = (b as unknown as Record<string, unknown>)[sortBy];
  let cmp = 0;
  if (av == null && bv == null) cmp = 0;
  else if (av == null) cmp = 1;
  else if (bv == null) cmp = -1;
  else if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
  else cmp = String(av).localeCompare(String(bv), "de");
  return dir === "asc" ? cmp : -cmp;
}

function applyFilters(jobs: JobStatus[], f: HistoryFilters): JobStatus[] {
  return jobs.filter((j) => {
    if (f.search && !j.filename.toLowerCase().includes(f.search.toLowerCase())) return false;
    if (f.status !== "all" && j.status !== f.status) return false;
    if (f.doctype && (j.doctype ?? "") !== f.doctype) return false;
    if (f.engine && !j.engines_used.includes(f.engine)) return false;
    if (f.node && !j.nodes_used.includes(f.node)) return false;
    if (f.from) {
      const fromTs = new Date(f.from + "T00:00:00Z").getTime();
      if (new Date(j.started_at).getTime() < fromTs) return false;
    }
    if (f.to) {
      const toTs = new Date(f.to + "T23:59:59Z").getTime();
      if (new Date(j.started_at).getTime() > toTs) return false;
    }
    return true;
  });
}

export function HistoryTab() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const filters = useMemo(() => filtersFromSearchParams(searchParams), [searchParams]);

  const { data, isLoading, error } = useQuery({
    queryKey: qk.jobs.list(),
    queryFn: () =>
      api.listJobs({
        limit: 500,
        offset: 0,
      }),
  });

  const allJobs = data?.jobs ?? [];
  const filtered = useMemo(() => applyFilters(allJobs, filters), [allJobs, filters]);
  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => compareJobs(a, b, filters.sortBy, filters.sortDir));
    return arr;
  }, [filtered, filters.sortBy, filters.sortDir]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / filters.pageSize));
  const safePage = Math.min(filters.page, pageCount);
  const pageStart = (safePage - 1) * filters.pageSize;
  const pageRows = sorted.slice(pageStart, pageStart + filters.pageSize);

  // Optionen fuer Filter-Dropdowns aus Daten ableiten
  const doctypeOptions = useMemo(
    () => Array.from(new Set(allJobs.map((j) => j.doctype).filter(Boolean) as string[])).sort(),
    [allJobs],
  );
  const engineOptions = useMemo(
    () => Array.from(new Set(allJobs.flatMap((j) => j.engines_used))).sort(),
    [allJobs],
  );
  const nodeOptions = useMemo(
    () => Array.from(new Set(allJobs.flatMap((j) => j.nodes_used))).sort(),
    [allJobs],
  );

  const updateFilters = (patch: Partial<HistoryFilters>) => {
    const merged: HistoryFilters = { ...filters, ...patch };
    // Bei aenderung anderer Filter zurueck auf Seite 1
    if (
      patch.search !== undefined ||
      patch.status !== undefined ||
      patch.doctype !== undefined ||
      patch.engine !== undefined ||
      patch.node !== undefined ||
      patch.from !== undefined ||
      patch.to !== undefined ||
      patch.sortBy !== undefined ||
      patch.sortDir !== undefined
    ) {
      merged.page = 1;
    }
    setSearchParams(filtersToSearchParams(merged), { replace: true });
  };

  const onSortClick = (key: SortKey) => {
    if (filters.sortBy === key) {
      updateFilters({ sortDir: filters.sortDir === "asc" ? "desc" : "asc" });
    } else {
      updateFilters({ sortBy: key, sortDir: "desc" });
    }
  };

  const exportCsv = () => {
    downloadBlob(jobsToCsv(sorted), `moag-history-${Date.now()}.csv`, "text/csv;charset=utf-8");
  };
  const exportJson = () => {
    downloadBlob(
      jobsToJson(sorted),
      `moag-history-${Date.now()}.json`,
      "application/json;charset=utf-8",
    );
  };

  const resetFilters = () =>
    setSearchParams(filtersToSearchParams(DEFAULT_FILTERS), { replace: true });

  return (
    <div className="space-y-4 p-4" data-testid="history-tab">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-fg">Job-History</h1>
          <p className="text-xs text-fg-muted">
            <span data-testid="history-count-filtered">{sorted.length}</span> von{" "}
            <span data-testid="history-count-total">{data?.total ?? allJobs.length}</span> Jobs
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="history-export-csv"
            onClick={exportCsv}
            className="rounded bg-bg-elevated px-3 py-1 text-xs text-fg hover:bg-bg-subtle"
          >
            CSV
          </button>
          <button
            type="button"
            data-testid="history-export-json"
            onClick={exportJson}
            className="rounded bg-bg-elevated px-3 py-1 text-xs text-fg hover:bg-bg-subtle"
          >
            JSON
          </button>
          <button
            type="button"
            data-testid="history-reset"
            onClick={resetFilters}
            className="rounded bg-bg-elevated px-3 py-1 text-xs text-fg-muted hover:text-fg"
          >
            Filter zuruecksetzen
          </button>
        </div>
      </header>

      <Card title="Filter" bodyClassName="space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <input
            type="search"
            placeholder="Dateiname..."
            data-testid="history-filter-search"
            aria-label="Suche nach Dateiname"
            value={filters.search}
            onChange={(e) => updateFilters({ search: e.target.value })}
            className="rounded border border-white/10 bg-bg-subtle px-2 py-1 text-sm text-fg"
          />
          <select
            data-testid="history-filter-status"
            aria-label="Status-Filter"
            value={filters.status}
            onChange={(e) => updateFilters({ status: e.target.value as HistoryFilters["status"] })}
            className="rounded border border-white/10 bg-bg-subtle px-2 py-1 text-sm text-fg"
          >
            <option value="all">Alle Status</option>
            <option value="pending">Pending</option>
            <option value="running">Running</option>
            <option value="done">Done</option>
            <option value="failed">Failed</option>
          </select>
          <select
            data-testid="history-filter-doctype"
            aria-label="Doctype-Filter"
            value={filters.doctype}
            onChange={(e) => updateFilters({ doctype: e.target.value })}
            className="rounded border border-white/10 bg-bg-subtle px-2 py-1 text-sm text-fg"
          >
            <option value="">Alle Doctypes</option>
            {doctypeOptions.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <select
            data-testid="history-filter-engine"
            aria-label="Engine-Filter"
            value={filters.engine}
            onChange={(e) => updateFilters({ engine: e.target.value })}
            className="rounded border border-white/10 bg-bg-subtle px-2 py-1 text-sm text-fg"
          >
            <option value="">Alle Engines</option>
            {engineOptions.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
          <select
            data-testid="history-filter-node"
            aria-label="Node-Filter"
            value={filters.node}
            onChange={(e) => updateFilters({ node: e.target.value })}
            className="rounded border border-white/10 bg-bg-subtle px-2 py-1 text-sm text-fg"
          >
            <option value="">Alle Nodes</option>
            {nodeOptions.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1">
            <input
              type="date"
              aria-label="Von"
              data-testid="history-filter-from"
              value={filters.from}
              onChange={(e) => updateFilters({ from: e.target.value })}
              className="w-full rounded border border-white/10 bg-bg-subtle px-2 py-1 text-sm text-fg"
            />
            <span className="text-fg-subtle">-</span>
            <input
              type="date"
              aria-label="Bis"
              data-testid="history-filter-to"
              value={filters.to}
              onChange={(e) => updateFilters({ to: e.target.value })}
              className="w-full rounded border border-white/10 bg-bg-subtle px-2 py-1 text-sm text-fg"
            />
          </div>
        </div>
      </Card>

      <Card>
        {isLoading && <LoadingSpinner label="Lade Jobs..." />}
        {error && (
          <div data-testid="history-error" className="text-sm text-status-error">
            Fehler: {(error as Error).message}
          </div>
        )}
        {!isLoading && !error && (
          <>
            {sorted.length === 0 ? (
              <EmptyState
                title="Keine Jobs gefunden"
                description="Passe Filter an oder fuehre Jobs durch."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm" data-testid="history-table">
                  <thead className="border-b border-white/10">
                    <tr>
                      {COLUMNS.map((col) => {
                        const isActive = filters.sortBy === col.key;
                        const arrow = isActive ? (filters.sortDir === "asc" ? "^" : "v") : "";
                        return (
                          <th
                            key={col.key}
                            scope="col"
                            aria-sort={ariaSort(col.key, filters)}
                            className={`cursor-pointer select-none px-3 py-2 text-left text-xs font-semibold uppercase text-fg-muted ${col.className ?? ""}`}
                            data-testid={`history-sort-${col.key}`}
                            onClick={() => onSortClick(col.key)}
                          >
                            {col.label} {arrow}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((j) => (
                      <tr
                        key={j.job_id}
                        data-testid={`history-row-${j.job_id}`}
                        className="cursor-pointer border-b border-white/5 hover:bg-bg-elevated/40"
                        onClick={() => navigate(`/jobs/${encodeURIComponent(j.job_id)}`)}
                      >
                        <td className="px-3 py-2 text-fg-muted">{formatDateTime(j.started_at)}</td>
                        <td className="px-3 py-2">
                          <Link
                            to={`/jobs/${encodeURIComponent(j.job_id)}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-fg hover:text-brand"
                            title={j.filename}
                          >
                            {truncate(j.filename, 50)}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-fg">{j.doctype ?? "-"}</td>
                        <td className={`px-3 py-2 ${statusClass(j.status)}`}>{j.status}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs">
                          {j.consensus_score != null
                            ? `${(j.consensus_score * 100).toFixed(1)} %`
                            : "-"}
                        </td>
                        <td className="px-3 py-2 text-right">{j.pii_count ?? "-"}</td>
                        <td className="px-3 py-2 text-right">
                          {j.page_done}/{j.page_total}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {sorted.length > 0 && (
              <nav
                aria-label="Pagination"
                className="mt-3 flex items-center justify-between gap-2 text-xs"
                data-testid="history-pagination"
              >
                <div className="text-fg-muted">
                  Seite {safePage} von {pageCount}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    data-testid="history-page-prev"
                    disabled={safePage <= 1}
                    onClick={() => updateFilters({ page: safePage - 1 })}
                    className="rounded bg-bg-elevated px-3 py-1 text-fg disabled:opacity-30"
                  >
                    Zurueck
                  </button>
                  <span data-testid="history-page-current" className="px-2 font-mono">
                    {safePage}
                  </span>
                  <button
                    type="button"
                    data-testid="history-page-next"
                    disabled={safePage >= pageCount}
                    onClick={() => updateFilters({ page: safePage + 1 })}
                    className="rounded bg-bg-elevated px-3 py-1 text-fg disabled:opacity-30"
                  >
                    Vor
                  </button>
                  <span title="Latenz-Anzeige optional" className="ml-2 text-fg-subtle">
                    ({formatLatency(0)})
                  </span>
                </div>
              </nav>
            )}
          </>
        )}
      </Card>

      <PageBadge id="gui.history" />
    </div>
  );
}

export default HistoryTab;
