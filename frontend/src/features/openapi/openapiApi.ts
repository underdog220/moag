// Lokaler Fetch-Wrapper fuer den OpenAPI-Browser.
// Eigene Typen + eigenes fetch-Pattern — KEIN Import aus lib/api.ts oder lib/types.ts.

const API_BASE = "/api/v1/openapi";

// ── Typen ─────────────────────────────────────────────────────────────────────

/** Ein bekanntes System (Ziel fuer den OpenAPI-Browser). */
export interface OpenApiTarget {
  id: string;
  name: string;
  url: string;
}

/** Ein einzelner API-Endpoint. */
export interface OpenApiEndpoint {
  path: string;
  method: string;
  summary: string;
  tags: string[];
}

/** Antwort fuer ein einzelnes Target. */
export interface OpenApiSpec {
  target: string;
  reachable: boolean;
  endpoint_count?: number;
  endpoints: OpenApiEndpoint[];
  error?: string;
}

// ── Fehler-Klasse ─────────────────────────────────────────────────────────────

export class OpenApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly path: string,
    message: string,
  ) {
    super(message);
    this.name = "OpenApiError";
  }
}

// ── Fetch-Hilfsfunktion ────────────────────────────────────────────────────────

async function apiFetch<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    });
  } catch (e) {
    throw new OpenApiError(0, path, `Netzwerk-Fehler: ${(e as Error).message}`);
  }

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const data = await res.json();
      const d = data?.detail;
      if (typeof d === "string") {
        detail = d;
      } else if (d && typeof d === "object") {
        detail = (d.message as string) || JSON.stringify(d);
      } else {
        detail = JSON.stringify(data);
      }
    } catch {
      try {
        detail = await res.text();
      } catch {
        // ignore
      }
    }
    throw new OpenApiError(res.status, path, detail || `HTTP ${res.status}`);
  }

  return (await res.json()) as T;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/** GET /api/v1/openapi/targets — alle bekannten Systeme. */
export function fetchOpenApiTargets(): Promise<OpenApiTarget[]> {
  return apiFetch<OpenApiTarget[]>(`${API_BASE}/targets`);
}

/** GET /api/v1/openapi/{target} — Endpoint-Liste fuer ein System. */
export function fetchOpenApiSpec(target: string): Promise<OpenApiSpec> {
  return apiFetch<OpenApiSpec>(`${API_BASE}/${encodeURIComponent(target)}`);
}
