# FEATURES — MOAG

## Aktiv

### Hard-Fork Frontend (Phase 1)
- Was: `frontend/` — vollständige Vite+React+TS-App, fork aus OCRexpert-GUI-Prototyp
- Code: `frontend/src/`
- Tests: 59 Test-Files, 272 Tests grün

### Aktionen-Achse (Frontend)
- Was: Zweite Top-Achse `/aktionen` — alle ausführbaren Operationen, gruppiert nach Sub-System. DRY-Komponenten für Phase-2-Drilldown-Wiederverwendung.
- Code: `frontend/src/features/aktionen/` (ActionCard, AktionenPage, index)
- Abhängigkeiten: `ConfirmDialog.tsx`, Tooltip (ADR-004), PageBadge
- Tests: `ActionCard.test.tsx` (12), `AktionenPage.test.tsx` (7), `ConfirmDialog.test.tsx` (7)
- Mock-Daten: 12 Aktionen in `mocks/payloads.json` (3 implementiert: oberon.smoke, ocrexpert.health.check, octoboss.cluster.status; 9 Stubs)

### ConfirmDialog-Komponente
- Was: Generischer Modal-Dialog (ESC + Backdrop = Cancel, danger-Modus, custom Labels)
- Code: `frontend/src/components/ConfirmDialog.tsx`
- Tests: `frontend/src/components/ConfirmDialog.test.tsx` (7 Tests)

### NavBar zweistufig (Achsen-Navigation)
- Was: Zwei Haupt-Achsen-Buttons (Übersicht / Aktionen) + sekundäre System-Links nur unter Übersicht-Achse sichtbar
- Code: `frontend/src/components/NavBar.tsx`

### Overview-Cockpit-Seite
- Was: 8 Karten in 3 Gruppen (KI-Backbone / Infrastruktur / Compliance & Test), Hero-Gauge, Mock-Daten
- Code: `frontend/src/features/overview/`
- Tests: `frontend/src/features/overview/Overview.test.tsx` (4 Tests)

### TopBar mit Health-Score
- Was: Sticky TopBar, MOAG-Logo, Gesamt-Health-Score + Gruppen-Indikatoren (KI/Infra/Compl+Test) + Alert-Counter, Hover-Popover
- Code: `frontend/src/components/TopBar.tsx`
- Tests: `frontend/src/components/TopBar.test.tsx` (3 Tests)
- Datenquelle: `/api/v1/aggregator/health` (Polling 10s, Placeholder-Daten wenn Backend offline)

### Tooltip-Komponente (ADR-004)
- Was: Hover-Tooltip mit Titel/Quelle/Aktualisierung/Schwellwert, Long-Press für Mobile
- Code: `frontend/src/components/Tooltip.tsx`
- Tests: `frontend/src/components/Tooltip.test.tsx` (3 Tests)

### Gauge-Komponente (hero + mini)
- Was: Hero-Gauge (SVG-Ring, 80px) + Mini-Gauge (Balken), Farb-Codierung grün/gelb/rot, Tooltip-Pflicht
- Code: `frontend/src/components/Gauge.tsx`
- Tests: `frontend/src/components/Gauge.test.tsx` (5 Tests)

### PageBadge (globale Pflicht)
- Was: `pg:<route> · <commit-hash> · <build-ts>` unten rechts, auf jeder Top-Level-Seite
- Code: `frontend/src/components/PageBadge.tsx`
- Tests: `frontend/src/components/PageBadge.test.tsx` (1 Test)

### Breadcrumb
- Was: Navigations-Pfad `MOAG › Oberon › LLM`, Klick-Navigation
- Code: `frontend/src/components/Breadcrumb.tsx`
- Tests: `frontend/src/components/Breadcrumb.test.tsx` (3 Tests)

### Feature-Wrapper: Oberon
- Was: `/oberon/*` mit Sub-Routen llm/cost/audit/smoke
- Code: `frontend/src/features/oberon/`

### Feature-Wrapper: OctoBoss
- Was: `/octoboss/*` mit Sub-Routen dashboard/cluster
- Code: `frontend/src/features/octoboss/`

