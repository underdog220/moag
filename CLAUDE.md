# CLAUDE.md — MOAG (Projekt-spezifisch)

Ergänzt die globale `C:\Users\roman\.claude\CLAUDE.md`. Bei Konflikt gilt die globale Regel.

## Was MOAG ist (Ein-Satz)

Zentrales Browser-Cockpit auf VDR, das Oberon + OctoBoss + SonOfSETI + OCRexpert + NasDominator + qnapbackup + Custos + Panopticor in einer Drilldown-Oberfläche bündelt.

## Erste Schritte in einer neuen Session

1. **Lies zuerst** `PROJEKT_STATUS.md` + `MASSNAHMEN.md` (aktueller Stand) und `ARCHITEKTUR.md` §9 (Phasenplan).
2. **Dann** `FEATURES.md` für den Feature-Stand.
3. Schaue in `C:\code\docs\lessons-learned.md` vor jedem Cross-Projekt-Eingriff.

## Code-Pflichten (zusätzlich zur globalen CLAUDE.md)

### Tooltip-Pflicht (ADR-004)
Jeder Button, jede Zahl, jedes Status-Symbol braucht `<Tooltip>` mit:
- Erklärung (Klartext, deutsch)
- Datenquelle (Endpoint-Pfad)
- Aktualisierungszeit (relativ, z.B. "vor 3s")
- Schwellwert-Legende (für Gauges)

Code-Review-Blocker, wenn fehlend.

### Adapter-Konvention (ADR-008)
Jeder Sub-System-Adapter (`backend/moag/adapters/<system>.py`) muss eine `get_status()`-Methode mit Rückgabe:
```python
class SystemStatus(BaseModel):
    ok: bool
    score: int           # 0..100
    summary: str         # 1 Satz, deutsch
    metrics: dict        # für Mini-Indikatoren
    fetched_at: datetime
    error: str | None    # bei ok=False
```
Dieses Schema wird in `sebald-schemas` gespiegelt, sobald die erste Phase steht.

### PageBadge-Pflicht (globale Regel)
Jede Top-Level-Seite trägt unten rechts `pg:<route> · <commit-hash> · <build-ts>`. Komponente `<PageBadge id="...">` liegt unter `frontend/src/components/PageBadge.tsx`.

### Build-State-Skript
Vor jedem "schau mal nach"-Statement: `pwsh scripts/build-state.ps1` aufrufen. Verdikt in die Antwort kopieren.

### Pipeline-Logging
Jeder Adapter loggt via `PipelineLog`. ENV: `MOAG_PIPELINE_LOG_ENABLED=true`. Logs müssen per Knopfdruck im UI in die Zwischenablage kopierbar sein (Pflicht aus globaler CLAUDE.md).

## Sub-System-Hinweise

### Oberon
- **Eigentum: andere Session.** Direkte Code-Änderungen an Oberon sind verboten (siehe globale CLAUDE.md, Abschnitt „Oberon-Änderungen NUR über Change-Requests").
- Cockpit-Endpoints: `/api/v2/admin/cockpit/{providers,calls,cost,audit,smoke}` mit ETag-Caching.
- Auth: Bearer-Token aus Settings; Fallback X-DevLoop-Token.

### OctoBoss
- Endpoint-Auswahl ist groß — für MOAG-V1 reichen `/health`, `/seti/nodes`, `/seti/overview`, `/admin/cluster/status`, `/ocr/status`, `/jobs`.
- Multi-Hub-Polling-Pattern aus OCRexpert-Prototyp übernehmen (`hub_client.py`).

### SonOfSETI
- **Achtung Drift:** Neuer modularer Client (`C:\code\SonOfSETI`, Port 7878, REST) vs. alter monolithischer Agent (`C:\code\OctoBoss\src\son_of_seti\`, Port 8766, WebSocket). MOAG spricht primär den **neuen** Client, alte Nodes über OctoBoss-Hub abstrahieren.
- Auth: `X-SonOfSETI-Token` Header.

### OCRexpert
- Eltern-Repo des GUI-Codes. Bis Phase 8 läuft dort der Alt-Container parallel — kein Daten-Konflikt, beide Container haben eigene SQLite.
- MOAG ruft OCRexpert-Pipeline künftig **nur über HTTP** an (nicht mehr als In-Process-Import wie im Prototyp).

### NasDominator
- FastAPI Port 9090 auf QNAP.
- Critical-Services-Layer ist die Kern-Datenquelle für die Card.

### qnapbackup
- CR offen (Task #3) — solange kein Status-Endpoint da ist, zeigt die Card "kein Status verfügbar" und bietet nur den iframe-Button.

### Custos
- FastAPI Port 17890 (kollidiert mit DevLoop! In Settings prüfen, ggf. Custos-Port verschieben — Cross-Repo-Klärung).

### Panopticor
- CR offen (Task #4) — solange kein Status-Endpoint da ist, zeigt die Card "kein Status verfügbar".
- Doppelrolle: MOAG-Cutover-Skripte selbst werden **in Panopticor** getestet (Sandbox-Pflicht). MOAG zeigt also Panopticor-Status und wird gleichzeitig durch Panopticor verifiziert.

## Was MOAG NICHT tut (V1)

- Kein Login, kein Multi-User (LAN-only V1, ADR-006 vergleichbar zu OCRexpert-GUI).
- Keine Daten-Mutation an Sub-Systemen ohne Confirm-Dialog im Frontend.
- Kein eigener LLM-Aufruf (alles über Oberon-Gateway).
- Keine native App (Tauri-Wrapper ist Phase 9+, nicht V1).
- Keine i18n (deutsch only).

## Git

- Repo: `underdog220/moag` (muss in Phase 0 erstellt werden)
- Branch-Konvention: `feature/<phase>-<thema>`, z.B. `feature/1-hard-fork`
- Commits: `feat:`, `fix:`, `refactor:`, `docs:` (siehe global)
- Push erst nach Roman-Freigabe (siehe global)
