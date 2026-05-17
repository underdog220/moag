# PROJEKT_STATUS — MOAG (Mother of All GUIs)

## Aktueller Stand
Phase 1.5 OCRexpert Pipeline-Trigger implementiert (Commit fe7e3bf). Aktion `ocrexpert.process` + Route-Proxy `POST /api/v1/ocrexpert/process` + Upload-Card auf /ocrexpert/jobs mit UNC→Linux-Pfad-Konvertierung. Container live auf VDR:17900, OCRexpert-Service auf VDR:17810 unklar (Live-Test ausstehend). 266/266 Backend + 355/355 Frontend-Tests grün.

## Version
v0.1.0 (Phase 1 komplett + Container live auf VDR)

## Nächste geplante Stufe
Phase 8: OCRexpert-GUI-Code deaktivieren (Container stoppen, Code-Branch archivieren). Danach: Lighthouse-Audit Mobile-Score messen.

## Offene Punkte
- Token nicht über `docker run -e` halten — Settings-Volume oder env-file mit chmod 600 (Phase 2)
- OCRexpert-Service auf VDR:17810 offline — Service-Status klären
- Code-Kommentar in `clients/oberon_cockpit_client.py` Z. 21–22 ist veraltet (Cockpit akzeptiert OBERON_TOKEN, nicht nur Admin-Token) — bei nächstem Touch korrigieren
- Phase 1.5: ocrexpert-Adapter Pipeline-Jobs via POST /api/jobs/upload
- qnapbackup: Status-Endpoint-CR einreichen (CR #3, Phase 5)
- Panopticor: Status+Actions-API-CR einreichen (CR #4, Phase 6)
- NasDominator: API-Reife für Health-Aggregation prüfen (Phase 3)
- Custos: Findings-Widget-Schema festlegen (Phase 4)
- sonofseti-Adapter: node_addresses aus Settings versorgen

## Letzte Änderung
2026-05-17 — Phase 1.5 OCRexpert Pipeline-Trigger. Aktion ocrexpert.process, Route-Proxy /api/v1/ocrexpert/process, Upload-Card /ocrexpert/jobs mit UNC-Mapper. 266+355 Tests grün. Commit fe7e3bf.
