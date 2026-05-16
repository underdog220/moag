# ARCHITEKTUR — MOAG (Mother of All GUIs)

## 1. Zweck

MOAG ist das zentrale, browser-basierte Cockpit für die Sebald-Helper-Suite und angrenzende Infrastruktur. Es löst den OCRexpert-internen GUI-Prototyp (`ocrexpert-gui:0.7.1`) als eigenständiges Projekt ab und erweitert ihn um die NAS-/Compliance-/Test-Schicht.

Leitprinzip: **Auf einen Blick lesbar, per Drilldown vertiefbar, ohne Doku bedienbar.**

## 2. Scope V1 — 8 Sub-Systeme in drei Gruppen

| Gruppe | System | Rolle | Backend-API |
|---|---|---|---|
| **KI-Backbone** | Oberon | LLM-Gateway, DSGVO, Audit, Cost, Instances | ~35 HTTP-Endpoints live |
| | OctoBoss | OCR-Gateway, SETI-Hub, Asset-Inventar, Cluster-Sync | live |
| | SonOfSETI | Node-Drilldown (Identity, Logs, Module, Health) | REST 7878 live |
| | OCRexpert | Jobs, Engines, Doctype, Charts | live |
| **Infrastruktur** | NasDominator | NAS-Health, Critical-Services (Oberon/OctoBoss/Postgres) | FastAPI 9090 live |
| | qnapbackup | Backup-Status, Replica-Health | Web-UI live, HTTP-Status-API offen (CR) |
| **Compliance & Test** | Custos | Compliance-Findings, Rule-Engine | FastAPI 17890 live |
| | Panopticor | Sandbox-Test-Runs, Scenario-Status | Desktop-only, Status-API offen (CR) |

## 3. Tech-Stack (übernommen aus OCRexpert-GUI-Prototyp)

- **Backend:** FastAPI + uvicorn (Python 3.12)
- **Frontend:** React 18 + TypeScript (strict) + Vite + Tailwind + React Query + Zustand + recharts + pdf.js
- **Live-Updates:** WebSocket-EventBus + Polling-Fallback
- **Persistenz:** SQLite (lokale Caches, Job-Mirror), JSON-Settings mit Listener-Pattern
- **Build:** Docker Multi-Stage (Node-Build → Python-Slim)
- **Deployment:** Container auf VDR, Port 17900 (Vorschlag, in Phase 1 final festlegen)

## 4. Architektur-Entscheidungen (ADR-Kurzform)

### ADR-001 — Hard-Fork statt Submodul
Der GUI-Code aus OCRexpert wird einmalig komplett nach `C:\code\moag` kopiert. OCRexpert-Repo wird auf reine OCR-Pipeline reduziert. **Grund:** Saubere Trennung der Lebenszyklen, kein Submodul-Pflegeaufwand, MOAG kann eigenständig versioniert und deployed werden.

### ADR-002 — Container auf VDR
MOAG läuft als Docker-Container auf dem VDR-Server (192.168.200.71), nicht auf der NAS und nicht als Desktop-App. **Grund:** Heute laufen dort der OCRexpert-GUI-Container und das qnapbackup-Web-UI — gleiche Erreichbarkeit, gleiche Backup-Strategie. Tauri-Wrapper kann in einer späteren Phase nachgezogen werden, ist aber nicht V1.

### ADR-003 — Cockpit-Layout mit drei Hierarchie-Ebenen
- **Top-Leiste (immer sichtbar):** Gesamt-Health-Score + drei Gruppen-Indikatoren (KI / Infra / Compl+Test) + Alert-Counter.
- **Startseite:** 8 Karten mit Hero-Gauge + 2–3 sekundären Mini-Indikatoren je System.
- **Drilldown:** Tiefe 2 (Sub-Bereiche eines Systems), Tiefe 3 (Detail-Entity), Tiefe 4 (Historie/Live-Stream). Breadcrumb + Back-Button durchgängig, URLs deep-linkable.

### ADR-004 — Tooltips sind Pflicht
Jeder Button, jede Zahl, jedes Status-Symbol bekommt einen Mouse-Hover-Tooltip (Desktop) bzw. Long-Press-Tooltip (Mobile). Format: kurze Erklärung + Datenquelle (Endpoint) + Aktualisierungszeit + Schwellwert-Legende. Tooltips sind nicht optional, sondern Code-Review-Kriterium.

