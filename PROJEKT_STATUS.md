# PROJEKT_STATUS — MOAG (Mother of All GUIs)

## Aktueller Stand
Greenfield-Projekt frisch angelegt am 2026-05-16. Architektur und Scope mit Roman in der Eröffnungs-Session festgeklopft. Code noch nicht migriert — der Ursprungs-Prototyp lebt heute als `ocrexpert-gui:0.7.1` im OCRexpert-Repo und läuft live auf VDR:17820.

## Version
v0.1.0-pre (kein Code, nur Pflicht-Doku + Phasenplan)

## Nächste geplante Stufe
Phase 0 → Phase 1: Hard-Fork des OCRexpert-GUI-Codes (Backend `ocrexpert/gui/` + Frontend `ocrexpert/gui_frontend/`) nach `C:\code\moag`. Repo unter `underdog220/moag` einrichten, Container `moag:0.1.0` bauen und auf VDR ablegen (Port wird in Phase 1 festgelegt, Default-Vorschlag 17900). OCRexpert-GUI bleibt parallel live, wird in Phase 8 deaktiviert.

## Offene Punkte
- Ziel-Port auf VDR (Vorschlag 17900, frei zu prüfen)
- qnapbackup: Status-Endpoint-CR muss eingereicht werden (Task #3)
- Panopticor: Status+Actions-API-CR muss eingereicht werden (Task #4)
- NasDominator: API-Reife für Health-Aggregation prüfen (Phase 3)
- Custos: Findings-Widget-Schema festlegen (Phase 4)
- iframe-Embedding von qnapbackup-Web-UI: X-Frame-Options-Header prüfen
- GitHub-Repo `underdog220/moag` muss noch erstellt werden

## Letzte Änderung
2026-05-16 — Infrastruktur-Setup abgeschlossen: docker/Dockerfile, .dockerignore, scripts/build-state.ps1, README.md, .env.example.
