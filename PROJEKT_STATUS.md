# PROJEKT_STATUS — MOAG (Mother of All GUIs)

## Aktueller Stand
Hygiene-Block (A+B): Token-Storage auf env-file-Pattern umgestellt (`scripts/deploy-vdr.ps1` + `/etc/moag.env chmod 600`), sonofseti-Adapter + Tests + Frontend-Feature gelöscht. 259/259 Backend + 355/355 Frontend-Tests grün.

## Version
v0.1.0 (Phase 1 komplett + Container live auf VDR)

## Nächste geplante Stufe
Phase 8: OCRexpert-GUI-Code deaktivieren (Container stoppen, Code-Branch archivieren). Danach: Lighthouse-Audit Mobile-Score messen.

## Offene Punkte
- OCRexpert-Service auf VDR:17810 offline — Service-Status klären
- ocrexpert.process-Aktion: Body-Schema-Drift gegen `/api/v1/process` (erwartet multipart/form-data mit file, nicht JSON `{pfad}`) — Aktion liefert HTTP 422. Folge-Cleanup: entweder Multipart-Upload bauen oder auf `/api/v1/shadow/process` mit `source_path`/`shadow_path` umbiegen.
- ocrexpert.shadow.batch ggf. analog: prüfen ob Body-Schema (war `{pfad}` aus altem Briefing) zu `{source_path, shadow_path}` umzustellen ist.
- qnapbackup: Status-Endpoint-CR einreichen (CR #3, Phase 5)
- Panopticor: Status+Actions-API-CR einreichen (CR #4, Phase 6)
- NasDominator: API-Reife für Health-Aggregation prüfen (Phase 3)
- Custos: Findings-Widget-Schema festlegen (Phase 4)

## Letzte Änderung
2026-05-17 — Hygiene-Block A+B: A) Token-Storage: `scripts/deploy-vdr.ps1` (neu) + `docs/DEPLOYMENT_VDR.md` (neu) + `.env.example`-Header + `.gitignore`-Ergänzung (`secrets.local.env`, `*.secrets.env`). Token-Storage-Eintrag aus Offene Punkte entfernt. B) sonofseti aufgeräumt: `adapters/sonofseti.py`, `tests/test_adapter_sonofseti.py`, `frontend/src/features/sonofseti/` gelöscht. FEATURES.md Deprecated-Eintrag aktualisiert. 259 Backend- + 355 Frontend-Tests grün.
