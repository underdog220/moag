# PROJEKT_STATUS — MOAG (Mother of All GUIs)

## Aktueller Stand
**v0.2.3 released — auf VDR live + auf `origin/main` gepusht (HEAD `5270a1f`).** Manifest-Health-Karte zur Cluster-Intent-Steuerzentrale ausgebaut: `ClusterIntentSection` pro Hub-Card mit Versions-Panel (Core + Bootstrapper), Override-Tabelle (Pin/Unpin pro Node), Modul-Drift-Anzeige. Default-Tausch hart blockiert bis Panopticor-Pretest GREEN. Bootstrapper-Steuerung UI-vorbereitet, disabled bis OctoBoss-CR `2026-05-23-bootstrapper-admin-api` durch. Deploy-Skript vergleicht Image-SHA (Bug-4-Fix). Dockerfile installiert moag selbst per `pip install --no-deps .` + `.dockerignore` schliesst `**/*.egg-info` aus (Bug-5-Fix). Regression-Test `test_health_version_matches_pyproject` verhindert Bug-5-Wiederkehr strukturell. 41/41 in test_api.py grün, 14/14 PS1-Logik-Tests, Live-Smoke 5/5 PASS, manifest/health beide Branches green. Versions-Konsistenz pyproject ↔ egg-info ↔ Container ↔ /api/health durchgaengig 0.2.3.

## Version
v0.2.3 (Phase 1–8 + Upload-Hub Y + Manifest-Health + Bench-Dashboard + Phase H + Cluster-Intent) — live auf VDR

## Nächste geplante Stufe
Follow-Ups aus Release-Report v0.2.3 (siehe `MASSNAHMEN.md` 2026-05-24):
1. `MOAG_OCTOBOSS_ADMIN_TOKEN` ENV-Propagierung in `deploy-vdr.ps1` — sobald aktiv, Panopticor-Pretest-Pflicht fuer Re-Deploys.
2. Versionsnummer im UI rendern (TopBar/Footer konsumiert `/api/health.version`) — derzeit nirgendwo sichtbar.
3. `VITE_BUILD_HASH` + `VITE_BUILD_TS` im Dockerfile setzen (`docker build --build-arg`), `deploy-vdr.ps1` reicht `git rev-parse --short HEAD` durch. PageBadge bekommt echte Build-Identitaet.
4. OctoBoss-CR `2026-05-23-bootstrapper-admin-api` begleiten — sobald durch, Bootstrapper-Admin-Pfad in MOAG entsperren.
5. Backlog-Memory-Themen (Alert-Center, Adapter-Status-Inspector, OpenAPI-Browser, File-Upload-UI).

