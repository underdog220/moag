// Smoke-Tests fuer Custos-Feature-Pages.

import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

import { CustosLayout } from "../CustosLayout";
import { FindingsPage } from "../pages/Findings";
import { RulesPage } from "../pages/Rules";
import { AuditPage } from "../pages/Audit";
import * as apiModule from "../../../lib/api";

// ── Test-Helpers ──────────────────────────────────────────────────────────────

function makeQC() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchInterval: false, staleTime: 0 },
    },
  });
}

function wrap(node: ReactNode, initialPath = "/custos/findings") {
  return (
    <MemoryRouter initialEntries={[initialPath]}>
      <QueryClientProvider client={makeQC()}>{node}</QueryClientProvider>
    </MemoryRouter>
  );
}

const MOCK_FINDING = {
  id: "00000000-0000-0000-0000-000000000001",
  entdeckt_am: "2026-05-17T08:00:00Z",
  regel_id: "r1",
  quelle_app: "alter",
  schwere: "CRIT" as const,
  entitaet_typ: "mietvertrag",
  entitaet_id: null,
  titel: "Test-Finding",
  beschreibung: "Beschreibung des Findings.",
  ki_kontext: null,
  prioritaet_score: "0.9",
  status: "OFFEN" as const,
  user_feedback: null,
  zugewiesen_an: null,
  geloest_am: null,
  erstellt_am: "2026-05-17T08:00:00Z",
  geaendert_am: "2026-05-17T08:00:00Z",
};

const MOCK_REGEL = {
  id: "r1",
  quelle_app: "alter",
  titel: "Mietvertrag-Pruefung",
  beschreibung: "Prueft laufende Mietvertraege.",
  kategorie: "DOKUMENTATION" as const,
  schwere_default: "CRIT" as const,
  sql_query: "SELECT ...",
  aktiv: true,
  laufintervall_minuten: 60,
  letzter_lauf: "2026-05-17T08:00:00Z",
  erstellt_am: "2026-01-01T00:00:00Z",
};

// ── CustosLayout ──────────────────────────────────────────────────────────────

describe("CustosLayout", () => {
  it("rendert die drei Sub-Tab-Labels", () => {
    render(wrap(<CustosLayout />, "/custos/findings"));
    expect(screen.getByText("Findings")).toBeInTheDocument();
    expect(screen.getByText("Regeln")).toBeInTheDocument();
    expect(screen.getByText("Audit")).toBeInTheDocument();
  });

  it("hat aria-label auf der Nav", () => {
    render(wrap(<CustosLayout />));
    expect(
      screen.getByRole("navigation", { name: "Custos-Navigation" }),
    ).toBeInTheDocument();
  });
});

// ── FindingsPage ──────────────────────────────────────────────────────────────

describe("FindingsPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("zeigt Findings wenn Daten vorhanden", async () => {
    vi.spyOn(apiModule.api.custos, "getFindings").mockResolvedValue([MOCK_FINDING]);

    render(wrap(<FindingsPage />));
    await waitFor(() => {
      expect(screen.getByTestId("custos-findings")).toBeInTheDocument();
      expect(screen.getByText("Test-Finding")).toBeInTheDocument();
    });
  });

  it("zeigt EmptyState bei leerer Liste", async () => {
    vi.spyOn(apiModule.api.custos, "getFindings").mockResolvedValue([]);

    render(wrap(<FindingsPage />));
    await waitFor(() => {
      expect(screen.getByText("Keine Findings")).toBeInTheDocument();
    });
  });

  it("zeigt Severity-Filter-Dropdown", async () => {
    vi.spyOn(apiModule.api.custos, "getFindings").mockResolvedValue([]);
    render(wrap(<FindingsPage />));
    expect(screen.getByLabelText("Schwere")).toBeInTheDocument();
  });
});

// ── RulesPage ─────────────────────────────────────────────────────────────────

describe("RulesPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("zeigt Regeln wenn Daten vorhanden", async () => {
    vi.spyOn(apiModule.api.custos, "getRules").mockResolvedValue([MOCK_REGEL]);
    vi.spyOn(apiModule.api, "getActions").mockResolvedValue({
      actions: [],
      fetched_at: new Date().toISOString(),
    });

    render(wrap(<RulesPage />));
    await waitFor(() => {
      expect(screen.getByTestId("custos-rules")).toBeInTheDocument();
      expect(screen.getByText("Mietvertrag-Pruefung")).toBeInTheDocument();
    });
  });

  it("zeigt ActionCard wenn custos.rules.run in Registry", async () => {
    vi.spyOn(apiModule.api.custos, "getRules").mockResolvedValue([]);
    vi.spyOn(apiModule.api, "getActions").mockResolvedValue({
      actions: [
        {
          action_id: "custos.rules.run",
          system_id: "custos",
          name: "Compliance-Regeln ausfuehren",
          description: "Fuehrt alle aktiven Regeln aus.",
          category: "diagnose",
          sub_area: "rules",
          requires_confirm: false,
          is_destructive: false,
          estimated_duration_s: 10,
          implemented: true,
        },
      ],
      fetched_at: new Date().toISOString(),
    });

    render(wrap(<RulesPage />));
    await waitFor(() => {
      expect(screen.getByText("Jetzt ausführen")).toBeInTheDocument();
    });
  });

  it("zeigt EmptyState bei leerer Regelliste", async () => {
    vi.spyOn(apiModule.api.custos, "getRules").mockResolvedValue([]);
    vi.spyOn(apiModule.api, "getActions").mockResolvedValue({ actions: [], fetched_at: "" });

    render(wrap(<RulesPage />));
    await waitFor(() => {
      expect(screen.getByText("Keine Regeln")).toBeInTheDocument();
    });
  });
});

// ── AuditPage ─────────────────────────────────────────────────────────────────

describe("AuditPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("zeigt Audit-Eintraege wenn Daten vorhanden", async () => {
    vi.spyOn(apiModule.api.custos, "getAudit").mockResolvedValue({
      regeln: [
        {
          regel_id: "r1",
          aktiv: true,
          laufintervall_minuten: 60,
          letzter_lauf: "2026-05-17T08:00:00Z",
        },
      ],
      count_aktiv: 1,
      count_gesamt: 1,
    });

    render(wrap(<AuditPage />));
    await waitFor(() => {
      expect(screen.getByTestId("custos-audit")).toBeInTheDocument();
      expect(screen.getByText("r1")).toBeInTheDocument();
    });
  });

  it("zeigt EmptyState bei leeren Audit-Daten", async () => {
    vi.spyOn(apiModule.api.custos, "getAudit").mockResolvedValue({
      regeln: [],
      count_aktiv: 0,
      count_gesamt: 0,
    });

    render(wrap(<AuditPage />));
    await waitFor(() => {
      expect(screen.getByText("Keine Audit-Daten")).toBeInTheDocument();
    });
  });

  it("zeigt Aktiv/Gesamt-Zaehler", async () => {
    vi.spyOn(apiModule.api.custos, "getAudit").mockResolvedValue({
      regeln: [],
      count_aktiv: 3,
      count_gesamt: 5,
    });

    render(wrap(<AuditPage />));
    await waitFor(() => {
      // Gezielt auf den Aktiv-Zaehler (<strong>) statt /3/ — sonst kollidiert die
      // Regex mit dem PageBadge (Commit-Hash/Uhrzeit enthalten ggf. eine "3").
      expect(screen.getByText("3", { selector: "strong" })).toBeInTheDocument();
    });
  });
});
