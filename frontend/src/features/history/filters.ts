// Filter-Modell + Serialisierung als URL-Search-Params.
// Ermoeglicht "Sharebar"-Links (Briefing F).

import type { JobState } from "../../lib/types";

export type SortKey =
  | "started_at"
  | "filename"
  | "doctype"
  | "status"
  | "consensus_score"
  | "pii_count"
  | "page_total";

export type SortDir = "asc" | "desc";

export interface HistoryFilters {
  search: string;
  status: JobState | "all";
  doctype: string;
  engine: string;
  node: string;
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
  page: number;
  pageSize: number;
  sortBy: SortKey;
  sortDir: SortDir;
}

export const DEFAULT_FILTERS: HistoryFilters = {
  search: "",
  status: "all",
  doctype: "",
  engine: "",
  node: "",
  from: "",
  to: "",
  page: 1,
  pageSize: 50,
  sortBy: "started_at",
  sortDir: "desc",
};

const VALID_STATUS = ["all", "pending", "running", "done", "failed"] as const;
const VALID_SORT_KEYS: SortKey[] = [
  "started_at",
  "filename",
  "doctype",
  "status",
  "consensus_score",
  "pii_count",
  "page_total",
];

function pickStatus(s: string | null): JobState | "all" {
  if (!s) return "all";
  return (VALID_STATUS as readonly string[]).includes(s)
    ? (s as JobState | "all")
    : "all";
}

function pickSortKey(s: string | null): SortKey {
  if (s && (VALID_SORT_KEYS as string[]).includes(s)) return s as SortKey;
  return DEFAULT_FILTERS.sortBy;
}

function pickSortDir(s: string | null): SortDir {
  return s === "asc" ? "asc" : "desc";
}

export function filtersFromSearchParams(params: URLSearchParams): HistoryFilters {
  return {
    search: params.get("q") ?? "",
    status: pickStatus(params.get("status")),
    doctype: params.get("doctype") ?? "",
    engine: params.get("engine") ?? "",
    node: params.get("node") ?? "",
    from: params.get("from") ?? "",
    to: params.get("to") ?? "",
    page: Math.max(1, parseInt(params.get("page") ?? "1", 10) || 1),
    pageSize: Math.max(1, parseInt(params.get("size") ?? "50", 10) || 50),
    sortBy: pickSortKey(params.get("sort")),
    sortDir: pickSortDir(params.get("dir")),
  };
}

export function filtersToSearchParams(f: HistoryFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.search) p.set("q", f.search);
  if (f.status !== "all") p.set("status", f.status);
  if (f.doctype) p.set("doctype", f.doctype);
  if (f.engine) p.set("engine", f.engine);
  if (f.node) p.set("node", f.node);
  if (f.from) p.set("from", f.from);
  if (f.to) p.set("to", f.to);
  if (f.page !== DEFAULT_FILTERS.page) p.set("page", String(f.page));
  if (f.pageSize !== DEFAULT_FILTERS.pageSize) p.set("size", String(f.pageSize));
  if (f.sortBy !== DEFAULT_FILTERS.sortBy) p.set("sort", f.sortBy);
  if (f.sortDir !== DEFAULT_FILTERS.sortDir) p.set("dir", f.sortDir);
  return p;
}
