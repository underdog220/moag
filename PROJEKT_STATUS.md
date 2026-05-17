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
- ocrexpert.process-Aktion: Body-Schema-Drift gegen `/api/v1/process` (erwartet multipart/form-data mit file, nicht JSON `{pfad}`) — Aktion liefert HTTP 422. Folge-Cleanup: entweder Multipart-Upload bauen oder auf `/api/v1/shadow/process` mit `source_path`/`shadow_path` umbiegen.
- ocrexpert.shadow.batch ggf. analog: prüfen ob Body-Schema (war `{pfad}` aus altem Briefing) zu `{source_path, shadow_path}` umzustellen ist.
- qnapbackup: Status-Endpoint-CR einreichen (CR #3, Phase 5)
- Panopticor: Status+Actions-API-CR einreichen (CR #4, Phase 6)
- NasDominator: API-Reife für Health-Aggregation prüfen (Phase 3)
- Custos: Findings-Widget-Schema festlegen (Phase 4)
- sonofseti-Adapter: node_addresses aus Settings versorgen

## Letzte Änderung
2026-05-17 — 3 parallele Subagent-Sprünge + Hauptsession-Hygiene: A) 4 Live-Bugs gefixt (oberon.llm.test, oberon.dsgvo.check, octoboss.bench.start, NasDom-Mapping). B) Phase 7 Mobile-Optimierung (Touch-Targets ≥44px, Long-Press-Tooltip, responsive Sub-Tabs). C) Phase 1.5 OCRexpert-Pipeline-Trigger (Aktion + Upload-Card). Plus: Cockpit-Client-Kommentar entstaubt, qnapbackup-CR + Panopticor-CR mit Stand-Update versehen, Smoke-Timeout 10s→30s (Live-Calls dauern wegen Cold-LLM bis 28s). Aggregator-Score 40→53 (KI 80 · Infra 42 (NasDom 85!) · Compl 0). Live-Test: 3 von 4 gefixten Aktionen completed, ocrexpert.process scheitert HTTP 422 (Body-Schema-Drift — `/api/v1/process` ist multipart statt JSON; Folge-Cleanup).
