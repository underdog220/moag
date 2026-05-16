// Mock-Loader: simuliert API-Antworten + WS-Events fuer Entwicklung ohne Backend.
// Quelle: docs/gui-briefings/mock_payloads.json (in src/mocks/payloads.json kopiert)

import payloads from "./payloads.json";

type AnyPayloads = Record<string, any>;
const data = payloads as AnyPayloads;

// In-Memory-Mock-State (Subagent C): erlaubt POSTs im Mock-Modus eine
// nachfolgende GET-Antwort zu beeinflussen — z.B. Default-Hub-Switch.
// Wird beim Page-Reload zurueckgesetzt (nicht persistiert).
const mockState: { defaultHubId: string | null } = { defaultHubId: null };

export function setMockDefaultHub(id: string | null): void {
  mockState.defaultHubId = id;
}

/**
 * Liefert Mock-Daten fuer einen GET-Request.
 * `path` kommt vom api.ts-Client OHNE `/api`-Prefix (z.B. "/cluster/hubs").
 * Mock-Keys sind aber im Format "GET /api/cluster/hubs" — wir matchen beide.
 */
export function mockGet<T>(path: string): T | undefined {
  const candidates = [path, `/api${path}`];
  let raw: unknown | undefined;
  for (const cand of candidates) {
    const fullKey = `GET ${cand}`;
    if (fullKey in data) {
      raw = data[fullKey];
      break;
    }
    const noQuery = cand.split("?")[0];
    const noQueryKey = `GET ${noQuery}`;
    if (noQueryKey in data) {
      raw = data[noQueryKey];
      break;
    }
  }

  // Pfad-Pattern-Match fuer Job-Endpoints: /jobs/<id>, /jobs/<id>/text,
  // /jobs/<id>/ab-compare. Greift nur, wenn der direkte Lookup oben nichts
  // gefunden hat (sonst wuerden Spezial-Mappings ueberschrieben).
  if (raw === undefined) {
    const noQuery = path.split("?")[0];
    if (noQuery.startsWith("/jobs/") && !noQuery.includes("/jobs/upload")) {
      const m = noQuery.match(/^\/jobs\/([^/]+)(\/[a-z-]+)?$/u);
      if (m) {
        const sub = m[2] || "";
        const fallbackId = "ocr-3aeb6a5c";
        const fallback = data[`GET /api/jobs/${fallbackId}${sub}`];
        if (fallback) {
          raw = fallback;
        }
      }
    }
  }

  if (raw === undefined) return undefined;

  // State-Overlay: Default-Hub-Switch im Mock-Modus.
  if (
    mockState.defaultHubId &&
    (path === "/cluster/hubs" || path === "/api/cluster/hubs")
  ) {
    const r = raw as { hubs?: Array<{ id: string; is_default?: boolean }> };
    if (Array.isArray(r.hubs)) {
      return {
        ...r,
        hubs: r.hubs.map((h) => ({ ...h, is_default: h.id === mockState.defaultHubId })),
      } as unknown as T;
    }
  }

  return raw as T;
}

/** WS-Event-Beispiele aus den Mocks. Im Mock-Modus rotieren wir durch. */
export function mockWsEvents(): unknown[] {
  return (data["WS_EVENTS_EXAMPLES"] ?? []) as unknown[];
}
