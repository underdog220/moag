# PROJEKT_STATUS — MOAG (Mother of All GUIs)

## Aktueller Stand
**v0.2.2 + Multi-Hub-Manifest-Health deployed auf VDR.** Neuer Endpoint `/api/v1/manifest/health/all` probt alle konfigurierten Hubs parallel; Frontend zeigt alle Hubs gestapelt, aktiver Hub mit Stern-Badge. 413 Backend + 431 Frontend Tests grün. Container `moag:0.2.2` auf VDR:17900 healthy, `overall_status=green` (alle Checks inkl. schema-version-entries + live-consistency). Push auf GitHub erfolgt (Commits bafa7ec + 0c9c89f).

## Version
v0.2.2 (Phase 1–8 + Upload-Hub Y + Manifest-Health + Bench-Dashboard + Phase H)

## Nächste geplante Stufe
Browser-Test auf `/octoboss/benchmarks` auf VDR (Hard-Reload, Live-OctoBoss-Bench-API). Folge-Themen aus Backlog-Memory (Alert-Center, Adapter-Status-Inspector, Multi-Hub-Polling).

## Offene Punkte
- ~~Upload-Hub Listing-Endpoint crash~~ — behoben (2026-05-17, psycopg dict_row + COUNT AS n, Commit `27d0774`)
- ~~Operation-Handler Detail-Drift~~ — behoben (2026-05-17, alle 4 LLM/PII gegen Live-Oberon verifiziert, Commit `88de394`): pii.scan benötigt `clientId`; llm.vision braucht `projectId` + `imageUrl` Data-URL + DevLoop-Marker-Strip; llm.plan-Response-Schema (`planType`/`erkannteRaeume`) statt erfundener Felder.
- ~~Volume-Permissions provisorisch chmod 0777~~ — behoben (2026-05-17, `scripts/deploy-vdr.ps1` macht jetzt `mkdir` + `chmod` + `--user 1002:1002` + `-v` automatisch)
- OCRexpert-Service auf VDR:17810 offline — Service-Status klären
- ocrexpert.process-Aktion: Body-Schema-Drift gegen `/api/v1/process` (HTTP 422 — wartet auf Phase 1.5b File-Upload-UI; ist im Upload-Hub via `ocr.standard` jetzt abgebildet)
- ocrexpert.shadow.batch: Body-Schema `{source_path, shadow_path}` — Live HTTP 403 path_not_allowed bis `OCREXPERT_SHADOW_ALLOWED_ROOTS` konfiguriert ist
- qnapbackup: Status-Endpoint-CR einreichen (CR #3, Phase 5)
- Panopticor: Status+Actions-API-CR einreichen (CR #4, Phase 6)
- **Bug 4 Deploy-Skript-Idempotenz (offen, 2026-05-19):** Transfer-Stufe in `scripts/deploy-vdr.ps1` prueft nur ob Image-Tag auf VDR existiert, nicht ob lokales und VDR-SHA matchen. Folge: nach Rebuild mit gleichem Tag wird Transfer uebersprungen → Container laeuft mit altem Stand. Workaround: `ssh vdr docker rmi <tag> --force` vor Re-Deploy. Fix-Idee: SHA-Vergleich (`docker inspect --format '{{.Id}}'` lokal vs. VDR).
- **Browser-Verifikation v0.2.2 ausstehend:** `/octoboss/benchmarks` + `/oberon/contract` im Browser oeffnen, PageBadges + UI-Render bestaetigen. Roman gibt Bescheid bei Crash.

## Letzte Änderung
2026-05-20 — **Phase 3 Deploy auf VDR:** Commits bafa7ec (Multi-Hub-View) + 0c9c89f (Field-Mapping-Fix) gepusht + deployed. Container healthy, manifest/health overall_status=green, Bootstrapper + Core gruen.

2026-05-20 — **Fix: Bootstrapper-Field-Mapping Top-Level-Fallback:** `schema-version-entries` war gegen Production-Hub seit erstem Commit immer rot — `pseudo_entry` las SHA+size aus `binaries.bootstrapper{}` statt Top-Level. Fix F1 + neuer Test. 414 Backend-Tests gruen.

2026-05-19 — **3 Post-Cutover-Bugs behoben (Branch fix/moag-deploy-3bugs):** env-file chmod 600→644, MOAG_JOBS_DB ergaenzt, /api/health Version via importlib.metadata statt hardcoded "0.1.0". 409/409 Backend-Tests gruen.

2026-05-19 — **Deploy-Pipeline gehaerdened:** Build+Transfer in `scripts/deploy-vdr.ps1` integriert. Version aus `backend/pyproject.toml` automatisch gelesen (0.1.0 -> 0.2.2). Neue Flags: `-SkipBuild`, `-SkipTransfer`, `-BuildOnly`. Stream-Pipe-Transfer mit Idempotenz-Check + Tarball-Fallback. `docs/DEPLOYMENT_VDR.md` komplett ueberarbeitet, Hot-Patch-Workflow als deprecated markiert. 6/6 isolierte Parser-Tests gruen.

2026-05-19 — **Bench-Dashboard + Phase H parallel gemerged:** OctoBoss-Bench-Dashboard (`routes_octoboss.py` + `_proxy_post` + 5 Benchmark-Routen, `pages/Benchmarks.tsx` mit Matrix/History/Run-Panel, Sub-Tab "Benchmarks") und Phase H Visual-Redact + Classification-Guide (`dsgvo_visual_redact.py` Async-Handler, `routes_oberon.py` Classification-Guide-Route mit ETag-Passthrough, `Contract.tsx` um Allowlist/Deny-List/Decision-Tree erweitert, 24h-localStorage-ETag-Cache). 18 neue Backend + 16 neue Frontend Tests. Gesamt: 408 Backend + 426 Frontend grün.

2026-05-18 — **Manifest-Health-Karte:** Backend `manifest_health.py` + `routes_manifest_health.py` (GET `/api/v1/manifest/health`), Frontend `ManifestHealth.tsx` unter `/octoboss/manifest-health`, 16 Backend-Tests + 11 Frontend-Tests grün. Capability `cap.moag.manifest.health` in `docs/capabilities/moag.yaml` eingetragen.

2026-05-18 — **Cluster-CR-Schema v1.1 cluster-weit aktiviert:** `requests/`-Scaffold angelegt (open / done / rejected / README / TEMPLATE), Pre-Commit-Hook aktiv (`.githooks/pre-commit` delegiert an `sebald-suite/docs/cr-schema/scripts/validate-crs.py`). CR-Schema-Quelle: `C:\code\sebald-suite\docs\cr-schema\`. Hook aktivieren via `git config core.hooksPath .githooks`.

2026-05-17 — **3-Bug-Klassen-Cleanup** mit 2 Subagents + Hauptsession parallel: Listing-HTTP-500 (`27d0774`, psycopg dict_row), 4 Handler-Drift gegen Live-Oberon (`88de394`, pii/vision/plan Schema-Anpassungen), deploy-vdr.ps1 um Volume-Mount + `--user 1002:1002` + automatisches mkdir/chmod erweitert. Live pii.scan-Test: 4 PII-Findings in 69ms (status=completed). 374 Backend + 399 Frontend Tests grün.

2026-05-17 — **Upload-Hub Phase Y komplett** (5 parallele Subagents): Y-A `e005ed6` DB-Foundation + 6 REST-Endpoints + Registry + SQLite-Fallback. Y-B `4ea9531` Frontend-Skelett (dritte NavBar-Achse + 6 neue Komponenten + 5 Test-Files). Y-C `01339ec` 4 OCR-Handler (ocr.standard/shadow/direct + pdf.split). Y-D `3bf7993` 4 LLM-Handler (llm.text/vision/plan + pii.scan). Y-E `d0b3fab` Audio+DSGVO-Handler (audio.transcribe, dsgvo.redact). 10 Operations in Registry, 373 Backend + 399 Frontend Tests grün. Container live VDR:17900 mit Volume `/home/underdog/moag-data:/data/moag`. UPLOAD_SCHEMA.md (Commit `4a19163`) als verbindliche Spec.
