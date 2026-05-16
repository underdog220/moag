// Tests fuer die Date-Only-zu-ISO-Datetime-Normalisierung in den Cockpit-API-Funktionen.
// Prueft, dass getCockpitCost, getCockpitAudit und getCockpitCalls
// Date-Only-Strings (YYYY-MM-DD) korrekt konvertieren und ISO-Datetime-Strings unveraendert
// durchreichen.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Kein Mock-Modus — wir wollen den echten fetch-Pfad testen
const REAL_URL = "http://localhost:5173/dashboard";

beforeEach(() => {
  Object.defineProperty(window, "location", {
    value: new URL(REAL_URL),
    writable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

// Hilfs-Funktion: liest den URL-Query-String aus dem ersten fetch-Aufruf
function capturedUrl(fetchSpy: { mock: { calls: unknown[][] } }): URL {
  const callArg = fetchSpy.mock.calls[0][0] as string;
  // Relativer Pfad → absolute URL bauen damit URL() funktioniert
  return new URL(callArg, "http://localhost");
}

describe("getCockpitCost — Date-Only-Normalisierung", () => {
  it("wandelt Date-Only from zu T00:00:00Z und Date-Only to zu T23:59:59Z", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ total_cost_eur: 0, breakdown: [], currency: "EUR" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { api } = await import("./api");
    await api.getCockpitCost({ from: "2026-05-01", to: "2026-05-16", groupBy: "day" }).catch(() => {});

    expect(fetchSpy).toHaveBeenCalledOnce();
    const url = capturedUrl(fetchSpy);
    expect(url.searchParams.get("from")).toBe("2026-05-01T00:00:00Z");
    expect(url.searchParams.get("to")).toBe("2026-05-16T23:59:59Z");
  });

  it("laesst ISO-Datetime-Input in getCockpitCost unveraendert durch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ total_cost_eur: 0, breakdown: [], currency: "EUR" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { api } = await import("./api");
    await api
      .getCockpitCost({
        from: "2026-05-01T06:00:00Z",
        to: "2026-05-16T18:30:00Z",
        groupBy: "day",
      })
      .catch(() => {});

    expect(fetchSpy).toHaveBeenCalledOnce();
    const url = capturedUrl(fetchSpy);
    expect(url.searchParams.get("from")).toBe("2026-05-01T06:00:00Z");
    expect(url.searchParams.get("to")).toBe("2026-05-16T18:30:00Z");
  });
});

describe("getCockpitAudit — Date-Only-Normalisierung", () => {
  it("wandelt Date-Only since zu T00:00:00Z", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ events: [], next_cursor: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { api } = await import("./api");
    await api.getCockpitAudit({ since: "2026-05-10" }).catch(() => {});

    expect(fetchSpy).toHaveBeenCalledOnce();
    const url = capturedUrl(fetchSpy);
    expect(url.searchParams.get("since")).toBe("2026-05-10T00:00:00Z");
  });

  it("laesst ISO-Datetime-since in getCockpitAudit unveraendert durch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ events: [], next_cursor: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { api } = await import("./api");
    await api.getCockpitAudit({ since: "2026-05-10T12:00:00Z" }).catch(() => {});

    expect(fetchSpy).toHaveBeenCalledOnce();
    const url = capturedUrl(fetchSpy);
    expect(url.searchParams.get("since")).toBe("2026-05-10T12:00:00Z");
  });
});

describe("getCockpitCalls — Date-Only-Normalisierung", () => {
  it("wandelt Date-Only since zu T00:00:00Z", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ calls: [], next_cursor: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { api } = await import("./api");
    await api.getCockpitCalls({ since: "2026-05-14" }).catch(() => {});

    expect(fetchSpy).toHaveBeenCalledOnce();
    const url = capturedUrl(fetchSpy);
    expect(url.searchParams.get("since")).toBe("2026-05-14T00:00:00Z");
  });

  it("laesst ISO-Datetime-since in getCockpitCalls unveraendert durch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ calls: [], next_cursor: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { api } = await import("./api");
    await api.getCockpitCalls({ since: "2026-05-14T08:15:00Z" }).catch(() => {});

    expect(fetchSpy).toHaveBeenCalledOnce();
    const url = capturedUrl(fetchSpy);
    expect(url.searchParams.get("since")).toBe("2026-05-14T08:15:00Z");
  });
});
