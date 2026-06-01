# FEATURES — MOAG

Inventar aller Features. Stand 2026-05-17. Aktualisiert nach Phase 1–7 + 11/12 echten Aktionen.

## Aktiv

### Cockpit & Navigation

#### Overview-Dashboard
- **Was:** 7 Karten in 3 Gruppen (KI-Backbone · Infrastruktur · Compliance & Test), je Karte mit Hero-Gauge + Mini-Indikatoren + Status-Dot
- **Klickbar:** Gesamte Card ist `<Link>`, Hover-Brand-Akzent (nicht nur Button)
- **Code:** `frontend/src/features/overview/{Overview.tsx, SystemCard.tsx}`
- **Datenquelle:** `GET /api/v1/overview`

#### TopBar (sticky, alle Routen)
- **Was:** MOAG-Logo · Versions-Badge (`/api/health`) · Gesamt-Health-Score + Mini-Balken · 3 Gruppen-Indikatoren (Hover-Popover) · Alert-Counter (→ `/alerts`) · **Theme-Toggle (Cycle Dunkel→Hell→Amber)** · Settings
- **Code:** `frontend/src/components/TopBar.tsx`
- **Datenquelle:** `GET /api/v1/aggregator/health` (Polling 10s, Placeholder-Fallback)
- **Mobile:** schrumpft auf `MOAG · {score}%`

