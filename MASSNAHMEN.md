# MASSNAHMEN — MOAG

Chronologische Liste aller Maßnahmen. Format: `[Datum] [Version] Beschreibung`.

## 2026-05-16

- [2026-05-16] [v0.1.0-pre] Projekt-Verzeichnis `C:\code\moag` angelegt.
- [2026-05-16] [v0.1.0-pre] Eröffnungs-Scan über vier Explore-Agents abgeschlossen: OCRexpert-Prototyp, Oberon-API, OctoBoss-API, SonOfSETI-API, Kandidaten-Sichtung (NasDominator, Panopticor, DevLoop, OllamaStation, oberon-anonymizer, sebald-suite, sebald-schemas, qnapbackup, Custos, money, alter).
- [2026-05-16] [v0.1.0-pre] Architektur-Entscheidungen mit Roman geklopft: Hard-Fork aus OCRexpert-GUI, Container auf VDR, 8 Sub-Systeme im Scope (Oberon, OctoBoss, SonOfSETI, OCRexpert, NasDominator, qnapbackup, Custos, Panopticor), Cockpit-Layout mit Gauges + gruppierter Top-Health-Leiste + Drilldown + Pflicht-Tooltips + Mobile-Tauglichkeit.
- [2026-05-16] [v0.1.0-pre] Pflicht-Doku geschrieben: PROJEKT_STATUS.md, MASSNAHMEN.md, ARCHITEKTUR.md, FEATURES.md, CLAUDE.md.
- [2026-05-16] [v0.1.0-pre] Infrastruktur-Setup: docker/Dockerfile (Multi-Stage Node→Python-Slim, EXPOSE 17900), .dockerignore, scripts/build-state.ps1 (Verdikt-Skript), README.md, .env.example (8 Sub-Systeme).
- [2026-05-16] [v0.1.0] Phase-1 Frontend: Hard-Fork OCRexpert-GUI → MOAG. Kopiert + umgebaut: frontend/ mit Vite-Proxy auf :17900, Build-Output auf backend/moag/static/. Neue Komponenten: TopBar (Health-Score + Gruppen-Indikatoren), Tooltip (ADR-004), Gauge (hero+mini), PageBadge, Breadcrumb, NavBar. Neue Features: overview/ (8 Karten in 3 Gruppen), oberon/ (Sub-Routen llm/cost/audit/smoke), octoboss/ (dashboard/cluster), ocrexpert/ (jobs/history/charts), sonofseti/ (Node-Liste), nasdominator/qnapbackup/custos/panopticor/ (Stubs). App.tsx komplett auf MOAG-Routing umgebaut, Legacy-Routen redirecten. Mock-Daten für /api/v1/overview + /api/v1/aggregator/health. 245 Tests grün (56 Test-Files). TypeScript strict, npm run build grün.
