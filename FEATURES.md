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
- **Was:** MOAG-Logo · Gesamt-Health-Score + Mini-Balken · 3 Gruppen-Indikatoren (Hover-Popover) · Alert-Counter · Theme-Toggle · Settings
- **Code:** `frontend/src/components/TopBar.tsx`
- **Datenquelle:** `GET /api/v1/aggregator/health` (Polling 10s, Placeholder-Fallback)
- **Mobile:** schrumpft auf `MOAG · {score}%`

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