#### Theme-System (3 Themes, umschaltbar)
- **Was:** Dunkel (Default) · Hell · **Amber/Braun** („For All Mankind" Mission-Control: Bernstein `#e09a3e` auf warmem Dunkel `#1a1410`, Creme-fg). CSS-Variablen-basiert (`rgb(var(--c-x) / <alpha>)`), Umschaltung über `.theme-*`-Klasse am `<html>`, persistiert in localStorage.
- **Kontraste:** WCAG-AA+ (fg/bg ~13:1 AAA, brand ~8:1, Status ≥4.5:1).
- **Code:** `frontend/tailwind.config.js`, `src/styles/index.css`, `src/lib/store.ts` (`applyTheme`)

#### Node-Konsolenkarten (`/octoboss/nodes`)
- **Was:** Mission-Control-Karten pro Node statt Tabelle — Callsign-Header + Status-LED + Mode, Segment-Bargraphs (GPU/CPU-Last, grün→gold→terrakotta), RAM-frei, Heartbeat-Puls, **GPU-Runtime-Badge** (zeigt „Runtime offline", wenn `gpu_runtime_ready=false` — erklärt fehlende Last-Telemetrie).
- **Klickbar:** Gesamte Karte ist `<Link>` zum Node-Detail (nicht nur der Name), focus-visible-Outline für Tastatur.

#### Node-Detail-Übersicht (`/octoboss/nodes/:id`)
- **Was:** Große „Alles-über-den-Knoten"-Seite im Panel-Grid: Header (Status/Mode/Pool/Power/Vision-Chips), **Identität** (Node-ID, IP, MAC, Plattform, **Core-Version**=`agent_version`; Bootstrapper „nur Cluster-weit"), **Hardware** (Bargraphs + Temps + VRAM), **GPU/KI-Diagnose** (`compute_device`, `gpu_fallback_detected`, `vision_capable`), **Ollama** + scrollbare Modell-Liste (Vision-Marker), **Module** scrollbare Liste (`installed_modules_detail`: Version/Status/Port/PID/min-core/installiert-seit), Capabilities-Chips, Lifecycle, Node-Alerts.
- **Datenquelle:** `GET /api/v1/octoboss/nodes/{id}` (1:1-Hub-Proxy, Polling 10s) — **kein** Backend-Mapping (Type liest jetzt die echten Hub-Felder).
- **Code:** `frontend/src/features/octoboss/pages/NodeDetail.tsx`, Typen `OctoBossNodeDetail`/`OctoBossModuleDetail`

#### Ultrawide-Layout
- **Was:** Globaler `max-w-[2200px] mx-auto`-Cap im Layout (Content zentriert; TopBar/NavBar bleiben voll breit/sticky) gegen Extrem-Strecken auf 21:9/32:9. Custom-Breakpoint `3xl:1920px` → Karten-Grids skalieren auf mehr Spalten statt breiter zu werden.
- **Code:** `frontend/src/components/Layout.tsx`, `frontend/tailwind.config.js`
- **Code:** `frontend/src/features/octoboss/pages/Nodes.tsx`; Backend `NodeHardware` (+`gpu_present`/`gpu_runtime_ready`/Temps) in `models.py`/`hub_client.py`
- **Datenquelle:** `GET /api/v1/octoboss/nodes` (Polling 10s)

#### Alert-Center `/alerts`
- **Was:** Zentrale Ansicht aller aktiven Alerts, gruppiert nach Severity (kritisch zuerst). Je Alert: System-Name + Drilldown-Link, Gruppe, Summary, Fehlertext, Score, „seit", Quittier-Button.
- **Severity:** `critical` = System nicht erreichbar (ok=false) · `warning` = erreichbar aber Score < 50. `critical_count` deckungsgleich mit `aggregator/health.alert_count`.
- **Acknowledge:** Alerts quittierbar (persistiert in SQLite `alert_acks`); Quittierung erlischt automatisch, wenn sich der Alert-Zustand ändert (Key aus `system_id+severity+summary`). „Wieder öffnen" hebt auf.
- **Zugang:** Alert-Counter in der TopBar verlinkt hierher (vorher → `/`).
- **Code:** `frontend/src/features/alerts/{AlertCenter,index}.tsx`; Backend `backend/moag/{alerts.py, alert_ack_store.py}` + Endpoints in `api.py`
- **Datenquelle:** `GET /api/v1/alerts` (Polling 15s) · `POST /api/v1/alerts/{key}/ack` · `POST .../unack`
- **Persistenz:** `MOAG_ALERTS_DB` (Default `~/.moag/alerts.db`, im Deploy auf das Volume gelegt)

#### Adapter-Status-Inspector `/inspector`
- **Was:** Read-only Debug-Detailansicht aller Adapter — pro System die rohe `SystemStatus`-Antwort (ok, score, summary, error, fetched_at, alle `metrics` als Tabelle). „JSON kopieren" pro Karte + „Alles kopieren" (Pipeline-Logging-Kopierbar-Pflicht).
- **Code:** `frontend/src/features/inspector/{InspectorPage,index}.tsx`
- **Datenquelle:** `GET /api/v1/overview` (wiederverwendet, Polling 30s) — kein eigener Endpoint

#### OpenAPI-Browser `/openapi`
- **Was:** Browsebare OpenAPI-Specs von MOAG selbst + den erreichbaren Sub-Systemen. Target-Auswahl → Endpoint-Liste (Methode, Pfad, Summary, Tags), Suche. Nicht erreichbare Systeme werden als solche markiert (kein Crash).
- **Code:** Backend `backend/moag/routes_openapi.py` (`build_openapi_router`), Frontend `frontend/src/features/openapi/*`
- **Datenquelle:** `GET /api/v1/openapi/targets` · `GET /api/v1/openapi/{target}` (MOAG via `app.openapi()`, Sub-Systeme via httpx-Proxy auf `/openapi.json`, Timeout 5s)

#### OCR-Upload `/ocr-upload` (Phase 1.5b)
- **Was:** Echter `multipart/form-data`-Datei-Upload an OCRexpert (schließt die `ocrexpert.process`-Lücke: vorher JSON-`{pfad}` → HTTP 422). Drag&Drop/Picker + Parameter (profile/output/language), Ergebnis-/Fehler-Anzeige.
- **Schema (verifiziert gegen OCRexpert):** File-Feld `file` (multipart), `profile`/`output`/`language`/`inline_pdfa` als **Query**-Params; OCRexpert akzeptiert nur PDF.
- **Code:** Backend `backend/moag/routes_ocr_upload.py` (`build_ocr_upload_router`), Frontend `frontend/src/features/ocr-upload/*`
- **Datenquelle:** `POST /api/v1/ocrexpert/upload` → leitet als multipart an OCRexpert `/api/v1/process` weiter
- **Hinweis:** koexistiert mit dem alten `POST /api/v1/ocrexpert/process` (JSON-Pfad); Ablösung später.

#### NavBar zweistufig (Achsen-Navigation)
- **Was:** Top-Achsen `[Übersicht] [Aktionen]` + sekundäre System-Links (nur unter Übersicht)
- **Code:** `frontend/src/components/NavBar.tsx`

#### Aktionen-Achse `/aktionen`
- **Was:** Alle ausführbaren Operationen, gruppiert nach Sub-System. 12 Aktionen heute.
- **Code:** `frontend/src/features/aktionen/{AktionenPage,ActionCard,index}.tsx`
- **DRY:** ActionCard wird in System-Drilldowns wiederverwendet (Phase 1-Vertrag)

### Frontend-Komponenten (gemeinsam)

| Komponente | Code | Pflicht aus |
|---|---|---|
| `Tooltip` (Hover + Long-Press) | `components/Tooltip.tsx` | ADR-004 |
| `Gauge` (hero + mini, Schwellwerte) | `components/Gauge.tsx` | ADR-003 |
| `PageBadge` (`pg:<route> · commit · ts`) | `components/PageBadge.tsx` | globale CLAUDE.md |
| `ConfirmDialog` (generisch, danger-Modus) | `components/ConfirmDialog.tsx` | ADR-007 (Action-Pflicht) |
| `Breadcrumb` | `components/Breadcrumb.tsx` | ADR-003 |
| `StatusDot`, `LoadingSpinner`, `EmptyState` | `components/` | — |

### Per-System-Drilldowns

#### Oberon (`/oberon/*`)
- **Sub-Routen:** `providers` · `cost` · `audit` · `smoke` · `instances` · `pii-tuning` · `db-broker` · `contract`
- **Backend:** `routes_oberon.py` (10 Proxy-Routes) + `clients/oberon_cockpit_client.py` + `clients/oberon_platform_client.py`
- **Aktionen integriert:** ActionCards für `oberon.smoke`, `oberon.llm.test`, `oberon.dsgvo.check`

#### OctoBoss (`/octoboss/*`)
- **Sub-Routen:** `nodes` (Liste) · `nodes/:id` (Detail) · `jobs` · `assets` · `cluster` (Sync/Peers) · `ocr` · `llm-models` · `manifest-health` · `benchmarks`
- **Backend:** `routes_octoboss.py` (14 Proxy-Routes + `_proxy_post`-Helper)
- **Score-Formel:** ehrlich gewichtet (40% connected · 30% Ollama · 20% Hardware-Telemetrie · 10% Mode IDLE/ACTIVE)
- **Aktionen integriert:** `octoboss.cluster.status`, `octoboss.bench.start`, `octoboss.ollama.pull`

#### OctoBoss Bench-Dashboard (`/octoboss/benchmarks`)
- **Was:** Vollstaendiges Benchmark-Dashboard fuer die OctoBoss-Bench-Suite
- **Run-Panel:** Button mit ConfirmDialog + aktiver-Run-Indikator (pulsierender Dot). Polling dynamisch: 3s bei laufendem Run, 30s im Idle (via React-Query refetchInterval).
- **Matrix:** subjects x nodes, sparse (fehlende Zellen = "—"), Passed/Failed-Dot, Trend-Icon (up/down/stable), Stale-Markierung (>24h ausgegraut). Tooltips ADR-004: metric_string, age_hours, trend, error_text.
- **History:** Letzte 50 Eintraege, sortierbar nach Subject/Node/Wert/Zeitpunkt. Status-Badge (✓ ok / ✗ fail).
- **503-Degraded-State:** Banner "Benchmark-DB nicht verfuegbar — OctoBoss pruefen" statt Crash.
- **Skipped-Run:** Hinweis "uebersprungen — anderer Run aktiv" wenn summary.skipped=true.
- **Code:** `frontend/src/features/octoboss/pages/Benchmarks.tsx`, `backend/moag/routes_octoboss.py` (benchmarks/*), `frontend/src/lib/api.ts` (octoboss namespace)
- **Tests:** `backend/tests/test_routes_octoboss_bench.py` (7 Tests), `frontend/src/features/octoboss/__tests__/Benchmarks.test.tsx` (12 Tests)

#### Manifest-Health + Cluster-Intent (`/octoboss/manifest-health`)
- **Was:** Multi-Hub-Manifest-Validierung + Cluster-Intent-Steuerung (Versionen, Pinning, Modul-Drift). Architektur-Aussage: "Cluster-Intent sichtbar und steuerbar machen".
- **Health-Sektion:** Schema-Validierung (default_version, versions, node_overrides), Cross-Reference, EXE-Existenz, SHA-Match, Live-Konsistenz pro Hub-Card (aktiver Hub mit Stern-Badge, Sekundaer-Hubs gelistet).
- **Cluster-Intent-Sektion (`ClusterIntentSection`):**
  - **Versions-Panel** pro Manifest-Typ (Core + Bootstrapper): aktive default-Version + aufklappbare Versions-Liste (SHA-Kurz, size). Default-Tausch-Knopf pro nicht-aktiver Version.
  - **Override-Tabelle**: pro Node-Zeile Pin-/Unpin-Button via `PinDialog` (Versions-Dropdown).
  - **Modul-Drift-Anzeige**: Drift-Liste (Modul X laeuft auf >= 2 Versionen) + Module-by-Node-Detail (`installed_modules_detail` aus `/seti/nodes`-Heartbeat).
  - **DefaultFlipDialog**: Doppel-Confirm + Impact-Vorschau (`nodes_affected` vs. `nodes_pinned`) + Panopticor-Pretest-Hart-Block bis GREEN-Verdict (Spec-File-Pattern Weg A). Generisch fuer Core + Bootstrapper (`target`-Prop).
- **Bootstrapper-Sektion**: **aktiv** seit 2026-06-01 (OctoBoss-CR `2026-05-23-bootstrapper-admin-api` durch). Symmetrisch zur Core-Sektion: Versions-Panel, Override-Tabelle (Pin/Unpin), Default-Flip mit Pretest-Pflicht. Quelle `GET /api/v1/seti/bootstrapper/versions`; alte Hubs ohne diesen Endpoint fallen auf `/seti/distribute/info` zurueck (`supports_versions_api=false` ⇒ Buttons disabled + CR-Hinweis).
- **Backend:**
  - `manifest_health.py` (Schema-/Live-Checks)
  - `manifest_inventory.py` (Versionen + Overrides + Modules + Drift aggregieren; Bootstrapper via `/bootstrapper/versions` mit Legacy-Fallback)
  - `manifest_admin.py` (Admin-Proxy mit Bearer-Token, Impact-Berechnung, Pretest-Spec-File-Erzeugung; `target_kind`-parametrisiert fuer Core + Bootstrapper)
  - `routes_manifest_health.py` (`GET /api/v1/manifest/health`, `/health/all`, `/inventory`)
  - `routes_manifest_admin.py` (symmetrische Routen je `{target}`=core|bootstrapper: `GET /admin/{target}/default/impact`, `POST /admin/{target}/default`, `/override`, `/override/delete`; plus `/pretest`, `/pretest-callback`, `GET /admin/pretest/{spec_id}`)
- **Settings:** `octoboss_admin_token` (ENV `MOAG_OCTOBOSS_ADMIN_TOKEN`, in API-Response maskiert)
- **Tests:** `test_manifest_health.py`, `test_manifest_inventory.py` (12), `test_manifest_admin.py` (29), `ClusterIntentSection.test.tsx` (15), `ManifestHealth.test.tsx`

#### OCRexpert (`/ocrexpert/*`)
- **Sub-Routen:** `jobs` (mit Upload-Card + Pfad-Eingabe + UNC→Linux-Konvertierung) · `history` · `charts` · `capabilities` · `logs` (Tail mit Copy)
- **Backend:** `routes_ocrexpert.py` (4 Proxy-Routes inkl. POST /process)
- **Adapter:** ehrliche Score-Formel (40% status=ok · 25% engines_local · 20% octoboss_reachable · 10% libreoffice · 5% shadow)
- **Aktionen integriert:** `ocrexpert.health.check`, `ocrexpert.shadow.batch`, `ocrexpert.process`

#### NasDominator (`/nasdominator/*`)
- **Sub-Routen:** `services` · `metrics` · `container`
- **Backend:** `routes_nasdominator.py` (4 Proxy-Routes) + Cookie-Session-Auth via `/api/auth/login`
- **Adapter:** ehrliche Score-Formel (40% reachable · 30% Container running · 20% Metrics · 10% kein Warn). Live-Score 85.
- **Aktion integriert:** `nasdominator.services.refresh`

#### Custos (`/custos/*`)
- **Sub-Routen:** `findings` · `rules` · `audit`
- **Backend:** `routes_custos.py` (5 Proxy-Routes)
- **Adapter:** 3-Phasen-Probe (health → engine/status → findings), Score 50/30/20
- **Aktion integriert:** `custos.rules.run`

#### Stubs (`/nasdominator` Container-Tab existiert, `/qnapbackup/*` · `/panopticor/*`)
- qnapbackup: Stub-Card, wartet auf CR #3 (`requests/open/2026-05-16-moag-status-endpoint.md`)
- panopticor: Stub-Card, wartet auf CR #4 (`requests/open/2026-05-16-moag-status-api.md`)

### Backend-Architektur

#### Aggregator (`/api/v1/aggregator/health`)
- **Gruppen:** KI-Backbone (50%) · Infrastruktur (30%) · Compliance & Test (20%)
- **Schema:** Array-Form für TopBar (`groups[].{name,score,systems[].{name,score,ok}}`) + `alert_count` + `overall_score`
- **Single-Source-of-Truth:** `aggregator.SYSTEM_INFO` Map für (name, group_label)
- **Code:** `backend/moag/aggregator.py`, `backend/moag/api.py`

#### Overview-API (`/api/v1/overview`)
- **Liefert:** 7 `SystemStatus` mit `id`, `name`, `group`, `ok`, `score`, `summary`, `metrics`, `fetched_at`
- **Parallel:** `asyncio.gather(return_exceptions=True)` — kaputte Adapter brechen nichts
- **Code:** `backend/moag/api.py`

#### Aktionen-API (`/api/v1/actions` + `/api/v1/actions/{id}/trigger`)
- **Registry-Pattern:** `@register(Action(...))` Decorator
- **12 Aktionen:** 11 echt (oberon.smoke/.llm.test/.dsgvo.check, octoboss.cluster.status/.bench.start/.ollama.pull, ocrexpert.health.check/.shadow.batch/.process, nasdominator.services.refresh, custos.rules.run) + 1 echt mit Service-Abhängigkeit (custos.rules.run scheitert wenn Custos-Service aus) + 2 Stubs (octoboss.node.reboot destruktiv-bewusst, panopticor.scenario.trigger CR-pending)
- **Code:** `backend/moag/actions/` (Registry + 12 Module + Tests)
- **Schema:** `docs/ACTIONS_SCHEMA.md` (verbindlich)

#### Settings + Cookie-Auth
- **Settings-Store:** JSON-Persistenz mit Listener-Pattern, ENV-Overrides (`MOAG_*`)
- **Spezifisch NasDominator:** `nasdominator_user` + `nasdominator_password` ENV → Cookie-Session-Cache (TTL 10min) im Adapter
- **Code:** `backend/moag/settings_store.py`, `models.py`, `adapters/nasdominator.py`

### Mobile-Tauglichkeit (Phase 7)
- **Touch-Targets:** ≥ 44×44px auf allen Buttons, NavLinks, Sub-Tabs
- **Long-Press-Tooltip:** 500ms-Halten öffnet Tooltip; kurzer Tap nicht
- **Sub-Tab-Nav:** horizontal scrollbar auf Mobile (`overflow-x-auto scrollbar-none`)
- **Tabellen:** alle in `<div className="overflow-x-auto">`-Wrapper
- **PageBadge:** Routen-Text auf `< sm` ausgeblendet
- **Code:** `Tooltip.tsx`, `TopBar.tsx`, `NavBar.tsx`, `ConfirmDialog.tsx`, `PageBadge.tsx`, alle Sub-Tab-Layouts, ActionCard, NasDom-Pages, Audit-Filter

### Change-Request-Workflow (CR-Schema v1.1)

- **Was:** `requests/`-Verzeichnis mit Unterordnern `open/`, `done/`, `rejected/`. Format-Quelle: `C:\code\sebald-suite\docs\cr-schema\` (Single-Source-of-Truth cluster-weit).
- **Template:** `requests/TEMPLATE.md` (Kopie des zentralen Templates, wird bei Schema-Updates manuell synchronisiert)
- **README:** `requests/README.md` (Lifecycle, Pfad-Konventionen, Verweis auf sebald-suite)
- **Pre-Commit-Hook:** `.githooks/pre-commit` — validiert CRs in `requests/{open,done,rejected}/*.md` gegen das JSON-Schema via `validate-crs.py`. Aktivieren: `git config core.hooksPath .githooks`.
- **Aktiviert:** 2026-05-18, Welle 3 (cluster-weit)

### Tests + Smoke

- **Backend:** 266 Tests (pytest)
- **Frontend:** 355 Tests, 64 Test-Files (vitest)
- **Smoke-Skript:** `scripts/smoke-vdr.ps1` — 5 Read-only-Checks (api-health, overview-schema, aggregator-konsistenz, frontend-html, frontend-assets). Fängt Schema-Drift strukturell. 30s Timeout (Cold-LLM-tolerant).
- **Panopticor-Run:** `local-process`-Adapter via Bridge `POST /runs` (Setup dokumentiert in `memory/reference_panopticor_signal_mechanik.md`)

### Container + Deployment

- **Image:** `moag:0.1.0` (Multi-Stage Dockerfile, ~76 MB)
- **Live:** `http://192.168.200.71:17900/` auf VDR mit `--restart unless-stopped`
- **GitHub:** `underdog220/moag` (public)

## Migriert (war im OCRexpert-GUI-Prototyp, ist in MOAG)

| War (OCRexpert-Prototyp) | Ist (MOAG) | Datum |
|---|---|---|
| `gui/api.py` + Routes | `backend/moag/api.py` + `routes_*` | 2026-05-16 |
| `gui_frontend/src/components/TopBar.tsx` | `frontend/src/components/TopBar.tsx` (komplett neu für Health-Score) | 2026-05-16 |
| `features/cluster-dashboard/` | `features/octoboss/pages/Nodes.tsx`, `LlmModels.tsx`, `Ocr.tsx`, `Cluster.tsx` | 2026-05-17 |
| `features/cluster/` (Schwarm-Status) | `features/octoboss/pages/Cluster.tsx` | 2026-05-17 |
| `features/{job-queue, job-detail, history, charts}/` | `features/ocrexpert/pages/{Jobs, ...}/` | 2026-05-16 |
| `features/llm/` + `cost/` + `audit/` | `features/oberon/pages/{Providers, Cost, Audit}.tsx` | 2026-05-17 |
| `routes_cockpit.py` (Oberon-Proxy) | `routes_oberon.py` (10 Routes — erweitert) | 2026-05-17 |

## Verloren / Migrations-TODO

_(noch leer — Migration aus OCRexpert war vollständig)_

## Bewusst deprecated

### SonOfSETI als Top-Karte (entfernt 2026-05-17)
- **War:** eigene Top-Karte + `/sonofseti/*`-Route + `backend/moag/adapters/sonofseti.py` + `frontend/src/features/sonofseti/`
- **Nicht migriert weil:** SonOfSETI-Nodes werden via OctoBoss-Hub-Heartbeat sichtbar (Drilldown unter `/octoboss/nodes`). Eigene Karte war redundant.
- **Adapter-Datei gelöscht 2026-05-17** — bei Bedarf aus Git-History wiederherstellbar. Code basierte auf Annahmen die sich seitdem verschoben haben.
- **Frontend-Feature-Ordner gelöscht 2026-05-17** — `frontend/src/features/sonofseti/`
- **Legacy-Route bleibt:** `/sonofseti` und `/sonofseti/*` → Redirect auf `/octoboss` (für externe Links)

## Klärungsbedarf

### ocrexpert.process Body-Schema-Drift
- **Stand:** Aktion ruft `POST /api/v1/process` mit JSON `{pfad: ...}`. OCRexpert-OpenAPI sagt aber `multipart/form-data` mit File-Upload.
- **Optionen:** (a) Multipart-Upload-Logik bauen (MOAG-Server liest Datei + sendet) oder (b) Aktion auf `/api/v1/shadow/process` mit `{source_path, shadow_path}` umbiegen. Roman entscheidet welcher Pfad.

### ocrexpert.shadow.batch Body-Schema-Drift (vermutlich)
- **Stand:** war im alten Briefing `{pfad: ...}`. OpenAPI sagt `{source_path, shadow_path}`. Nicht live verifiziert (kein Test seit Subagent-Lauf), aber wahrscheinlich gleiches Problem wie `ocrexpert.process`.

### SonOfSETI-Adapter-Datei
- **Stand:** `backend/moag/adapters/sonofseti.py` + Tests existieren, werden nicht mehr aufgerufen (Top-Karte entfernt).
- **Optionen:** (a) löschen (klare Hygiene) oder (b) drinlassen + Settings-Versorgung für `node_addresses` ergänzen für direkten Node-Drilldown unter `/octoboss/nodes/:id`. Roman entscheidet.

### Token-Storage-Hardening
- **Stand:** Tokens (Oberon, NasDom-Password) werden über `docker run -e` gesetzt → sichtbar in `docker inspect`.
- **Optionen:** (a) env-file mit chmod 600 auf VDR (einfacher) oder (b) Settings-Volume mit gemounteter Datei wie OCRexpert-GUI es macht (sauberer, persistent zwischen Image-Updates).

### Multi-Hub-Discovery vs. Single-Hub
- **Stand:** OctoBoss-Adapter nutzt nur den Default-Hub (NAS-Shadow auf VDR:18765). Prototyp hatte Multi-Hub-Polling.
- **Optionen:** für V1 reicht Single-Hub, Multi-Hub bei Bedarf Phase 9+.

### A/B-Compare (Phase-2-Stub aus OCRexpert)
- **Stand:** ab_compare-Endpoint liefert `available=false`. Frontend-Komponente existiert im Prototyp.
- **Klären:** Feature in MOAG weiterführen oder fallenlassen.

## Bekannte Bugs (offen)

- **OctoBoss-Page-Crash** (Task #27): Roman meldete Crash auf einer OctoBoss-Sub-Seite. Backend-Routes alle HTTP 200. Wartet auf F12-Browser-Console-Diagnose.
- **NasDom-Service-Status-Strings:** für `/api/services/monitored` matcht der Adapter ggf. nicht alle echten Status-Strings (Refinement-Detail).
