// Zeitraum-Filter fuer Charts-Tab.
// Persistenz in localStorage, defensives Parsing, deterministische Defaults.

export type TimeRangePreset = "24h" | "7d" | "30d" | "custom";

export interface TimeRange {
  preset: TimeRangePreset;
  /** ISO-Datetime, nur bei preset === "custom" gesetzt. */
  from?: string;
  /** ISO-Datetime, nur bei preset === "custom" gesetzt. */
  to?: string;
}

const STORAGE_KEY = "moag.charts.range";
const DEFAULT_RANGE: TimeRange = { preset: "24h" };

const VALID_PRESETS: ReadonlyArray<TimeRangePreset> = ["24h", "7d", "30d", "custom"];

function isPreset(s: unknown): s is TimeRangePreset {
  return typeof s === "string" && VALID_PRESETS.includes(s as TimeRangePreset);
}

/** Liest die Range aus localStorage. Defensive bei kaputtem JSON oder fehlendem window. */
export function loadTimeRange(): TimeRange {
  try {
    if (typeof window === "undefined") return DEFAULT_RANGE;
    const raw = window.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_RANGE;
    const parsed = JSON.parse(raw) as Partial<TimeRange>;
    if (!isPreset(parsed.preset)) return DEFAULT_RANGE;
    if (parsed.preset === "custom") {
      if (typeof parsed.from !== "string" || typeof parsed.to !== "string") {
        return DEFAULT_RANGE;
      }
      return { preset: "custom", from: parsed.from, to: parsed.to };
    }
    return { preset: parsed.preset };
  } catch {
    return DEFAULT_RANGE;
  }
}

/** Schreibt die Range nach localStorage; tolerant gegen SecurityError. */
export function saveTimeRange(range: TimeRange): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(range));
  } catch {
    // ignore
  }
}

/** Mappt eine Range auf den `range`-Query-Param fuer das Backend. */
export function rangeToQuery(range: TimeRange): string {
  if (range.preset === "custom" && range.from && range.to) {
    // Backend akzeptiert "custom:<from>:<to>" — bei Bedarf serverseitig anpassen
    return `custom:${range.from}:${range.to}`;
  }
  return range.preset;
}

/** Menschenlesbares Label fuer UI. */
export function rangeLabel(range: TimeRange): string {
  switch (range.preset) {
    case "24h":
      return "Letzte 24 Stunden";
    case "7d":
      return "Letzte 7 Tage";
    case "30d":
      return "Letzte 30 Tage";
    case "custom":
      if (range.from && range.to) {
        return `${range.from.slice(0, 10)} – ${range.to.slice(0, 10)}`;
      }
      return "Benutzerdefiniert";
  }
}

export const TIME_RANGE_STORAGE_KEY = STORAGE_KEY;
export const TIME_RANGE_DEFAULT: TimeRange = DEFAULT_RANGE;
