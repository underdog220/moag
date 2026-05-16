# PROJEKT_STATUS — MOAG (Mother of All GUIs)

## Aktueller Stand
Phase 1 vollständig + lokaler Smoke + Container-Build + VDR-Deploy live. Container `moag:0.1.0` läuft auf VDR:17900 (healthy), Browser-Test unter `http://192.168.200.71:17900/`. OctoBoss-Adapter erreichbar (5/5 Nodes), Oberon-Adapter im Stub-Modus (Token noch nicht konfiguriert), OCRexpert-Adapter aktuell offline (VDR:17810 nicht erreichbar — Roman, später checken), 4 Stub-Adapter wie vorgesehen.

## Version
v0.1.0 (Phase 1 komplett + Container live auf VDR)

## Nächste geplante Stufe
Phase 2: Top-Health-Leiste echte Daten + Pflicht-Tooltip-Komponente verfeinern + PageBadge-Coverage. Parallel: Oberon-Token konfigurieren (echte Cockpit-Daten), OCRexpert-Service-Adresse klären.

## Offene Punkte
- Phase 1.5: ocrexpert-Adapter Pipeline-Jobs via POST /api/jobs/upload
- qnapbackup: Status-Endpoint-CR einreichen (CR #3, Phase 5)
- Panopticor: Status+Actions-API-CR einreichen (CR #4, Phase 6)
- NasDominator: API-Reife für Health-Aggregation prüfen (Phase 3)
- Custos: Findings-Widget-Schema festlegen (Phase 4)
- sonofseti-Adapter: node_addresses aus Settings versorgen

## Letzte Änderung
2026-05-16 — Container `moag:0.1.0` deployed auf VDR:17900 (healthy), Smoke-Test grün, Frontend ausgeliefert mit korrektem Title, Aggregator-Score live (Overall 12: KI 25 · Infra 0 · Compl 0).
