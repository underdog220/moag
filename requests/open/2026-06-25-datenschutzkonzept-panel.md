---
id: 2026-06-25-datenschutzkonzept-panel
datum: 2026-06-25
prioritaet: P2
status: open
repo: moag
kontakt: Roman
betroffene_repos: [moag, Oberon]
blockiert_durch: [2026-06-25-moag-datenschutzkonzept-generator]
labels: [doku, dsgvo]
---

# Datenschutzkonzept-Panel: versioniertes, quellenbelegtes DSGVO-Konzept in MOAG anzeigen

## Kontext / Problem

Oberon erhaelt einen Generator, der ein versioniertes, quellenbelegtes Datenschutzkonzept
ueber die ueber Oberon gerouteten Datenfluesse erzeugt (CR
`Oberon/requests/open/2026-06-25-moag-datenschutzkonzept-generator.md`). MOAG soll dieses
Konzept als eigene Feature-Seite **read-only** anzeigen: aktuelle Fassung, Versionsverlauf,
ehrliche Problem-Flags, Quellen als anklickbare Live-Links — damit ein Anwalt es schnell
pruefen kann. Heute existiert in MOAG keine Datenschutz-/Compliance-Anzeige.

## Gewuenschtes Verhalten

**Backend (`backend/moag/`):**
- Neuer Proxy `routes_datenschutz.py` (oder Erweiterung `routes_oberon.py`) unter
  `/api/v1/oberon/datenschutz-konzept[/versions[/{id}]]` + `POST .../generate`, der die
  Oberon-Endpunkte (`/api/v2/admin/datenschutzkonzept*`) durchreicht. Auth ueber bestehenden
  `oberon_token` (`settings_store.py`), Client-Muster `clients/oberon_cockpit_client.py`,
  Stub-Response bei fehlendem Token (bestehende Konvention).
