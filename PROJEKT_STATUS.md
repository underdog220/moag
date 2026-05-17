# PROJEKT_STATUS — MOAG (Mother of All GUIs)

## Aktueller Stand
Phase X komplett (Hygiene + Phase 8): Token-Storage auf env-file-Pattern (`scripts/deploy-vdr.ps1` + `/etc/moag.env chmod 600`), sonofseti-Adapter gelöscht, OCRexpert-GUI-Container auf VDR:17820 deaktiviert + im OCRexpert-Repo deprecated markiert (Cross-Repo-Commit `a57ef70`, Volume `/var/lib/ocrexpert-gui` für Rollback erhalten). MOAG ist seit 2026-05-17 die einzige aktive GUI auf VDR:17900. 259/259 Backend + 355/355 Frontend-Tests grün.

## Version
v0.1.0 (Phase 1–8 komplett, Container live auf VDR)

## Nächste geplante Stufe
Phase Y — Upload-Hub als dritte Top-Achse (`/upload`): Smart-Multi-Drop oben + spezialisierte Karten pro System unten (OCRexpert, Oberon LLM, Oberon Vision, Direct-Engine, Audio, DSGVO-Redact, Bauplan, PII-Scan, PDF-Split). Persistenz via Oberon-DB-Broker (PostgreSQL). Modular mit Subagents.

## Offene Punkte
- OCRexpert-Service auf VDR:17810 offline — Service-Status klären
- ocrexpert.process-Aktion: Body-Schema-Drift gegen `/api/v1/process` (erwartet multipart/form-data mit file, nicht JSON `{pfad}`) — Aktion liefert HTTP 422. Folge-Cleanup: entweder Multipart-Upload bauen oder auf `/api/v1/shadow/process` mit `source_path`/`shadow_path` umbiegen.
- ocrexpert.shadow.batch ggf. analog: prüfen ob Body-Schema (war `{pfad}` aus altem Briefing) zu `{source_path, shadow_path}` umzustellen ist.
- qnapbackup: Status-Endpoint-CR einreichen (CR #3, Phase 5)
- Panopticor: Status+Actions-API-CR einreichen (CR #4, Phase 6)
- NasDominator: API-Reife für Health-Aggregation prüfen (Phase 3)
- Custos: Findings-Widget-Schema festlegen (Phase 4)

## Letzte Änderung
2026-05-17 — Phase X (Hygiene + Phase 8) durch 2 parallele Subagents: A) MOAG-Commit `4169a04` — Token-Storage env-file-Pattern + sonofseti-Cleanup. B) OCRexpert-Commit `a57ef70` (Cross-Repo) — Container ocrexpert-gui:17820 gestoppt+entfernt, Volume `/var/lib/ocrexpert-gui` für Rollback erhalten, `ocrexpert/gui/DEPRECATED.md` + Dockerfile.gui-Header + Doku aktualisiert. MOAG-Container auf VDR:17900 läuft weiter mit den alten `-e`-Werten (Re-Deploy mit env-file kommt sobald `secrets.local.env` lokal angelegt + `scripts/deploy-vdr.ps1` ausgeführt).
