# MASSNAHMEN — MOAG

Chronologische Liste aller Maßnahmen. Format: `[Datum] [Version] Beschreibung`.

## 2026-05-19

- [2026-05-19] [v0.2.2] **OctoBoss-Bench-Dashboard:** Backend `routes_octoboss.py` um `_proxy_post`-Helper + 5 neue Benchmark-Routen erweitert (GET benchmarks/matrix, history, runs, runs/{id} + POST benchmarks/run). Frontend: neues `pages/Benchmarks.tsx` (Run-Panel mit ConfirmDialog + aktiver-Run-Indikator, Matrix-Tabelle sparse-fähig, History-Liste sortierbar, 503-Degraded-Banner). `api.ts` im `octoboss`-Namespace um 5 neue Methoden ergänzt (getBenchmarkMatrix, getBenchmarkHistory, getBenchmarkRuns, getBenchmarkRun, runBenchmark). Sub-Tab "Benchmarks" in OctoBossLayout + Route registriert. ADR-004 eingehalten (Tooltips auf allen Zellen, Status-Dots, Trend-Icons, Zahlen-Spalten). PageBadge `octoboss.benchmarks`. 7 neue Backend-Tests (test_routes_octoboss_bench.py, inkl. 503-Fall) + 12 neue Frontend-Tests (Benchmarks.test.tsx).
- [2026-05-19] [v0.2.2] **Phase H: Visual-Redact + Classification-Guide** (Branch `feat/moag-oberon-visual-redact`, parallel mit Bench-Dashboard entwickelt):
  - **Backend — Visual-Redact-Handler:** `backend/moag/upload/handlers/dsgvo_visual_redact.py` mit `@register_handler("dsgvo.visual-redact")`. Async-Pattern (202 → Polling 3s/90s → Download). 404-beim-Poll → HTTP-410-Semantik (`job_lost: true`). DSGVO-Gate-503-Behandlung. `__init__.py` um neuen Handler-Eintrag ergänzt.
  - **Backend — Classification-Guide-Route:** `routes_oberon.py` um `GET /api/v1/oberon/contract/classification-guide` erweitert (ETag-Passthrough an Platform-Client, 503-DSGVO-Mapping). `oberon_platform_client.py` um `get_classification_guide()` ergänzt.
  - **Frontend — uploadOperations.ts:** Neuer Eintrag `dsgvo.visual-redact` (PDF-only, category=dsgvo, 60s). Interface-Union erweitert.
  - **Frontend — api.ts:** `api.oberon.getContractClassificationGuide()` mit ETag-localStorage-Cache (24h).
  - **Frontend — Contract.tsx:** `<section class="classification-guide">` unter Capabilities-Liste hinzugefügt (Allowlist, Deny-List Tabelle, Decision-Tree). Fehler-State + Refetch-Button. Tooltip ADR-004.
  - **Tests:** 7 neue Backend-Handler-Tests (`test_upload_handlers_dsgvo_visual_redact.py`) + 4 neue Routen-Tests (`test_routes_oberon.py`). 4 neue Frontend-Tests (ContractPage-Erweiterung, uploadOperations-Update).
  - **Docs:** `docs/UPLOAD_SCHEMA.md` um `dsgvo.visual-redact`-Eintrag + Quirks-Abschnitt ergänzt.
- [2026-05-19] [v0.2.2] **Test-Status nach beiden Wellen kombiniert:** 408 Backend + 426 Frontend Tests grün (Baseline 390/410 + 18 neue Backend + 16 neue Frontend).

## 2026-05-18

