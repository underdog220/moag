# PROJEKT_STATUS — MOAG (Mother of All GUIs)

## Aktueller Stand
Phase 1 + Container live auf VDR:17900 (`http://192.168.200.71:17900/`). Oberon-Token gesetzt → Cockpit-API liefert PASS 6/6, OctoBoss erreichbar (5/5 Nodes). OCRexpert-Adapter offline (VDR:17810 nicht erreichbar — Service-Status klären), SonOfSETI wartet auf Node-Adressen aus OctoBoss-Heartbeat, 4 Stub-Adapter wie vorgesehen. Aggregator-Overall 25 (KI 50 · Infra 0 · Compl 0).

## Version
v0.1.0 (Phase 1 komplett + Container live auf VDR)

## Nächste geplante Stufe
Phase 2: Top-Health-Leiste echte Daten + Pflicht-Tooltip-Komponente verfeinern + PageBadge-Coverage. Parallel: Oberon-Token konfigurieren (echte Cockpit-Daten), OCRexpert-Service-Adresse klären.

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
2026-05-17 — 5-Agent-Parallellauf: Drilldown-Erweiterung pro System (Oberon/OctoBoss/OCRexpert/NasDominator/Custos). 10 von 12 Aktionen jetzt echt (nur octoboss.node.reboot + panopticor.scenario.trigger noch Stub). NasDominator + Custos-Adapter von Stub auf echte HTTP-Anbindung umgebaut. 249 Backend-Tests + 340 Frontend-Tests grün, Smoke 5/5. Live-Inventar: 22 neue Sub-Routen. Bekannte Folge-Bugs: einige Aktionen scheitern an Endpoint-Drift (z.B. octoboss.bench.start HTTP 422) — separater Cycle.
