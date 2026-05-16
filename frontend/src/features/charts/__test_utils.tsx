// Test-Utilities fuer Chart-Component-Tests.
// Bietet einen QueryClient-Wrapper und gemockte api-Antworten.

import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { vi } from "vitest";

/** Erstellt frischen QueryClient ohne Retries — Tests sollen deterministisch sein. */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
    },
  });
}

/** Renders Component innerhalb eines frischen QueryClient-Provider. */
export function renderWithQuery(ui: ReactNode) {
  const client = makeQueryClient();
  const utils = render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
  return { ...utils, client };
}

/** Hilfsfunktion: mockt einen einzelnen api-Aufruf via vi.spyOn. */
export function mockApi<K extends keyof typeof import("../../lib/api").api>(
  module: { api: typeof import("../../lib/api").api },
  method: K,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result: any,
) {
  return vi.spyOn(module.api, method as never).mockResolvedValue(result);
}

/** Wartet bis ein Element mit dem testid sichtbar ist (kompakt fuer Tests). */
export async function waitForTestId(
  findByTestId: (id: string) => Promise<HTMLElement>,
  testid: string,
): Promise<HTMLElement> {
  return findByTestId(testid);
}
