import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock-Modus: env.ts soll true zurueckgeben — wir patchen lokales window.location
const FAKE_URL = "http://localhost:5173/dashboard?mock=true";

beforeEach(() => {
  // jsdom: Setze window.location.search via reload mit URL
  Object.defineProperty(window, "location", {
    value: new URL(FAKE_URL),
    writable: true,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("api (Mock-Modus)", () => {
  it("liefert Hubs aus Mock-Daten ohne fetch-Call", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      throw new Error("fetch sollte im Mock-Modus nicht gerufen werden");
    });

    const { api } = await import("./api");
    const res = await api.getHubs();
    expect(res.hubs.length).toBeGreaterThan(0);
    expect(res.hubs[0]).toHaveProperty("id");
    expect(res.hubs[0]).toHaveProperty("url");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("liefert Job-Detail-Fallback bei unbekannter ID", async () => {
    const { api } = await import("./api");
    const res = await api.getJob("ocr-irgendwas");
    expect(res).toHaveProperty("job_id");
    expect(res).toHaveProperty("filename");
  });
});