### ADR-005 — Mobile-First-Layout
Die Cockpit-Cards stacken auf Mobile vertikal, Top-Leiste schrumpft auf `MOAG · <Score>%` + Burger. Drilldown bleibt funktional. Keine native App in V1 — responsive Web reicht.

### ADR-006 — qnapbackup: Hybrid aus eigener Card + iframe
MOAG bekommt eine eigene Card mit Hero-Gauge (aus neuem qnapbackup-Status-Endpoint, CR offen). Voll-Ansicht öffnet das vorhandene qnapbackup-Web-UI per iframe oder neuem Tab — kein HTML-Nachbau.

### ADR-007 — Panopticor: Daten-Endpoint, kein iframe
Panopticor ist PySide6/Qt — kein HTML-Spiegel sinnvoll. Stattdessen FastAPI-Headless-Modus parallel zur Desktop-App, der Status + Runs + Scenarios als JSON exponiert. MOAG rendert die Detail-Ansicht selbst im einheitlichen Cockpit-Stil. Action-Buttons (Scenario triggern) gehen direkt an die Panopticor-API.

### ADR-008 — Eine konsistente `/api/status`-Konvention für angeschlossene Apps
Jedes von MOAG konsumierte System soll mittelfristig einen `/api/v1/status` (oder kompatiblen) Endpoint anbieten mit mindestens: `ok: bool`, `score: 0..100`, `summary: str`, `metrics: dict`. MOAG-Cards rendern direkt aus diesem Vertrag. Implementierungs-Drift zwischen Systemen wird so reduziert.

## 5. Modulübersicht (geplant)

```
C:\code\moag\
├── backend/                     # FastAPI-App (Python 3.12)
│   ├── moag/
│   │   ├── api.py               # App-Factory, Router-Registrierung
│   │   ├── adapters/            # je Sub-System ein Adapter
│   │   │   ├── oberon.py
│   │   │   ├── octoboss.py
│   │   │   ├── sonofseti.py
│   │   │   ├── ocrexpert.py
│   │   │   ├── nasdominator.py
│   │   │   ├── qnapbackup.py
│   │   │   ├── custos.py
│   │   │   └── panopticor.py
│   │   ├── aggregator.py        # Top-Leiste-Health-Score-Berechnung
│   │   ├── events.py            # WebSocket-EventBus
│   │   ├── settings_store.py    # JSON-Settings mit Listener
│   │   ├── pipeline_hooks.py    # Logging-Hooks (PIPELINE_LOG_ENABLED)
│   │   └── debug_logger.py      # Panopticor-Bridge (BuildConfig-Flag)
│   ├── tests/                   # pytest (Ziel: ≥80% Coverage)
│   └── requirements.txt
├── frontend/                    # React + TypeScript + Vite
│   ├── src/
│   │   ├── App.tsx              # Router + Layout
│   │   ├── components/
│   │   │   ├── TopBar.tsx       # Gesamt-Health + Gruppen + Alerts
│   │   │   ├── Tooltip.tsx      # zentrale Tooltip-Komponente (Pflicht)
│   │   │   ├── Gauge.tsx        # Cockpit-Gauge (Hero + Mini)
│   │   │   ├── PageBadge.tsx    # Build-Info-Marker (Sichtbarkeits-Pflicht)
│   │   │   └── Breadcrumb.tsx
│   │   ├── features/
│   │   │   ├── overview/        # 8-Karten-Cockpit
│   │   │   ├── oberon/          # Drilldown-Tiefen 2–4
│   │   │   ├── octoboss/
│   │   │   ├── sonofseti/
│   │   │   ├── ocrexpert/
│   │   │   ├── nasdominator/
│   │   │   ├── qnapbackup/      # eigener Gauge + iframe-Voll-Ansicht
│   │   │   ├── custos/
│   │   │   └── panopticor/
│   │   └── lib/
│   │       ├── api.ts
│   │       └── store.ts         # Zustand-State
│   └── package.json
├── docker/
│   └── Dockerfile               # Multi-Stage (Node → Python-Slim)
├── scripts/
│   └── build-state.ps1          # Sichtbarkeits-Skript (UI-Aenderungs-Pflicht)
├── PROJEKT_STATUS.md
├── MASSNAHMEN.md
├── ARCHITEKTUR.md  (diese Datei)
├── FEATURES.md
└── CLAUDE.md
```