- Router in `api.py` (`create_app()`) registrieren.
- Falls Oberon den Quellen-Verfuegbarkeits-Check nicht selbst macht (NAS-Egress-Frage, siehe
  Oberon-CR „Akzeptable Alternative"): MOAG-Backend prueft die `sources[].url` per HTTP und
  fuellt `available`. Sonst nur durchreichen.
- `PipelineLog`-Logging im Adapter (ENV `MOAG_PIPELINE_LOG_ENABLED`).

**Frontend (`frontend/src/`):**
- Neues Feature `features/datenschutz/` (Muster wie `features/oberon/`): `index.tsx`
  (`export { default }`), Seite `pages/KonzeptPage.tsx`, optional `DatenschutzLayout.tsx`
  mit Sub-Tabs „Aktuell" / „Verlauf".
- Route in `App.tsx`: `<Route path="/datenschutz/*" element={<DatenschutzFeature />} />`.
- Response-Interfaces in `lib/types.ts` (`DatenschutzKonzeptVersion`, `KonzeptSource`,
  `KonzeptProblem`), API-Methoden in `lib/api.ts` (`api.datenschutz.*`).
- Anzeige: gerendertes `prose_markdown`; **Quellen als anklickbare Links** mit sichtbarem
  Verfuegbarkeits-Status (gruen verfuegbar / rot tot, aus `available` + `last_checked`);
  **Problem-Flags** prominent (Severity-Badge); **Versionsliste** mit `generated_at`;
  fixe **Scope-Disclaimer-Box** („Nicht abgedeckt: Entwicklungs-Direktzugriff; technischer
  Bericht, kein juristisches VVT nach Art. 30 DSGVO" — aus `scope_note`).
- Button „Jetzt neu generieren" loest `POST .../generate` aus (mit Confirm-Dialog, da
  LLM-Kosten; ADR „keine Mutation ohne Confirm").

## Akzeptanz-Probe

1. `curl -s http://localhost:<moag-backend>/api/v1/oberon/datenschutz-konzept | jq '.version'`
   -> liefert aktuelle Versionsnummer (oder `stub:true` ohne Token).
2. Frontend-Route `/datenschutz` rendert: Prosa, Quellen-Links (klickbar, Status sichtbar),
   Problem-Flags, Versionsliste, Scope-Disclaimer-Box.
3. ADR-004: jeder Button/jede Zahl/jedes Status-Symbol hat `<Tooltip>` (Erklaerung +
   Datenquelle-Endpoint + Aktualisierungszeit). Code-Review-Blocker wenn fehlend.
4. PageBadge unten rechts vorhanden (`pg:datenschutz.konzept · <hash> · <ts>`).
5. `pwsh scripts/build-state.ps1` -> Verdikt OK/HMR vor „schau mal nach".

## Out-of-Scope

- Side-by-side Versions-Diff-View (Backlog).
- Alert-Center- + Overview-Karten-Integration der Problem-Flags (Backlog; kommt spaeter via
  ADR-008 `SystemStatus`-Adapter `adapters/datenschutz.py`).
- PDF-/Englisch-Export (Backlog).
- Jegliche Anzeige des Claude-Code-Entwicklungs-Direktzugriffs — bewusst NICHT Teil des
  Konzepts (nur als Scope-Disclaimer benannt).

## Verwandte CRs / Memories

- Blockiert durch: `Oberon/requests/open/2026-06-25-moag-datenschutzkonzept-generator.md`
  (liefert die konsumierten Endpunkte + das Schema).
- Muster: `features/oberon/pages/Revision.tsx` (DSGVO-Revisions-Panel), `routes_oberon.py`,
  `clients/oberon_cockpit_client.py`.
- Memory `project_claude_dsgvo_plan.md` (Gesamtkontext DSGVO-Buero).
- ADR-004 (Tooltip), ADR-008 (SystemStatus) in `ARCHITEKTUR.md`.
- grep `requests/open|done` nach "datenschutz"/"konzept": keine bestehenden Treffer.

## Sandbox-Beweis-Anforderung

`nein, weil` — reines Frontend + lesender Backend-Proxy, kein Cutover/System-Touch. Verifikation
ueber `build-state.ps1` + manueller Routen-Test + Validator. Der einzige mutierende Pfad
(`generate`) ist hinter Confirm-Dialog und loest nur den Oberon-Generator aus.

## Sub-Agent-Pflichtlektuere

- `C:\code\moag\requests\README.md` (Workflow)
- `C:\code\moag\CLAUDE.md` (ADR-004 Tooltip, ADR-008, PageBadge, build-state, Pipeline-Log,
  „kein eigener LLM-Call", „keine Mutation ohne Confirm")
- `C:\code\moag\PROJEKT_STATUS.md` + `MASSNAHMEN.md` + `ARCHITEKTUR.md` §9
- `frontend/src/App.tsx`, `frontend/src/lib/{types.ts,api.ts}`, `features/oberon/` (Muster)
- `backend/moag/routes_oberon.py`, `clients/oberon_cockpit_client.py`, `api.py`, `settings_store.py`
- Das blockierende Oberon-CR (fuer das Wire-Schema)

## Aufwand-Schaetzung

Klein-Mittel (1-2 Tage), reines Anbinden bekannter Muster. Risiko niedrig. Erst startbar, wenn
das Oberon-CR die Endpunkte + das sebald-schemas-Schema geliefert hat.

## Akzeptable Alternative

Wenn der Generator anfangs nur eine Version liefert (kein Verlauf): MVP zeigt nur „Aktuell" +
Scope-Disclaimer + Quellen; „Verlauf"-Tab erst wenn mehr als eine Version existiert.

## Auswirkung wenn nicht umgesetzt

Der von Oberon erzeugte Bericht ist nicht im Cockpit sichtbar; Roman/Anwalt muesste die
Oberon-API direkt abfragen — der eigentliche Nutzen (schnelle, anwaltstaugliche Sicht) entfaellt.