## Offene Punkte
- ~~Upload-Hub Listing-Endpoint crash~~ — behoben (2026-05-17, psycopg dict_row + COUNT AS n, Commit `27d0774`)
- ~~Operation-Handler Detail-Drift~~ — behoben (2026-05-17, alle 4 LLM/PII gegen Live-Oberon verifiziert, Commit `88de394`): pii.scan benötigt `clientId`; llm.vision braucht `projectId` + `imageUrl` Data-URL + DevLoop-Marker-Strip; llm.plan-Response-Schema (`planType`/`erkannteRaeume`) statt erfundener Felder.
- ~~Volume-Permissions provisorisch chmod 0777~~ — behoben (2026-05-17, `scripts/deploy-vdr.ps1` macht jetzt `mkdir` + `chmod` + `--user 1002:1002` + `-v` automatisch)
- OCRexpert-Service auf VDR:17810 offline — Service-Status klären
- ocrexpert.process-Aktion: Body-Schema-Drift gegen `/api/v1/process` (HTTP 422 — wartet auf Phase 1.5b File-Upload-UI; ist im Upload-Hub via `ocr.standard` jetzt abgebildet)
- ocrexpert.shadow.batch: Body-Schema `{source_path, shadow_path}` — Live HTTP 403 path_not_allowed bis `OCREXPERT_SHADOW_ALLOWED_ROOTS` konfiguriert ist
- qnapbackup: Status-Endpoint-CR einreichen (CR #3, Phase 5)
- Panopticor: Status+Actions-API-CR einreichen (CR #4, Phase 6)
- ~~Bug 4 Deploy-Skript-Idempotenz~~ — behoben (2026-05-24, `scripts/deploy-vdr.ps1` vergleicht jetzt lokale + remote Image-SHA via `docker inspect --format '{{.Id}}'`, drei reine Hilfsfunktionen + 8 isolierte Logik-Tests in `tests/test-image-sha-compare.ps1`).
- **Browser-Verifikation v0.2.2 ausstehend:** `/octoboss/benchmarks` + `/oberon/contract` im Browser oeffnen, PageBadges + UI-Render bestaetigen. Roman gibt Bescheid bei Crash.

## Letzte Änderung
2026-05-24 — **Release v0.2.3 abgeschlossen:** `pip install -e backend/` lokal nachgezogen (moag-0.2.2 → moag-0.2.3 sauber re-installed). Regression-Test `test_health_version_matches_pyproject` lokal grün (vorher rot — genau der Drift, den er faengt). 41/41 in test_api.py grün. Zwei Commits auf origin/main gepusht: `c3717f0 fix(deploy): SHA-Idempotenz + Container-Version-Drift (Bug 4 + Bug 5)` + `5270a1f test(api): add regression test for health/pyproject version drift`. Push-Range `2b1c97c..5270a1f`. Browser-Verifikation HTTP-seitig vollständig (HTML-Auslieferung, API-Sweep, Schema-Match Backend↔Frontend, Cluster-Intent-API-Substanz alle PASS); reine Browser-Aspekte (JS-Konsole, Layout-Rendering) liegen bei Roman. Folge-Risiken im Release-Report (siehe MASSNAHMEN.md 2026-05-24).

2026-05-24 — **Deploy v0.2.3 auf VDR live + Bug 5 (Container-Version-Drift) behoben:** Erster Deploy-Versuch deckte Bug 5 auf: `/api/health` meldete `version=0.2.2`, obwohl Image `moag:0.2.3`. Wurzel war `backend/moag.egg-info/PKG-INFO` mit Version 0.2.2 (alter `pip install -e .`), wurde per `COPY backend/ ./` ins Image kopiert und von `importlib.metadata` gelesen. Zwei Fixes: `.dockerignore` schliesst `**/*.egg-info` + `**/*.dist-info` aus, `Dockerfile` installiert moag selbst per `pip install --no-deps --no-cache-dir .` nach dem `COPY backend/ ./`. Re-Deploy: `Successfully installed moag-0.2.3`, `/api/health version=0.2.3`. Smoke-Suite 5/5 PASS, manifest/health beide Branches green (bootstrapper 8/0/0, core 9/0/0), inventory zeigt beide Hubs. Bug-4-Fix (SHA-Vergleich) im selben Deploy live verifiziert: `SHA-Drift erkannt: local=... vs remote=... - Transfer noetig`.

2026-05-24 — **Bug 4 (Deploy-Skript-Idempotenz) behoben:** `scripts/deploy-vdr.ps1` vergleicht jetzt lokale und Remote-Image-SHA via `docker inspect --format '{{.Id}}'` statt nur Tag-Existenz auf VDR. Drei reine Hilfsfunktionen (`Get-LocalImageSha`, `Get-RemoteImageSha`, `Compare-ImageShas`); SHA-Vergleichs-Logik ist Docker-frei testbar. Neues isoliertes Test-Skript `tests/test-image-sha-compare.ps1` (8/8 grün, deckt skip/transfer/missing-local-Faelle ab inkl. der Bug-4-Regression unterschiedlicher SHAs bei gleichem Tag). Bestehender Test `tests/test-get-pyproject-version.ps1` auf 0.2.3 nachgezogen (6/6 grün). Skript syntaktisch validiert (Parser-Check ohne Errors). Workaround `docker rmi --force` vor Re-Deploy ist damit nicht mehr noetig.

2026-05-23 — **Cluster-Intent-Erweiterung der Manifest-Health-Karte:** Neue Backend-Module `manifest_inventory.py` + `manifest_admin.py`, neue Routen `/api/v1/manifest/inventory`, `/api/v1/manifest/admin/*` (Default-Tausch mit Panopticor-Pretest-Hart-Block, Node-Pinning, Impact-Preview). Frontend: `ClusterIntentSection.tsx` (Versions-Panel + Overrides-Tabelle + Modul-Drift) inkl. `DefaultFlipDialog` (Doppel-Confirm + Pretest-Polling) und `PinDialog`. Bootstrapper-Admin-Pfad disabled bis OctoBoss-CR durch. Settings: `octoboss_admin_token` (ENV `MOAG_OCTOBOSS_ADMIN_TOKEN`). Version 0.2.2 → 0.2.3. 443 + 441 Tests grün. OctoBoss-CR `2026-05-23-bootstrapper-admin-api` angelegt.

2026-05-20 — **Phase 3 Deploy auf VDR:** Commits bafa7ec (Multi-Hub-View) + 0c9c89f (Field-Mapping-Fix) gepusht + deployed. Container healthy, manifest/health overall_status=green, Bootstrapper + Core gruen.

2026-05-20 — **Fix: Bootstrapper-Field-Mapping Top-Level-Fallback:** `schema-version-entries` war gegen Production-Hub seit erstem Commit immer rot — `pseudo_entry` las SHA+size aus `binaries.bootstrapper{}` statt Top-Level. Fix F1 + neuer Test. 414 Backend-Tests gruen.

2026-05-19 — **3 Post-Cutover-Bugs behoben (Branch fix/moag-deploy-3bugs):** env-file chmod 600→644, MOAG_JOBS_DB ergaenzt, /api/health Version via importlib.metadata statt hardcoded "0.1.0". 409/409 Backend-Tests gruen.

2026-05-19 — **Deploy-Pipeline gehaerdened:** Build+Transfer in `scripts/deploy-vdr.ps1` integriert. Version aus `backend/pyproject.toml` automatisch gelesen (0.1.0 -> 0.2.2). Neue Flags: `-SkipBuild`, `-SkipTransfer`, `-BuildOnly`. Stream-Pipe-Transfer mit Idempotenz-Check + Tarball-Fallback. `docs/DEPLOYMENT_VDR.md` komplett ueberarbeitet, Hot-Patch-Workflow als deprecated markiert. 6/6 isolierte Parser-Tests gruen.

2026-05-19 — **Bench-Dashboard + Phase H parallel gemerged:** OctoBoss-Bench-Dashboard (`routes_octoboss.py` + `_proxy_post` + 5 Benchmark-Routen, `pages/Benchmarks.tsx` mit Matrix/History/Run-Panel, Sub-Tab "Benchmarks") und Phase H Visual-Redact + Classification-Guide (`dsgvo_visual_redact.py` Async-Handler, `routes_oberon.py` Classification-Guide-Route mit ETag-Passthrough, `Contract.tsx` um Allowlist/Deny-List/Decision-Tree erweitert, 24h-localStorage-ETag-Cache). 18 neue Backend + 16 neue Frontend Tests. Gesamt: 408 Backend + 426 Frontend grün.

2026-05-18 — **Manifest-Health-Karte:** Backend `manifest_health.py` + `routes_manifest_health.py` (GET `/api/v1/manifest/health`), Frontend `ManifestHealth.tsx` unter `/octoboss/manifest-health`, 16 Backend-Tests + 11 Frontend-Tests grün. Capability `cap.moag.manifest.health` in `docs/capabilities/moag.yaml` eingetragen.

2026-05-18 — **Cluster-CR-Schema v1.1 cluster-weit aktiviert:** `requests/`-Scaffold angelegt (open / done / rejected / README / TEMPLATE), Pre-Commit-Hook aktiv (`.githooks/pre-commit` delegiert an `sebald-suite/docs/cr-schema/scripts/validate-crs.py`). CR-Schema-Quelle: `C:\code\sebald-suite\docs\cr-schema\`. Hook aktivieren via `git config core.hooksPath .githooks`.

2026-05-17 — **3-Bug-Klassen-Cleanup** mit 2 Subagents + Hauptsession parallel: Listing-HTTP-500 (`27d0774`, psycopg dict_row), 4 Handler-Drift gegen Live-Oberon (`88de394`, pii/vision/plan Schema-Anpassungen), deploy-vdr.ps1 um Volume-Mount + `--user 1002:1002` + automatisches mkdir/chmod erweitert. Live pii.scan-Test: 4 PII-Findings in 69ms (status=completed). 374 Backend + 399 Frontend Tests grün.

2026-05-17 — **Upload-Hub Phase Y komplett** (5 parallele Subagents): Y-A `e005ed6` DB-Foundation + 6 REST-Endpoints + Registry + SQLite-Fallback. Y-B `4ea9531` Frontend-Skelett (dritte NavBar-Achse + 6 neue Komponenten + 5 Test-Files). Y-C `01339ec` 4 OCR-Handler (ocr.standard/shadow/direct + pdf.split). Y-D `3bf7993` 4 LLM-Handler (llm.text/vision/plan + pii.scan). Y-E `d0b3fab` Audio+DSGVO-Handler (audio.transcribe, dsgvo.redact). 10 Operations in Registry, 373 Backend + 399 Frontend Tests grün. Container live VDR:17900 mit Volume `/home/underdog/moag-data:/data/moag`. UPLOAD_SCHEMA.md (Commit `4a19163`) als verbindliche Spec.