## 6. Wichtige Datenflüsse

### 6.1 Top-Leiste-Aggregation
1. Backend startet 8 parallele Polling-Loops (je Adapter, Intervall 5–30s je nach System).
2. Jeder Adapter liefert `{ok, score, summary, metrics}` an den `aggregator`.
3. Aggregator berechnet Gruppen-Scores (gewichteter Mittelwert) und Gesamt-Score.
4. WebSocket pusht Updates an alle angeschlossenen Frontends.

### 6.2 Drilldown-Anfragen
- Frontend ruft `/api/<system>/...` auf, Backend leitet (mit Caching) an die jeweilige Sub-System-API weiter.
- ETag-Caching wie im OCRexpert-Prototyp (von Oberon-Cockpit-Proxy übernommen).

### 6.3 Action-Buttons (mutierende Calls)
- Mutierende Calls werden im Backend **typisiert + auditiert** weitergeleitet, niemals direkt aus dem Browser an Sub-Systeme.
- Confirm-Dialog im Frontend ist Pflicht (z.B. "Node WhiteStar wirklich neustarten?").

## 7. Discovery & Auth

- **Oberon:** UDP-Beacon Port 17901, Auth Bearer-Token (aus Settings).
- **OctoBoss:** V2-Beacon-Listener Port 17760, Auth Bearer-Token optional.
- **SonOfSETI:** keine Discovery, Adressen über OctoBoss-Heartbeat-Cache; Auth `X-SonOfSETI-Token`.
- **Andere:** statische URLs in Settings, kein Discovery in V1.

## 8. Cross-Projekt-Doku-Pflicht

MOAG wird in `C:\code\docs\projects.yaml` eingetragen. Capabilities-File `docs/capabilities/moag.yaml` wird gegen `_schema.yaml` validiert (Task #5). Drift-Check vor jedem Push.

## 9. Phasenplan

| Phase | Inhalt | Akzeptanzkriterium |
|---|---|---|
| **0** | Pflicht-Doku + GitHub-Repo + Cross-Projekt-Doku-Eintrag | Repo `underdog220/moag` existiert, `yaml-validate.py` grün |
| **1** | Hard-Fork OCRexpert-GUI nach moag, Rename, Container `moag:0.1.0` auf VDR live | Container läuft, alle 4 KI-Backbone-Cards rendern, Tests grün |
| **2** | Top-Health-Leiste + Gruppen-Score + Pflicht-Tooltip-Komponente + PageBadge | Top-Leiste sichtbar auf jeder Route, jeder Button hat Tooltip |
| **3** | NasDominator-Adapter + Card + Drilldown Tiefe 2 | Card zeigt Live-Daten, Drilldown listet Critical-Services |
| **4** | Custos-Adapter + Findings-Card + Drilldown | Card zeigt Top-3-offene-Findings, Drilldown listet alle Regeln |
| **5** | qnapbackup-CR (#3) umgesetzt → Adapter + Card + iframe-Voll-Ansicht | Card zeigt last_backup, iframe öffnet vorhandenes Web-UI |
| **6** | Panopticor-CR (#4) umgesetzt → Adapter + Card + Detail mit Action-Buttons | Card zeigt last_run, Scenario-Trigger funktioniert |
| **7** | Mobile-Optimierung + Long-Press-Tooltips + Touch-Targets | Lighthouse Mobile ≥ 90, alle Cards lesbar auf 360px |
| **8** | OCRexpert-GUI-Code deaktivieren (Container stoppen, Code-Branch archivieren) | OCRexpert hat keine `gui/`-Routen mehr, MOAG vollständig |

## 10. Pflichten aus globaler CLAUDE.md

- **Pipeline-Logging:** Alle Adapter loggen via `PipelineLog` mit `PIPELINE_LOG_ENABLED`-Flag.
- **Panopticor-Test:** Jedes Cutover-Skript (Container-Deploy) MUSS einmal in Panopticor laufen.
- **PageBadge:** Jede Top-Level-Seite trägt `pg:<route> · <commit-hash> · <build-ts>`.
- **Build-State-Skript:** `scripts/build-state.ps1` vor jedem "schau mal nach"-Statement aufrufen.
- **Sicherheit vs. Funktion:** LAN-only V1, Bind 0.0.0.0, Auth-Layer als TODO Phase 9+.
