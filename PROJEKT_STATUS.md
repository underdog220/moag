# PROJEKT_STATUS — MOAG (Mother of All GUIs)

## Aktueller Stand
**Phase Y komplett + alle 3 Bug-Klassen weggeräumt:** Upload-Hub live auf VDR:17900 mit DB-Persistenz, alle 10 Handler echt verkabelt, Listing-Endpoint funktioniert, pii.scan/llm.text/llm.vision/llm.plan gegen Live-Oberon verifiziert. Deploy-Skript bereitet Volume + Permissions + `--user` automatisch vor. 374 Backend + 399 Frontend Tests grün.

## Version
v0.2.0 (Phase 1–8 + Upload-Hub Y komplett, Container live auf VDR)

## Nächste geplante Stufe
Browser-Test auf `/upload` (Hard-Reload), realistische Mehr-Datei-Uploads über die spezialisierten Cluster-Karten. Folge-Themen aus Backlog-Memory (Alert-Center, Adapter-Status-Inspector, Multi-Hub-Polling).

## Offene Punkte
- ~~Upload-Hub Listing-Endpoint crash~~ — behoben (2026-05-17, psycopg dict_row + COUNT AS n, Commit `27d0774`)
- ~~Operation-Handler Detail-Drift~~ — behoben (2026-05-17, alle 4 LLM/PII gegen Live-Oberon verifiziert, Commit `88de394`): pii.scan benötigt `clientId`; llm.vision braucht `projectId` + `imageUrl` Data-URL + DevLoop-Marker-Strip; llm.plan-Response-Schema (`planType`/`erkannteRaeume`) statt erfundener Felder.
- ~~Volume-Permissions provisorisch chmod 0777~~ — behoben (2026-05-17, `scripts/deploy-vdr.ps1` macht jetzt `mkdir` + `chmod` + `--user 1002:1002` + `-v` automatisch)
- OCRexpert-Service auf VDR:17810 offline — Service-Status klären
- ocrexpert.process-Aktion: Body-Schema-Drift gegen `/api/v1/process` (HTTP 422 — wartet auf Phase 1.5b File-Upload-UI; ist im Upload-Hub via `ocr.standard` jetzt abgebildet)
- ocrexpert.shadow.batch: Body-Schema `{source_path, shadow_path}` — Live HTTP 403 path_not_allowed bis `OCREXPERT_SHADOW_ALLOWED_ROOTS` konfiguriert ist
- qnapbackup: Status-Endpoint-CR einreichen (CR #3, Phase 5)
- Panopticor: Status+Actions-API-CR einreichen (CR #4, Phase 6)

## Letzte Änderung
2026-05-18 — **Cluster-CR-Schema v1.1 cluster-weit aktiviert:** `requests/`-Scaffold angelegt (open / done / rejected / README / TEMPLATE), Pre-Commit-Hook aktiv (`.githooks/pre-commit` delegiert an `sebald-suite/docs/cr-schema/scripts/validate-crs.py`). CR-Schema-Quelle: `C:\code\sebald-suite\docs\cr-schema\`. Hook aktivieren via `git config core.hooksPath .githooks`.

2026-05-17 — **3-Bug-Klassen-Cleanup** mit 2 Subagents + Hauptsession parallel: Listing-HTTP-500 (`27d0774`, psycopg dict_row), 4 Handler-Drift gegen Live-Oberon (`88de394`, pii/vision/plan Schema-Anpassungen), deploy-vdr.ps1 um Volume-Mount + `--user 1002:1002` + automatisches mkdir/chmod erweitert. Live pii.scan-Test: 4 PII-Findings in 69ms (status=completed). 374 Backend + 399 Frontend Tests grün.

2026-05-17 — **Upload-Hub Phase Y komplett** (5 parallele Subagents): Y-A `e005ed6` DB-Foundation + 6 REST-Endpoints + Registry + SQLite-Fallback. Y-B `4ea9531` Frontend-Skelett (dritte NavBar-Achse + 6 neue Komponenten + 5 Test-Files). Y-C `01339ec` 4 OCR-Handler (ocr.standard/shadow/direct + pdf.split). Y-D `3bf7993` 4 LLM-Handler (llm.text/vision/plan + pii.scan). Y-E `d0b3fab` Audio+DSGVO-Handler (audio.transcribe, dsgvo.redact). 10 Operations in Registry, 373 Backend + 399 Frontend Tests grün. Container live VDR:17900 mit Volume `/home/underdog/moag-data:/data/moag`. UPLOAD_SCHEMA.md (Commit `4a19163`) als verbindliche Spec.