### Feature-Wrapper: OCRexpert
- Was: `/ocrexpert/*` mit Sub-Routen jobs/history/charts
- Code: `frontend/src/features/ocrexpert/`

### Feature-Wrapper: SonOfSETI
- Was: `/sonofseti` — Node-Liste aus OctoBoss-Proxy
- Code: `frontend/src/features/sonofseti/`

### Mobile-Optimierung (Phase 7)
- Was: Touch-Targets ≥ 44px, Long-Press-Tooltip, Sub-Tab-Nav scrollbar, Tabellen overflow-x-auto, PageBadge Mobile-kompakt
- Code: `frontend/src/components/Tooltip.tsx`, `TopBar.tsx`, `NavBar.tsx`, `ConfirmDialog.tsx`, `PageBadge.tsx`, alle Sub-Tab-Layouts, `aktionen/ActionCard.tsx`, `nasdominator/pages/Services.tsx`, `nasdominator/pages/Container.tsx`, `oberon/pages/Audit.tsx`
- Tests: `Tooltip.test.tsx` — 3 neue Long-Press-Tests (6 Tests gesamt grün)

### Stubs: NasDominator, qnapbackup, Custos, Panopticor
- Was: Platzhalter-Seiten mit Info + Direktlink, je Phase 3–6
- Code: `frontend/src/features/{nasdominator,qnapbackup,custos,panopticor}/`

## Migriert (war in alter Version, ist in neuer Version)

### LLM-Tab (Oberon Cockpit)
- War: `ocrexpert/gui_frontend/src/features/llm/`
- Ist: `frontend/src/features/llm/` → eingebunden als Sub-Route `/oberon/llm`
- Datum: 2026-05-16

### Cost-Tab (Oberon Cockpit)
- War: `ocrexpert/gui_frontend/src/features/cost/`
- Ist: `frontend/src/features/cost/` → `/oberon/cost`
- Datum: 2026-05-16

### Audit-Tab (Oberon Cockpit)
- War: `ocrexpert/gui_frontend/src/features/audit/`
- Ist: `frontend/src/features/audit/` → `/oberon/audit`
- Datum: 2026-05-16

### Cluster-Dashboard
- War: `ocrexpert/gui_frontend/src/features/cluster-dashboard/`
- Ist: `frontend/src/features/cluster-dashboard/` → `/octoboss/dashboard`
- Datum: 2026-05-16

### Cluster-Swarm
- War: `ocrexpert/gui_frontend/src/features/cluster/`
- Ist: `frontend/src/features/cluster/` → `/octoboss/cluster`
- Datum: 2026-05-16

### Job-Queue, Job-Detail, History, Charts
- War: `ocrexpert/gui_frontend/src/features/{job-queue,job-detail,history,charts}/`
- Ist: unter `frontend/src/features/` → als Sub-Routen von `/ocrexpert/*`
- Datum: 2026-05-16

### TopBar (OCRexpert-Hub-Anzeige)
- War: `ocrexpert/gui_frontend/src/components/TopBar.tsx` — Hub-Badge + Cluster-Health
- Ist: `frontend/src/components/TopBar.tsx` — MOAG Health-Score + Gruppen-Indikatoren (komplett neu geschrieben)
- Datum: 2026-05-16

## Verloren / Migrations-TODO

_(noch leer — wird in Phase 1 aus OCRexpert-GUI-Inventur gefüllt)_

## Bewusst deprecated

_(noch leer)_

## Klärungsbedarf

### A/B-Compare (Phase-2-Stub aus OCRexpert)
- Was: Engine-A vs. Engine-B Vergleich pro OCR-Job (heute `available=false`).
- Stand: Im Prototyp als Stub vorhanden. Roman muss entscheiden, ob MOAG es weiterführt oder fallenlässt.

### Multi-Hub-Discovery vs. Single-Hub
- Was: Prototyp pollt mehrere OctoBoss-Hubs parallel (VDR + NAS-Shadow).
- Stand: Sinnvoll in MOAG, aber V1 könnte mit Single-Hub starten und Multi-Hub Phase 2.

---

