# FEATURES — MOAG

## Aktiv

_(noch leer — Code-Migration startet in Phase 1)_

## Migriert (war in alter Version, ist in neuer Version)

_(Migrations-Quelle: OCRexpert-GUI-Prototyp `ocrexpert-gui:0.7.1`. Wird in Phase 1 nachgepflegt.)_

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

### Mobile-Tauglichkeit (Phase 7)
- Lighthouse-Mobile-Score ≥ 90
- Alle Cards lesbar auf 360px Viewport
- Touch-Targets ≥ 44×44px

### Settings-Verwaltung (Phase 1)
- System-URLs editieren
- Auth-Tokens je System (Bearer / X-DevLoop / X-SonOfSETI)
- Poll-Intervalle pro System
- Default-Gruppen-Reihenfolge