- [2026-05-18] [v0.2.1] **Manifest-Health-Karte:** Backend `moag/manifest_health.py` (Schema-Validierung + Live-Consistency-Checks via Hub-API Option A), `moag/routes_manifest_health.py` (GET `/api/v1/manifest/health?target=both|bootstrapper|core`), Frontend `pages/ManifestHealth.tsx` (Traffic-Light + expandierbare Check-Zeilen + Tooltip ADR-004). Route `/octoboss/manifest-health` in OctoBoss-Feature + Sub-Tab "Manifest-Health" eingehängt. `api.octoboss.getManifestHealth()` in `lib/api.ts`. Capability `cap.moag.manifest.health` in `docs/capabilities/moag.yaml`. 16 Backend-Tests (test_manifest_health.py) + 11 Frontend-Tests (ManifestHealth.test.tsx) grün. Gesamt: 390 Backend + 410 Frontend grün.

- [2026-05-18] [v0.2.0] **Doku-Update (Welle 5):** PROJEKT_STATUS.md um CR-Schema-v1.1-Stand erganzt (requests/-Scaffold live, Pre-Commit-Hook aktiv, Verweis auf sebald-suite/docs/cr-schema/). FEATURES.md um CR-Schema-Eintrag (Aktiv) erweitert.
- [2026-05-18] [v0.2.0] Pre-Commit-Hook fuer CR-Schema-Validierung angelegt: `.githooks/pre-commit` (grep auf requests/{open,done,rejected}/*.md, delegiert an sebald-suite-Validator). `requests/README.md` um Aktivierungs-Hinweis (`git config core.hooksPath .githooks`) ergaenzt. Welle-3-Subagent-Abschluss.
- [2026-05-18] [v0.2.0] CR-Doku-Scaffold angelegt: `requests/{open,done,rejected}/.gitkeep`, `requests/README.md` (Verweis auf sebald-suite cr-schema), `requests/TEMPLATE.md` (Kopie zentrales Template). Cluster-weite Welle-2-Standardisierung.
- [2026-05-18] [v0.2.0] `docs/capabilities/moag.yaml` aktualisiert: 14x draft→live, SonOfSETI-Adapter auf deprecated, 3 neue Capabilities ergaenzt (actions.registry, upload-hub, mobile, container.deploy). Container-Stand vdr:17900 eingetragen.

## 2026-05-16

- [2026-05-16] [v0.1.0-pre] Projekt-Verzeichnis `C:\code\moag` angelegt.
- [2026-05-16] [v0.1.0-pre] Eröffnungs-Scan über vier Explore-Agents abgeschlossen: OCRexpert-Prototyp, Oberon-API, OctoBoss-API, SonOfSETI-API, Kandidaten-Sichtung (NasDominator, Panopticor, DevLoop, OllamaStation, oberon-anonymizer, sebald-suite, sebald-schemas, qnapbackup, Custos, money, alter).
- [2026-05-16] [v0.1.0-pre] Architektur-Entscheidungen mit Roman geklopft: Hard-Fork aus OCRexpert-GUI, Container auf VDR, 8 Sub-Systeme im Scope (Oberon, OctoBoss, SonOfSETI, OCRexpert, NasDominator, qnapbackup, Custos, Panopticor), Cockpit-Layout mit Gauges + gruppierter Top-Health-Leiste + Drilldown + Pflicht-Tooltips + Mobile-Tauglichkeit.
- [2026-05-16] [v0.1.0-pre] Pflicht-Doku geschrieben: PROJEKT_STATUS.md, MASSNAHMEN.md, ARCHITEKTUR.md, FEATURES.md, CLAUDE.md.
- [2026-05-16] [v0.1.0-pre] Infrastruktur-Setup: docker/Dockerfile (Multi-Stage Node→Python-Slim, EXPOSE 17900), .dockerignore, scripts/build-state.ps1 (Verdikt-Skript), README.md, .env.example (8 Sub-Systeme).
- [2026-05-16] [v0.1.0] Phase-1 Frontend: Hard-Fork OCRexpert-GUI → MOAG. Kopiert + umgebaut: frontend/ mit Vite-Proxy auf :17900, Build-Output auf backend/moag/static/. Neue Komponenten: TopBar (Health-Score + Gruppen-Indikatoren), Tooltip (ADR-004), Gauge (hero+mini), PageBadge, Breadcrumb, NavBar. Neue Features: overview/ (8 Karten in 3 Gruppen), oberon/ (Sub-Routen llm/cost/audit/smoke), octoboss/ (dashboard/cluster), ocrexpert/ (jobs/history/charts), sonofseti/ (Node-Liste), nasdominator/qnapbackup/custos/panopticor/ (Stubs). App.tsx komplett auf MOAG-Routing umgebaut, Legacy-Routen redirecten. Mock-Daten für /api/v1/overview + /api/v1/aggregator/health. 245 Tests grün (56 Test-Files). TypeScript strict, npm run build grün.
- [2026-05-16] [v0.1.0] Phase-1 Backend: Hard-Fork OCRexpert-GUI-Backend → moag Python-Package. Namespace ocrexpert.gui → moag, ENV-Vars OCREXPERT_GUI_* → MOAG_*, sebald_schemas-Abhängigkeit eliminiert (lokale models.py). 8 Kern-Module: api.py, events.py, hub_client.py, job_store.py, settings_store.py, models.py, schemas.py, pipeline_hooks.py (Stub). Adapter-Schicht: 4 echte Adapter (oberon, octoboss, sonofseti, ocrexpert via HTTP), 4 Stubs (nasdominator, qnapbackup, custos, panopticor). Aggregator mit Gruppen-Scores (KI 50%, Infra 30%, Compliance 20%). GET /api/v1/overview + /api/v1/aggregator/health. cli.py, pyproject.toml, requirements.txt. 123 Tests grün (pytest backend/tests/ -v).
- [2026-05-16] [v0.1.0] Docker-Build-Pfad-Fix (Vite outDir ↔ Dockerfile Stage-2 COPY): `/build/backend/moag/static` statt `/build/frontend/dist`. Commit b5f1c92.
- [2026-05-16] [v0.1.0] Lokaler Smoke-Test Backend (uvicorn auf 127.0.0.1:17900) grün: /api/health, /api/v1/overview (8 Adapter), /api/v1/aggregator/health. OctoBoss erreichbar (5/5 Nodes), 7 weitere wie geplant ok=False/Stub.
- [2026-05-16] [v0.1.0] Lokaler Container-Build erfolgreich: `docker build -t moag:0.1.0 -f docker/Dockerfile .`. Image 72.6 MB (sha256:f33fe72971bf). Multi-Stage Node→Python-Slim. Container-Run mit Healthcheck grün.
- [2026-05-16] [v0.1.0] VDR-Deploy live: Image via `docker save -o tar / scp / docker load` auf VDR übertragen (72.6 MB). Container `moag` startet mit `--restart unless-stopped` auf Port 17900. Healthcheck grün, /api/v1/overview liefert die 8 SystemStatus, Frontend mit Title "MOAG — Mother of All GUIs" wird ausgeliefert. Panopticor-Test bewusst übersprungen (Read-only-GUI, siehe Memory feedback-panopticor-test-skip-gui).
- [2026-05-16] [v0.1.0] GitHub-Repo `underdog220/moag` erstellt (public), 6 Commits gepusht (HEAD 1591319). Remote `origin/main` aktiv.
- [2026-05-16] [v0.1.0] Oberon-Token in MOAG-Container gesetzt (token aus OCRexpert-GUI-Volume `/var/lib/ocrexpert-gui/.ocrexpert/gui_settings.json` übernommen). Container re-deployed mit `-e MOAG_OBERON_BASE_URL` + `-e MOAG_OBERON_TOKEN` + `-e MOAG_OCREXPERT_BASE_URL`. Oberon-Cockpit-Adapter liefert nun PASS 6/6 (Smoke-Sub-Checks), Aggregator-Overall springt 12 → 25 (KI-Backbone von 25 auf 50). OCRexpert-Adapter weiterhin offline (Service auf VDR:17810 antwortet nicht — separat zu klären).

## 2026-05-17 (Bug-Fixes Aktionen + NasDominator-Adapter)

- [2026-05-17] [v0.1.0] 4 Live-Bugs in Aktionen/Adapter behoben (Commit 06fe356):
  - Bug 1 (oberon.llm.test): Timeout 15s → 35s (Oberon Cold-LLM dauert bis 28s).
  - Bug 2 (oberon.dsgvo.check): Endpoint `/api/v2/dsgvo/status` war korrekt, Code war bereits funktionsfähig.
  - Bug 3 (octoboss.bench.start HTTP 422): Body-Schema korrigiert auf OctoBoss-Nested-Format `{"workload": {"workload_type": ..., "params": {...}}, ...}`.
  - Bug 4 (NasDominator 0/14 Services up): `/api/services/monitored` enthält nur Konfiguration ohne `status`-Feld. Adapter auf `/api/services/containers` umgestellt (`state: running/exited`). Score: 0 → 85, Summary: "8/16 Container running". 266/266 Tests grün. Live-Deploy per `docker cp` + Restart auf VDR.

## 2026-05-17 (Phase 7 — Mobile-Optimierung)

- [2026-05-17] [v0.1.0] Phase 7 Mobile-Optimierung: Touch-Targets ≥ 44px (min-h-[44px] + px-3 py-2/py-3) für TopBar-Buttons (Alert, Theme, Settings, GroupIndicator), NavBar-Links (Achsen + System-Links), alle Sub-Tab-Navs (OberonLayout, OctoBossLayout, OCRexpert OcrSubNav, NasDominatorLayout, CustosLayout), ConfirmDialog-Buttons, ActionCard-Start-Button, Aktualisieren-Button. Sub-Tab-Navs auf overflow-x-auto + scrollbar-none umgestellt (Mobile horizontal scroll). Tabellen-Wrapper nasdominator/Services + Container: overflow-hidden → overflow-x-auto. PageBadge: Routen-Text auf Mobile (< sm) ausgeblendet. Audit-Filter-Inputs: min-h-[44px]. Tooltip Long-Press: onTouchCancel + onTouchMove korrekt verdrahtet, kurzer Tap (<500ms) öffnet keinen Tooltip. Tooltip.test.tsx: 3 neue Long-Press-Tests (vi.useFakeTimers, 499ms kein Tooltip, 500ms Tooltip erscheint, onTouchMove bricht ab). Build grün, 352/355 Tests grün (3 Fehler vorher schon vorhanden in Jobs.test.tsx, durch Phase 7 nicht verursacht — sogar 2 Tests durch korrekten Import geheilt). Commit acdc967.

## 2026-05-17 (frühere Einträge)

- [2026-05-17] [v0.1.0] Schema-Drift-Bugfix in `/api/v1/overview`: Backend lieferte nur `system_id`, Frontend filterte aber auf `s.group === "KI-Backbone"` und nutzte `s.id` als React-Key → Overview-Sektionen filterten alle auf 0 Elemente → leerer Screen. Fix: `aggregator.SYSTEM_INFO` als Single-Source-of-Truth für (name, group), api.py augmentiert Response um id/name/group. Commit 2e761ea.
- [2026-05-17] [v0.1.0] `scripts/smoke-vdr.ps1` angelegt — Read-only HTTP-Smoke mit 5 Checks (api-health, overview-schema, aggregator-konsistent, frontend-html, frontend-assets). Lokal 5/5 PASS gegen VDR:17900. Schema-Check fängt den heute behobenen Bug strukturell.
- [2026-05-17] [v0.1.0] Smoke-Skript um `PANOPTICOR_SIGNAL exit_code_zero`-Zeile am Ende ergänzt — Pano matcht expectedSignal als Substring auf stdout/stderr (siehe `Panopticor/src/panopticor/execution.py:281`), automatisches Exit-Code-Mapping gibt es nicht.
- [2026-05-17] [v0.1.0] Panopticor-Run gegen MOAG-Smoke gelaufen (Bridge auf 127.0.0.1:8787, adapterKind `local-process`): Goal `goal-moag-container-up` passed=True, 0 failed assertions, score 1.0. Verdict `unstable/manual_review` (Pano-Standard ohne historische Baseline). Wiederholbar via `POST /runs` mit der Body-Struktur aus `task-moag-smoke-v3`.
- [2026-05-17] [v0.1.0] Aggregator-Schema-Bugfix: `/api/v1/aggregator/health` lieferte interne Form (groups als Dict, systems als string[], kein alert_count) — Frontend TopBar erwartete Array-Form mit alert_count. groups.map() crashte nach Mount → "blauer Screen". Backend liefert nun Array-Form via SYSTEM_INFO, smoke-vdr.ps1 prüft Schema strikt. 123/123 Tests grün. Commit 6a2382b.
- [2026-05-17] [v0.1.0] SonOfSETI als Top-Karte entfernt: SYSTEM_INFO + _GROUPS["ki_backbone"] + api.py-Adapter-Liste, NavBar-Eintrag, App.tsx-Route, SystemCard-Route-Map. SonOfSETI-Nodes werden weiterhin via OctoBoss-Adapter (`/seti/nodes`) sichtbar — Drilldown wandert nach OctoBoss. Adapter-Datei + Adapter-Tests bleiben für künftige Verwendung. test_overview: 8→7 Systeme. Legacy-Route `/sonofseti` → Redirect auf `/octoboss`.
- [2026-05-17] [v0.1.0] SystemCard komplett klickbar: gesamte Karte ist jetzt `<Link>` statt nur der Detail-Button. Hover-Effekt (border-brand, bg-bg-subtle, shadow-lg, Name in brand-Farbe). Detail-Button bleibt als optischer Marker (aria-hidden), kein eigener Link mehr.
- [2026-05-17] [v0.1.0] OctoBoss-Adapter Score-Formel ehrlich: vorher 100 nur weil Nodes connected, jetzt gewichtet 40% connected + 30% Ollama-läuft + 20% Hardware-Telemetrie-vorhanden + 10% Mode IDLE/ACTIVE. Live-Effekt: 92 → 42 (4/5 connected, 0/5 Ollama, 0/5 HW-Telemetrie, 5/5 Mode). Summary nennt die 4 Sub-Quoten. Metrics um `nodes_ollama_running`, `nodes_hardware_present`, `nodes_mode_ok` erweitert. ok=True erst ab score ≥ 40. 3 neue Adapter-Tests (no_nodes/perfect/connected_but_no_compute). 124/124 Tests grün, Smoke 5/5.
- [2026-05-17] [v0.1.0] Aktionen-API implementiert (V1): GET /api/v1/actions + POST /api/v1/actions/{action_id}/trigger. schemas.py um Action + ActionTriggerResponse erweitert. actions/-Package mit Registry-Pattern (@register-Dekorator). 3 echte Aktionen: oberon.smoke (nutzt CockpitClient), ocrexpert.health.check (httpx direkt), octoboss.cluster.status (httpx + /admin/cluster/status). 9 Stubs (oberon.llm.test, oberon.dsgvo.check, octoboss.bench.start, octoboss.node.reboot, octoboss.ollama.pull, ocrexpert.shadow.batch, nasdominator.services.refresh, custos.rules.run, panopticor.scenario.trigger). 12 Aktionen total in Registry. 154/154 Tests grün (30 neue Tests).
- [2026-05-17] [v0.1.0] **5-Agent-Parallellauf** für Drilldown-Erweiterung — je ein Subagent pro System. Konsolidierung in 4 Commits (87598fb Oberon+Custos, 754e5b8 NasDominator, cf61960 OctoBoss, 40904ec OCRexpert).
  - **Oberon (8 Sub-Routen):** /oberon/{providers,cost,audit,smoke,instances,pii-tuning,db-broker,contract}. Neuer `OberonPlatformClient` für /api/v2/* jenseits Cockpit. routes_oberon.py mit 10 Proxy-Endpunkten. oberon.llm.test + oberon.dsgvo.check als echte Aktionen.
  - **OctoBoss (8 Sub-Routen):** /octoboss/{nodes,jobs,assets,cluster,ocr,llm-models}. routes_octoboss.py mit 9 Proxy-Endpunkten. octoboss.bench.start + octoboss.ollama.pull als echte Aktionen. node.reboot bleibt Stub (destruktiv).
  - **OCRexpert (Drilldown erweitert):** /ocrexpert/{capabilities,logs} ergänzt zu jobs/history/charts. routes_ocrexpert.py mit 3 Endpunkten (capabilities, logs, openapi-summary). ocrexpert.shadow.batch echt.
  - **NasDominator (Stub → echt):** Adapter komplett neu, ehrliche Score-Formel (40/30/20/10), Auth-401-Behandlung. routes_nasdominator.py mit 4 Endpunkten. nasdominator.services.refresh echt.
  - **Custos (Stub → echt):** Adapter komplett neu, 3-Phasen-Probe (health → engine/status → findings), Score 50/30/20. routes_custos.py mit 5 Endpunkten. custos.rules.run echt mit POST /api/engine/run-once.
  - **Stand:** 10/12 Aktionen echt (2 bleiben Stub: octoboss.node.reboot destruktiv, panopticor.scenario.trigger CR-offen). 249 Backend-Tests + 340 Frontend-Tests grün. Smoke 5/5.
  - **Bekannte Folge-Bugs** (separater Cycle): einige echte Aktionen scheitern an Endpoint-Drift gegen die jeweiligen Original-Services (octoboss.bench.start HTTP 422 — falsches Body-Schema; oberon.dsgvo.check Endpoint-Pfad?; custos.rules.run wenn Service offline). MOAG meldet die Fehler ehrlich statt sie zu verstecken — genau das ist der Zweck.
  - 2 Mini-Fixes durch Hauptsession nach Subagent-Lauf: Cluster.tsx-Cast-Korrektur (TypeScript strict), OctoBossFeature.test.tsx Type-Annotation für MOCK_ACTIONS.
- [2026-05-17] [v0.1.0] Theme-Überarbeitung (Kontrast + Schriftgröße): fg-muted #94a3b8→#cbd5e1 (slate-300), fg-subtle #64748b→#94a3b8 (slate-400). Body-Fontsize explizit 16px in index.css. Card-Borders border-white/5→border-white/10 (TopBar, SystemCard), Hover border-white/20. SystemCard: Summary + MetricList + Detail-Button text-xs→text-sm. Overview: Beschreibungstext text-sm→text-base, Section-Header text-sm→text-base, Group-Score text-xs→text-sm. TopBar-Popover-Liste text-xs→text-sm. 56 Test-Files, 245 Tests grün. Build grün.
- [2026-05-17] [v0.1.0] Frontend-Aktionen-Achse: NavBar zweistufig (Übersicht/Aktionen als Haupt-Achsen, System-Links sekundär). TypeScript-Types (Action, ActionsResponse, ActionTriggerResponse schema-konform). api.ts: getActions()/triggerAction(). queryKeys.ts: qk.actions. mocks/payloads.json: 12 Mock-Aktionen. Neue Komponenten: ActionCard (DRY, Tooltip, ConfirmDialog, Result-Anzeige), ConfirmDialog (ESC+Backdrop=Cancel, danger-Modus), AktionenPage (Gruppen, PageBadge). Route /aktionen in App.tsx. 3 neue Test-Files. 59 Test-Files, 272 Tests grün. Build grün. Commit 8057589.
- [2026-05-17] [v0.1.0] **Phase 1.5 — OCRexpert Pipeline-Trigger aus MOAG.** Neue echte Aktion `ocrexpert.process` (POST /api/v1/process, 60s Timeout, Result: n_chars + doctype + payload). Neuer direkter Route-Proxy `POST /api/v1/ocrexpert/process` für Frontend ohne Action-API-Umweg. Jobs-Seite (/ocrexpert/jobs) mit Upload-Card: Linux-Pfad-Eingabe + UNC→Linux-Konvertierung (path_mapping.ts), OCR starten, Result-Panel (Zeichen-Anzahl, Doctype, Text-Vorschau, klappbarer JSON-Payload, Copy-Button). Backend: `_OcrProcessRequest` auf Modul-Ebene (ForwardRef-Fix bei lokal definierten Pydantic-Modellen). 266/266 Backend-Tests + 355/355 Frontend-Tests + tsc sauber. Commit fe7e3bf.
- [2026-05-17] [v0.1.0] **Hygiene-Block A+B:**
  - A) Token-Storage: `scripts/deploy-vdr.ps1` neu (env-file-Pattern: `/etc/moag.env`, chmod 600, root). `docs/DEPLOYMENT_VDR.md` neu (Deploy-Anleitung + Token-Rotation). `.env.example`-Header mit ACHTUNG-Hinweis. `.gitignore` um `secrets.local.env` + `*.secrets.env` erweitert. Token-Storage-Offener-Punkt aus PROJEKT_STATUS.md entfernt.
  - B) SonOfSETI aufgeräumt: `backend/moag/adapters/sonofseti.py` gelöscht, `backend/tests/test_adapter_sonofseti.py` gelöscht (3 Tests), `frontend/src/features/sonofseti/index.tsx` + Ordner gelöscht. Kommentare in aggregator.py + test_api.py aktualisiert. FEATURES.md Deprecated-Eintrag auf "gelöscht 2026-05-17" angepasst. Legacy-Redirect `/sonofseti → /octoboss` in App.tsx bleibt.
  - Tests: 259/259 Backend grün (minus 7 gelöschte sonofseti-Tests), 355/355 Frontend grün, Build grün.

## 2026-05-17 (Upload-Hub Frontend-Skelett)

- [2026-05-17] [v0.1.0] **Upload-Hub — dritte Top-Achse `/upload` (Frontend-Skelett):**
  - `frontend/src/lib/uploadOperations.ts` (NEU): `UploadOperation`-Interface + `UPLOAD_OPERATIONS[]` (alle 10 Operationen exakt nach `docs/UPLOAD_SCHEMA.md`), `compatibleOperations(mime)`, `detectMime(file)`, `formatBytes(n)`, `acceptString(op)`.
  - `frontend/src/lib/types.ts` (Append): `Upload`, `UploadResult`, `UploadListResponse`.
  - `frontend/src/lib/queryKeys.ts` (Append): `qk.uploads.{list,detail,result}`.
  - `frontend/src/lib/api.ts` (Append): `api.upload.{submit,list,get,result,artifactUrl,delete}` + `UploadListFilter`-Interface. Mock-Modus bedient POST sofort mit completed-Result.
  - `frontend/src/features/upload/` (NEU): 6 Dateien — `ParamsForm.tsx`, `ResultPanel.tsx`, `OperationCard.tsx`, `MultiDropZone.tsx`, `UploadHistory.tsx`, `UploadHubPage.tsx`, `index.tsx`.
  - `frontend/src/components/NavBar.tsx`: dritte Achse "Upload" ergänzt, `isUploadPath()` korrekt.
  - `frontend/src/App.tsx`: Route `/upload/*` → `UploadHubPage` registriert.
  - `frontend/src/mocks/payloads.json` (Append): `GET /api/v1/uploads` (7 Beispiele verschiedener Operations+Status), `GET /api/v1/uploads/{id}/result`, `POST /api/v1/upload`.
  - Tests (5 neue Dateien, 56 neue Tests): `uploadOperations.test.ts`, `ParamsForm.test.tsx`, `OperationCard.test.tsx`, `MultiDropZone.test.tsx`, `UploadHubPage.test.tsx`.
  - **Ergebnis:** 73 Test-Files / 399 Tests grün, `npm run build` grün.

## 2026-05-17 (Upload-Listing Bug-Fix)

- [2026-05-17] [v0.2.0] **Bug-Fix: GET /api/v1/uploads HTTP 500 bei nicht-leerer DB (Bug 1).**
  - Root-Cause: psycopg3 (PostgreSQL) liefert Zeilen als `tuple`, nicht als dict. `repository.py` griff mit `row["upload_id"]` (String-Key) zu → `TypeError: tuple indices must be integers or slices, not str`.
  - Zweite Ursache: `SELECT COUNT(*)` liefert bei psycopg dict_row `{'count': 1}`, Code griff mit `count_row[0]` (int-Key) zu → `KeyError: 0`.
  - Fix 1 (`backend/moag/upload/db.py`): Pool-Init um `kwargs={"row_factory": dict_row}` erweitert; psycopg_simple-Pfad nutzt `psycopg.AsyncConnection.connect(..., row_factory=dict_row)`.
  - Fix 2 (`backend/moag/upload/repository.py`): `SELECT COUNT(*) AS n FROM uploads` (einheitlicher Spaltenname); beide DB-Pfade nutzen `count_row["n"]`.
  - Tests: 1 neuer Regression-Test `test_list_uploads_mit_eintraegen_dict_zugriff` in `test_upload_db.py` (prüft list_uploads mit vorhandenen Einträgen — war die Lücke die den Live-Bug nicht abfing). 24/24 Tests grün.
  - Live-Verify: `GET http://192.168.200.71:17900/api/v1/uploads` liefert JSON-Array mit dem vorhandenen Eintrag (HTTP 200). Container hot-patched via `docker cp` + Restart.

## 2026-05-17 (OCR-Operations-Handler)

- [2026-05-17] [v0.1.0] **4 echte Upload-Handler für OCR-Operations:**
  - `backend/moag/upload/handlers/ocr_standard.py` (NEU): POST multipart an OCRexpert `/api/v1/process`, mappt ProcessV1Response (text, text_len, pages, quality, pdfa_url) auf UploadResult.
  - `backend/moag/upload/handlers/ocr_shadow.py` (NEU): Persistiert Datei in `MOAG_SHADOW_TMP_DIR/<upload_id>.pdf` (zur Laufzeit aus ENV), POST JSON an OCRexpert `/api/v1/shadow/process`. 403 path_not_allowed mit Hinweis auf OCREXPERT_SHADOW_ALLOWED_ROOTS.
  - `backend/moag/upload/handlers/ocr_direct.py` (NEU): Engine-Whitelist {tesseract,surya,paddle,easyocr}, POST multipart an OctoBoss `/api/v1/dispatch/ocr-{engine}/process`. Fallback auf OCRexpert direkt bei 404 oder ConnectError.
  - `backend/moag/upload/handlers/pdf_split.py` (NEU): POST multipart an OCRexpert `/ocr/split`, mappt SplitResponse (seiten_anzahl, anzahl_teildokumente, teildokumente-Normalisierung, grenzen, llm_benutzt).
  - `backend/moag/upload/handlers/__init__.py`: `ocr_standard` in `_OPTIONAL_HANDLERS` ergänzt (überschreibt Stub).
  - Schemas live aus OCRexpert-OpenAPI (http://192.168.200.71:17810) abgefragt — exakte Feldnamen verwendet.
  - 4 Test-Files (40 Tests): test_upload_handlers_ocr_standard/shadow/direct/pdf_split.py — 40/40 grün.
  - Registry zeigt: `['ocr.standard', 'ocr.shadow', 'ocr.direct', 'pdf.split']`.