### Aktionen-API (Phase 1, V1)
- Was: GET /api/v1/actions (Registry-Liste) + POST /api/v1/actions/{id}/trigger. 3 echte Aktionen (oberon.smoke, ocrexpert.health.check, octoboss.cluster.status) + 9 Stubs. Registry-Pattern mit @register-Dekorator. Pipeline-Logging via plog. ActionTriggerResponse-Schema per docs/ACTIONS_SCHEMA.md.
- Code: `backend/moag/actions/`, `backend/moag/schemas.py`
- Tests: `tests/test_actions_oberon_smoke.py`, `tests/test_actions_ocrexpert_health.py`, `tests/test_actions_octoboss_cluster_status.py`, `tests/test_actions_stubs.py`, `tests/test_api.py` (Aktionen-Section)

## Geplante Features (V1, aus Architektur-Konsens 2026-05-16)

Diese Liste rutscht nach Implementierung in `Aktiv`. Heute sind sie Planungs-Backlog.

### Top-Leiste (Phase 2)
- Gesamt-Health-Score (gewichteter Mittelwert über alle 8 Systeme)
- 3 Gruppen-Sub-Indikatoren (KI / Infra / Compl+Test) mit Hover-Aufklapp-Detail
- Alert-Counter mit Drilldown-Liste
- Sticky auf allen Routen

### Cockpit-Startseite (Phase 1+2)
- 8 Karten mit Hero-Gauge (60–80px) + 2–3 Mini-Indikatoren
- Karten nach Gruppen sortiert
- Klick auf Karte → Drilldown Tiefe 2
- Mobile: vertikales Stacking, Gruppen-Header als Separator

### Pflicht-Tooltip-System (Phase 2)
- Jede Zahl, Status-Ampel, Button bekommt Tooltip
- Format: Erklärung + Datenquelle + Aktualisierungszeit + Schwellwert-Legende
- Mobile: Long-Press
- Code-Review-Kriterium

### PageBadge (Phase 2)
- Footer-Element unten rechts: `pg:<route> · <commit-hash> · <build-timestamp>`
- Auf jeder Top-Level-Seite, Pflicht aus globaler CLAUDE.md

### Drilldown Tiefe 2 (Phase 1–6)
- Sub-Bereiche eines Sub-Systems (z.B. Oberon → LLM / DSGVO / Audit / Instances / DB / Contract / Smoke / PII)

### Drilldown Tiefe 3 (Phase 1–6)
- Detail-Entity (z.B. Anthropic-Provider mit Health-History + Cost-Verlauf + Last-Calls-Stream)

### Drilldown Tiefe 4 (Phase 2+)
- Live-Stream / Historie / Roh-JSON-Inspector

### Adapter-Schicht (Phase 1–6)
- Je Sub-System ein Backend-Adapter (`oberon`, `octoboss`, `sonofseti`, `ocrexpert`, `nasdominator`, `qnapbackup`, `custos`, `panopticor`)
- Einheitliche Status-Antwort (`/api/v1/status` Konvention, ADR-008)

### qnapbackup-iframe-Voll-Ansicht (Phase 5)
- MOAG-Card mit eigenem Gauge + Mini-Status
- Button "Web-UI öffnen" → iframe oder neuer Tab auf existierendes qnapbackup-UI

### Panopticor-Action-Buttons (Phase 6)
- Scenario-Liste + Trigger-Button pro Szenario
- Run-Historie mit Pass/Fail-Status
- Confirm-Dialog vor jedem Trigger

### Mobile-Tauglichkeit (Phase 7) — implementiert, noch nicht gemessen
- Lighthouse-Score: noch nicht gemessen (Bonus, optional)
- Alle Cards lesbar auf 360px Viewport — Overview stackt 1-Spalte, Aktionen 1-Spalte
- Touch-Targets ≥ 44×44px — überall umgesetzt

### Settings-Verwaltung (Phase 1)
- System-URLs editieren
- Auth-Tokens je System (Bearer / X-DevLoop / X-SonOfSETI)
- Poll-Intervalle pro System
- Default-Gruppen-Reihenfolge
