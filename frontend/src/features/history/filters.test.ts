import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILTERS,
  filtersFromSearchParams,
  filtersToSearchParams,
} from "./filters";

describe("history-filters", () => {
  it("liefert Defaults bei leeren Params", () => {
    const f = filtersFromSearchParams(new URLSearchParams());
    expect(f).toEqual(DEFAULT_FILTERS);
  });

  it("parst URL-Params", () => {
    const f = filtersFromSearchParams(
      new URLSearchParams("q=rechnung&status=done&page=3&sort=filename&dir=asc"),
    );
    expect(f.search).toBe("rechnung");
    expect(f.status).toBe("done");
    expect(f.page).toBe(3);
    expect(f.sortBy).toBe("filename");
    expect(f.sortDir).toBe("asc");
  });

  it("ignoriert ungueltige Werte", () => {
    const f = filtersFromSearchParams(
      new URLSearchParams("status=irgendwas&sort=hack&dir=nope&page=abc"),
    );
    expect(f.status).toBe("all");
    expect(f.sortBy).toBe("started_at");
    expect(f.sortDir).toBe("desc");
    expect(f.page).toBe(1);
  });

  it("serialisiert nur abweichende Werte", () => {
    const p = filtersToSearchParams({ ...DEFAULT_FILTERS });
    expect(p.toString()).toBe("");
  });

  it("Round-Trip ergibt aequivalente Filter", () => {
    const f = {
      ...DEFAULT_FILTERS,
      search: "vertrag",
      status: "done" as const,
      doctype: "Mietvertrag",
      page: 2,
      pageSize: 50,
      sortBy: "consensus_score" as const,
      sortDir: "asc" as const,
    };
    const back = filtersFromSearchParams(filtersToSearchParams(f));
    expect(back).toEqual(f);
  });
});
