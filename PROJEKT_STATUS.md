# PROJEKT_STATUS — MOAG (Mother of All GUIs)

## Aktueller Stand
Phase Y Frontend-Skelett: Upload-Hub als dritte Top-Achse `/upload` implementiert (Frontend-only, kein Backend noch). NavBar zeigt `[Übersicht] [Aktionen] [Upload]`. 10 OperationCards nach `docs/UPLOAD_SCHEMA.md`, MultiDropZone (MIME-Erkennung + kompatible Ops), UploadHistory (Polling 30s), Mock-Daten. 73 Test-Files / 399 Tests grün, Build grün.

## Version
v0.1.0 (Phase 1–8 komplett + Upload-Hub Frontend-Skelett, Container live auf VDR)

## Nächste geplante Stufe
Phase Y Backend — Upload-Hub Backend: `POST /api/v1/upload`, `GET /api/v1/uploads`, `DELETE /api/v1/uploads/{id}`, `GET /api/v1/uploads/{id}/result`. Persistenz via Oberon DB-Broker (PostgreSQL), File-Storage < 5MB BYTEA / >= 5MB Filesystem.

## Offene Punkte
- Upload-Hub Backend: noch nicht implementiert — Frontend arbeitet mit Mock-Daten
- OCRexpert-Service auf VDR:17810 offline — Service-Status klären
- ocrexpert.process-Aktion: Body-Schema-Drift gegen `/api/v1/process` (HTTP 422)
- ocrexpert.shadow.batch: Body-Schema prüfen (`{pfad}` vs. `{source_path, shadow_path}`)
- qnapbackup: Status-Endpoint-CR einreichen (CR #3, Phase 5)
- Panopticor: Status+Actions-API-CR einreichen (CR #4, Phase 6)

## Letzte Änderung
2026-05-17 — Upload-Hub Frontend-Skelett: NavBar dritte Achse, uploadOperations.ts (10 Ops), 6 neue Komponenten in features/upload/, 5 neue Test-Files, 399 Tests grün, Build grün. (Kein Push — freigabe erforderlich)
