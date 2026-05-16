import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  loadTimeRange,
  saveTimeRange,
  rangeToQuery,
  rangeLabel,
  TIME_RANGE_STORAGE_KEY,
  TIME_RANGE_DEFAULT,
} from "./timeRange";

describe("timeRange", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("liefert Default wenn nichts gespeichert ist", () => {
    expect(loadTimeRange()).toEqual(TIME_RANGE_DEFAULT);
  });

  it("speichert und laedt eine Preset-Range", () => {
    saveTimeRange({ preset: "7d" });
    expect(window.localStorage.getItem(TIME_RANGE_STORAGE_KEY)).toContain("7d");
    expect(loadTimeRange()).toEqual({ preset: "7d" });
  });

  it("speichert und laedt eine Custom-Range mit from/to", () => {
    const range = { preset: "custom" as const, from: "2026-04-01", to: "2026-05-06" };
    saveTimeRange(range);
    expect(loadTimeRange()).toEqual(range);
  });

  it("faellt auf Default zurueck bei kaputtem JSON", () => {
    window.localStorage.setItem(TIME_RANGE_STORAGE_KEY, "{not-json");
    expect(loadTimeRange()).toEqual(TIME_RANGE_DEFAULT);
  });

  it("faellt auf Default zurueck wenn custom ohne from/to gespeichert wurde", () => {
    window.localStorage.setItem(
      TIME_RANGE_STORAGE_KEY,
      JSON.stringify({ preset: "custom" }),
    );
    expect(loadTimeRange()).toEqual(TIME_RANGE_DEFAULT);
  });

  it("rangeToQuery liefert Preset bzw. custom:<from>:<to>", () => {
    expect(rangeToQuery({ preset: "24h" })).toBe("24h");
    expect(rangeToQuery({ preset: "30d" })).toBe("30d");
    expect(
      rangeToQuery({ preset: "custom", from: "2026-04-01", to: "2026-05-06" }),
    ).toBe("custom:2026-04-01:2026-05-06");
  });

  it("rangeLabel liefert deutschen Label-Text", () => {
    expect(rangeLabel({ preset: "24h" })).toMatch(/24 Stunden/);
    expect(rangeLabel({ preset: "7d" })).toMatch(/7 Tage/);
    expect(rangeLabel({ preset: "30d" })).toMatch(/30 Tage/);
    expect(
      rangeLabel({ preset: "custom", from: "2026-04-01", to: "2026-05-06" }),
    ).toContain("2026-04-01");
  });
});
