import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

beforeEach(() => {
  Object.defineProperty(window, "location", {
    value: new URL("http://localhost:5173/?mock=true"),
    writable: true,
  });
});

describe("useWebSocket im Mock-Modus", () => {
  it("setzt Status auf 'mock' und feuert Events", async () => {
    const { useWebSocket } = await import("./ws");
    const onEvent = vi.fn();
    const { result } = renderHook(() => useWebSocket({ onEvent }));

    expect(result.current.status).toBe("mock");

    // Mock-Modus feuert alle 2s — wir warten bis zu 3.5s auf min. 1 Event
    await waitFor(() => expect(onEvent).toHaveBeenCalled(), { timeout: 3_500 });
  }, 10_000);
});
