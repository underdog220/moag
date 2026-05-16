// Tests fuer AuditTab.
// Deckt: 3 Events rendern, Filter-Logik, CSV-Export, Row-Expand,
// Auto-Scroll-Toggle, Empty-State, Client-Filter.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor, fireEvent, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { AuditTab } from "../AuditTab";
import * as apiModule from "../../../lib/api";
import type { AuditResponse } from "../../../lib/types";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
    },
  });
}

function renderWithQuery(ui: ReactNode) {
  const client = makeQueryClient();
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const EVENT_1 = {
  ts: "2026-05-16T11:42:03Z",
  audit_id: "aaa-001",
  client_id: "ocrexpert",
  event_type: "dsgvo_proxy",
  pii_types: ["IBAN", "PERSON"],
  anonymized: true,
  routing_decision: "PROXY",
  duration_ms: 342,
  domain: "DOCUMENTS",
};

const EVENT_2 = {
  ts: "2026-05-16T11:38:51Z",
  audit_id: "bbb-002",
  client_id: "chaoscrusher",
  event_type: "dsgvo_proxy",
  pii_types: [],
  anonymized: false,
  routing_decision: "PROXY",
  duration_ms: 198,
  domain: "DOCUMENTS",
};

const EVENT_3 = {
  ts: "2026-05-16T11:35:17Z",
  audit_id: "ccc-003",
  client_id: "ocrexpert",
  event_type: "transcribe",
  pii_types: ["PHONE"],
  anonymized: true,
  routing_decision: null,
  duration_ms: 1240,
  domain: null,
};

const MOCK_AUDIT_RESPONSE: AuditResponse = {
  events: [EVENT_1, EVENT_2, EVENT_3],
  next_since: null,
  limit: 200,
  returned: 3,
  filters: { pii_type: null, client_id: null },
};

const EMPTY_AUDIT_RESPONSE: AuditResponse = {
  events: [],
  next_since: null,
  limit: 200,
  returned: 0,
  filters: { pii_type: null, client_id: null },
};

beforeEach(() => {
  vi.spyOn(apiModule.api, "getCockpitAudit").mockResolvedValue(MOCK_AUDIT_RESPONSE);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AuditTab", () => {
  it("rendert AuditTab mit Ueberschrift", async () => {
    renderWithQuery(<AuditTab />);
    expect(screen.getByTestId("audit-tab")).toBeInTheDocument();
    expect(screen.getByText("DSGVO-Audit")).toBeInTheDocument();
  });

  it("zeigt alle 3 Events in der Tabelle", async () => {
    renderWithQuery(<AuditTab />);
    await waitFor(() => {
      expect(screen.getByTestId("audit-table")).toBeInTheDocument();
    });
    expect(screen.getByTestId("audit-row-aaa-001")).toBeInTheDocument();
    expect(screen.getByTestId("audit-row-bbb-002")).toBeInTheDocument();
    expect(screen.getByTestId("audit-row-ccc-003")).toBeInTheDocument();
  });

  it("filtert nach event_type: nur dsgvo_proxy-Events sichtbar", async () => {
    renderWithQuery(<AuditTab />);
    await waitFor(() => {
      expect(screen.getByTestId("audit-table")).toBeInTheDocument();
    });
    const select = screen.getByTestId("audit-filter-event-type");
    fireEvent.change(select, { target: { value: "dsgvo_proxy" } });
    await waitFor(() => {
      expect(screen.getByTestId("audit-row-aaa-001")).toBeInTheDocument();
      expect(screen.getByTestId("audit-row-bbb-002")).toBeInTheDocument();
      expect(screen.queryByTestId("audit-row-ccc-003")).not.toBeInTheDocument();
    });
  });

  it("filtert nach client_id: nur ocrexpert-Events sichtbar", async () => {
    renderWithQuery(<AuditTab />);
    await waitFor(() => {
      expect(screen.getByTestId("audit-table")).toBeInTheDocument();
    });
    const select = screen.getByTestId("audit-filter-client");
    fireEvent.change(select, { target: { value: "ocrexpert" } });
    await waitFor(() => {
      expect(screen.getByTestId("audit-row-aaa-001")).toBeInTheDocument();
      expect(screen.getByTestId("audit-row-ccc-003")).toBeInTheDocument();
      expect(screen.queryByTestId("audit-row-bbb-002")).not.toBeInTheDocument();
    });
  });

  it("Row-Expand: Klick auf Zeile zeigt Payload-Details", async () => {
    renderWithQuery(<AuditTab />);
    await waitFor(() => {
      expect(screen.getByTestId("audit-row-aaa-001")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("audit-row-aaa-001"));
    await waitFor(() => {
      expect(screen.getByTestId("audit-row-expanded-aaa-001")).toBeInTheDocument();
    });
    const expanded = screen.getByTestId("audit-row-expanded-aaa-001");
    expect(within(expanded).getByText(/aaa-001/i)).toBeInTheDocument();
  });

  it("zweiter Klick auf dieselbe Zeile klappt sie wieder ein", async () => {
    renderWithQuery(<AuditTab />);
    await waitFor(() => {
      expect(screen.getByTestId("audit-row-aaa-001")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("audit-row-aaa-001"));
    await waitFor(() => {
      expect(screen.getByTestId("audit-row-expanded-aaa-001")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("audit-row-aaa-001"));
    await waitFor(() => {
      expect(screen.queryByTestId("audit-row-expanded-aaa-001")).not.toBeInTheDocument();
    });
  });

  it("CSV-Export-Button startet Download (createObjectURL-Aufruf)", async () => {
    // URL.createObjectURL mocken da jsdom das nicht unterstuetzt
    const createObjectURL = vi.fn(() => "blob:mock");
    const revokeObjectURL = vi.fn();
    // Originale stubbern statt Mock (kein Wrapper der appendChild bricht)
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL,
      revokeObjectURL,
    });

    renderWithQuery(<AuditTab />);
    await waitFor(
      () => {
        expect(screen.getByTestId("audit-table")).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    fireEvent.click(screen.getByTestId("audit-export-csv"));
    expect(createObjectURL).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("Auto-Scroll-Toggle wechselt Status", async () => {
    renderWithQuery(<AuditTab />);
    const toggle = screen.getByTestId("audit-auto-scroll-toggle");
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(toggle).toHaveAttribute("aria-pressed", "false");
    });
    expect(toggle).toHaveTextContent(/aus/i);
  });

  it("zeigt Empty-State wenn keine Events vorhanden", async () => {
    vi.restoreAllMocks();
    vi.spyOn(apiModule.api, "getCockpitAudit").mockResolvedValue(EMPTY_AUDIT_RESPONSE);
    renderWithQuery(<AuditTab />);
    await waitFor(() => {
      expect(screen.getByText(/Keine Audit-Events/i)).toBeInTheDocument();
    });
  });
});
