import { describe, expect, it } from "vitest";
import {
  formatBytes,
  formatConfidence,
  formatDateTime,
  formatLatency,
  formatPercent,
  truncate,
} from "./format";

describe("format", () => {
  it("formatLatency rundet ms / s / min", () => {
    expect(formatLatency(null)).toBe("-");
    expect(formatLatency(0.5)).toBe("<1 ms");
    expect(formatLatency(42)).toBe("42 ms");
    expect(formatLatency(2500)).toBe("2.50 s");
    expect(formatLatency(120_000)).toBe("2.0 min");
  });

  it("formatBytes skaliert auf KB/MB/GB", () => {
    expect(formatBytes(null)).toBe("-");
    expect(formatBytes(0)).toBe("0.00 B");
    expect(formatBytes(1024)).toBe("1.00 KB");
    expect(formatBytes(1024 * 1024)).toBe("1.00 MB");
  });

  it("formatPercent akzeptiert 0..1 und 0..100", () => {
    expect(formatPercent(null)).toBe("-");
    expect(formatPercent(0.42)).toBe("42 %");
    expect(formatPercent(42)).toBe("42 %");
    expect(formatPercent(0.4234, 1)).toBe("42.3 %");
  });

  it("formatConfidence rendert mit einer Nachkommastelle", () => {
    expect(formatConfidence(0.945)).toBe("94.5 %");
    expect(formatConfidence(null)).toBe("-");
  });

  it("formatDateTime liefert lesbares Datum oder '-'", () => {
    expect(formatDateTime(null)).toBe("-");
    const out = formatDateTime("2026-05-06T10:30:00Z");
    expect(out).toMatch(/2026/);
  });

  it("truncate kuerzt lange Strings", () => {
    expect(truncate("hallo", 10)).toBe("hallo");
    expect(truncate("0123456789abcdef", 10)).toBe("012345678...");
  });
});
