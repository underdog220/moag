// Zentrale Stelle fuer Build-Info und Mock-Modus-Erkennung.

export const BUILD_HASH: string =
  (import.meta.env.VITE_BUILD_HASH as string | undefined) || "dev";
export const BUILD_TS: string =
  (import.meta.env.VITE_BUILD_TS as string | undefined) || new Date().toISOString();

/**
 * Mock-Modus aktiv wenn:
 *  - Query-Param `?mock=true` (oder mock=1) in URL
 *  - oder ENV `VITE_USE_MOCKS=true` beim Build/Dev-Start
 *  - oder LocalStorage-Key `moag.mock=true` (Toggle in der UI)
 */
export function isMockMode(): boolean {
  // 1) Query-Param hat Vorrang
  if (typeof window !== "undefined" && window.location) {
    const params = new URLSearchParams(window.location.search);
    const v = params.get("mock");
    if (v != null) {
      if (v === "true" || v === "1") return true;
      if (v === "false" || v === "0") return false;
    }
    try {
      const ls = window.localStorage?.getItem("moag.mock");
      if (ls === "true") return true;
      if (ls === "false") return false;
    } catch {
      // SecurityError in inkognito
    }
  }
  // 2) Build-time ENV
  return String(import.meta.env.VITE_USE_MOCKS || "").toLowerCase() === "true";
}

export function setMockMode(active: boolean): void {
  try {
    window.localStorage?.setItem("moag.mock", String(active));
  } catch {
    // ignore
  }
}
