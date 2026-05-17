# PROJEKT_STATUS — MOAG (Mother of All GUIs)

## Aktueller Stand
**Phase Y komplett** (5 parallele Subagents): Upload-Hub als dritte Top-Achse `/upload` mit DB-Persistenz live auf VDR:17900. Backend (Foundation + 10 Handler), Frontend-Skelett, alles auf VDR mit Volume `/home/underdog/moag-data → /data/moag`. SQLite-Fallback aktiv (Oberon-DB-Broker als optional V1). 373 Backend + 399 Frontend Tests grün. Erster Live-Upload geht durch (Insert + Handler-Call), Listing-Endpoint hat 1 Bug (Folge-Cycle).

## Version
v0.2.0 (Phase 1–8 + Upload-Hub Y komplett, Container live auf VDR)

## Nächste geplante Stufe
Phase Y-Cleanup: Listing-Bug `GET /uploads` HTTP 500 (TypeError tuple-vs-Row im SQLite-Fallback) fixen. Plus: einzelne Handler scheitern wegen Endpoint-Schema-Drift (pii.scan, llm.* — Detail-Bugs in den Operation-Handlern). Sauberer Bug-Fix-Cycle wie bei den Aktionen.

## Offene Punkte
- Upload-Hub Listing-Endpoint `GET /api/v1/uploads` crash bei nicht-leeren Daten (Row-Factory im AsyncSQLiteConn-Wrapper)
- Operation-Handler Detail-Drift gegen Live-Oberon (pii.scan/llm.text/llm.vision/llm.plan — Schema gegen openapi nicht verifiziert pro Handler)
- Volume-Permissions: chmod 0777 auf `/home/underdog/moag-data` (provisorisch; uid 1000 vs 1002-Konflikt — sauberer wäre uid-mapping oder underdog-uid im Dockerfile)
- OCRexpert-Service auf VDR:17810 offline — Service-Status klären
- ocrexpert.process-Aktion: Body-Schema-Drift gegen `/api/v1/process` (HTTP 422 — wartet auf Phase 1.5b File-Upload-UI; ist im Upload-Hub via `ocr.standard` jetzt abgebildet)
- ocrexpert.shadow.batch: Body-Schema `{source_path, shadow_path}` — Live HTTP 403 path_not_allowed bis `OCREXPERT_SHADOW_ALLOWED_ROOTS` konfiguriert ist
- qnapbackup: Status-Endpoint-CR einreichen (CR #3, Phase 5)
- Panopticor: Status+Actions-API-CR einreichen (CR #4, Phase 6)

## Letzte Änderung
2026-05-17 — **Upload-Hub Phase Y komplett** (5 parallele Subagents): Y-A `e005ed6` DB-Foundation + 6 REST-Endpoints + Registry + SQLite-Fallback. Y-B `4ea9531` Frontend-Skelett (dritte NavBar-Achse + 6 neue Komponenten + 5 Test-Files). Y-C `01339ec` 4 OCR-Handler (ocr.standard/shadow/direct + pdf.split). Y-D `3bf7993` 4 LLM-Handler (llm.text/vision/plan + pii.scan). Y-E `d0b3fab` Audio+DSGVO-Handler (audio.transcribe, dsgvo.redact). 10 Operations in Registry, 373 Backend + 399 Frontend Tests grün. Container live VDR:17900 mit Volume `/home/underdog/moag-data:/data/moag`. UPLOAD_SCHEMA.md (Commit `4a19163`) als verbindliche Spec.
