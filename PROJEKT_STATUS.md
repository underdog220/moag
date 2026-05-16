# PROJEKT_STATUS — MOAG (Mother of All GUIs)

## Aktueller Stand
Phase 1 Frontend abgeschlossen. Hard-Fork von OCRexpert-GUI-Prototyp nach `frontend/` vollständig: npm run build grün, 245 Tests (56 Files) grün. Overview-Seite mit 8 Karten in 3 Gruppen, TopBar mit Health-Score, alle Pflicht-Komponenten (Tooltip, Gauge, PageBadge, Breadcrumb). Backend-Subagent läuft parallel in `backend/`.

## Version
v0.1.0 (Phase 1 Frontend fertig)

## Nächste geplante Stufe
Phase 1 abschließen: Backend-Subagent fertigstellen, Docker-Container auf VDR deployen (Port 17900).
Phase 2: Top-Health-Leiste mit echten Aggregator-Daten verkabeln.

## Offene Punkte
- Backend-Subagent `backend/moag/` fertigstellen (läuft parallel)
- Docker-Container bauen + auf VDR deployen
- GitHub-Repo `underdog220/moag` erstellen + push
- qnapbackup: Status-Endpoint-CR einreichen (Task #3)
- Panopticor: Status+Actions-API-CR einreichen (Task #4)
- NasDominator: API-Reife für Health-Aggregation prüfen (Phase 3)
- Custos: Findings-Widget-Schema festlegen (Phase 4)

## Letzte Änderung
2026-05-16 — Phase 1 Frontend: Hard-Fork OCRexpert-GUI, 8 Feature-Ordner, neue Pflicht-Komponenten, 245 Tests grün.
