# PROJEKT_STATUS — MOAG (Mother of All GUIs)

## Aktueller Stand
Phase 1 vollständig: Frontend (Hard-Fork OCRexpert-GUI, 245 Frontend-Tests grün) + Backend (moag Python-Package, 123 Backend-Tests grün). Bereit für Docker-Container auf VDR und echte Adapter-Verkabelung.

## Version
v0.1.0 (Phase 1 komplett: Frontend + Backend)

## Nächste geplante Stufe
Phase 2: Docker-Container auf VDR deployen (Port 17900), echte Aggregator-Daten an Frontend-TopBar verkabeln.

## Offene Punkte
- Docker-Container bauen + auf VDR deployen
- GitHub-Repo `underdog220/moag` erstellen + push
- Phase 1.5: ocrexpert-Adapter Pipeline-Jobs via POST /api/jobs/upload
- qnapbackup: Status-Endpoint-CR einreichen (CR #3, Phase 5)
- Panopticor: Status+Actions-API-CR einreichen (CR #4, Phase 6)
- NasDominator: API-Reife für Health-Aggregation prüfen (Phase 3)
- Custos: Findings-Widget-Schema festlegen (Phase 4)
- sonofseti-Adapter: node_addresses aus Settings versorgen

## Letzte Änderung
2026-05-16 — Phase 1 Backend: moag Python-Package, 8 Adapter, Aggregator, 123 Tests grün.
