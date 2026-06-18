import { describe, expect, it } from "vitest";
import { diffLines } from "../_diff";

describe("diffLines", () => {
  it("markiert nur geaenderte Zeilen", () => {
    const a = "Zeile A\nMax Mustermann\nZeile C";
    const b = "Zeile A\n[PERSON]\nZeile C";
    const r = diffLines(a, b);
    expect(r.skipped).toBe(false);
    // Zeile A + C unveraendert, mittlere Zeile geaendert
    expect(r.left[0].changed).toBe(false);
    expect(r.left[1].changed).toBe(true);
    expect(r.left[2].changed).toBe(false);
    expect(r.right[1].changed).toBe(true);
  });

  it("identische Texte → nichts markiert", () => {
    const r = diffLines("a\nb\nc", "a\nb\nc");
    expect(r.left.every((l) => !l.changed)).toBe(true);
    expect(r.right.every((l) => !l.changed)).toBe(true);
  });

  it("ueberspringt sehr grosse Texte (Performance-Schutz)", () => {
    const big = Array.from({ length: 5000 }, (_, i) => `z${i}`).join("\n");
    const r = diffLines(big, big);
    expect(r.skipped).toBe(true);
    expect(r.left.every((l) => !l.changed)).toBe(true);
  });
});
