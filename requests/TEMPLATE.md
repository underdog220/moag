---
id: 2026-05-18-beispiel-cr
datum: 2026-05-18
prioritaet: P3
status: open
repo: OctoBoss
kontakt: Roman
betroffene_repos: [OctoBoss, SonOfSETI]
blockiert_durch: []
labels: []
---

<!--
Frontmatter-Hinweise (Pflicht-Felder + Optional, siehe docs/cr-schema/cr-schema.json):

  Pflicht:
    id             YYYY-MM-DD-<kurz-slug>, muss Dateinamen entsprechen
    datum          ISO-8601 (YYYY-MM-DD)
    prioritaet     P1 | P2 | P3 | P4   (NICHT 'prio')
    status         open | in-progress | blocked | done | rejected
    repo           Heimat-Repo (Verzeichnis-Name unter C:\code)
    kontakt        Ersteller / Verantwortlicher

  Optional, aber empfohlen:
    betroffene_repos   array<string>      Pflicht bei Cross-Repo-CRs
    blockiert_durch    array<string>      Liste CR-IDs
    blockiert          array<string>      Liste CR-IDs
    ziel-version       string             z.B. rc5.10, v1.5.0
    labels             array<string>      z.B. panopticor-pretest-pflicht, cutover, doku

Validator: python docs/cr-schema/scripts/validate-crs.py <dieser-pfad>
-->

# <Kurzer aussagekraeftiger Titel>

## Kontext / Problem

<!--
Was laeuft heute? Was klappt nicht, was fehlt?
Konkret mit Datei:Zeile-Beleg wenn moeglich.
Beispiel:
- `src/sonofseti_core/modules/spawn.py:82` - `interpreter = python_exe or sys.executable`:
  wenn `module_python_exe` nicht gesetzt ist, landet jeder Spawn-Aufruf in der PyInstaller-Trap.
-->

## Gewuenschtes Verhalten

<!--
Soll-Zustand nach Umsetzung. Endpoint, Config-Feld, Verhalten, Response-Schema.
Was muss sich aendern und wie?
-->

## Akzeptanz-Probe

<!--
PFLICHTFELD (Retro-Pflichtfeld 1/4).

Konkrete, automatisierbare Probe die GREEN sein muss bevor der CR auf `done`
gesetzt wird. Kein "es sieht gut aus" - ein reproduzierbarer Befehl mit
erwartetem Output.

Beispiele:
- `curl -s http://localhost:7878/modules/hw-monitor/invoke -d '{"action":"echo","payload":"test"}' | jq '.result'`
  -> `"test"` (200, kein 503/port=null)
- `python -m pytest tests/test_spawn.py::test_python_exe_default -x` -> gruen
- `unzip -p host-control.zip module.json | jq '.entrypoint'` -> `"hw_control.main:run"` (kein null)

Wenn keine automatisierbare Probe moeglich: begruenden warum + alternativen
Nachweis benennen.
-->

## Out-of-Scope

<!--
Was wird in diesem CR bewusst NICHT adressiert?
Verhindert Scope-Creep bei der Implementierung.

Beispiel:
- Plugin-venv-Isolation ist nicht Teil dieses CR (eigene Welle)
- Auth/TLS auf dem invoke-Endpoint ist TODO in Phase X
-->

## Verwandte CRs / Memories

<!--
PFLICHTFELD (Retro-Pflichtfeld 2/4).

Vor Implementierung: alle `requests/open/` + `requests/done/` der letzten
14 Tage nach gleichem Symptom durchsuchen (grep nach Schluesselbegriffen
aus dem Titel). Auch relevante Memory-Files nennen.

Zweck: verhindert, dass eine bereits diagnostizierte Wurzel nochmal als
neue Diagnose-Welle entdeckt wird (Retrospektive-Lehre 2026-05-18).

Beispiele:
- Verwandt: `C:\code\SonOfSETI\requests\done\2026-05-17-plugin-bundle-entry-vs-entrypoint.md`
  (gleiches Symptom `entrypoint` fehlend)
- Memory: `reference_plugin_bundle_format_module_json.md` - Konvention dokumentiert
- Vorgaenger-Diagnose: `C:\code\SonOfSETI\requests\open\2026-05-15-s1l-node-logs-analyse.md`
  (Module stuck in `starting`)

Falls keine verwandten CRs / Memories: explizit `keine` schreiben (nicht leer lassen).
-->

## Sandbox-Beweis-Anforderung

<!--
PFLICHTFELD (Retro-Pflichtfeld 3/4).

Muss eine Sandbox-Reproduktion durch Panopticor erfolgen bevor Production-Rollout?

- `ja` - Panopticor-Pretest-Run mit Run-ID referenzieren nach Abschluss
- `nein, weil ...` - Begruendung angeben (z.B. "reine Doku-Aenderung", "nur
  Config-Feld, kein Laufzeitverhalten")

Ohne gruenen Panopticor-Pretest kein Production-Rollout (Pflicht laut
globalem CLAUDE.md / Cutover-Skripte / System-Touch).

Bei `ja`: Label `panopticor-pretest-pflicht` im Frontmatter setzen.
-->

## Sub-Agent-Pflichtlektuere

<!--
PFLICHTFELD (Retro-Pflichtfeld 4/4).

Liste der Files, die der implementierende Sub-Agent **vor Implementierungsstart**
gelesen haben muss. Der Sub-Agent bestaetigt Lektuere explizit im Bericht.

Pflicht-Minimum:
- `C:\code\<repo>\requests\README.md` (dieser Workflow)
- `C:\code\<repo>\PROJEKT_STATUS.md`
- Betroffene Source-Files (Datei:Zeile aus Kontext-Abschnitt)

Weitere je nach Aufgabe:
- Memory-Files mit `reference_*` wenn Konvention betroffen
- Vorbild-Implementierungen (aeltere analoge Fixes)
- Test-Files fuer den betroffenen Bereich
- Bei Cross-Repo-CR: README/PROJEKT_STATUS aller betroffenen Repos
-->

## Aufwand-Schaetzung

<!--
Grobe Einordnung: Stunden / Tage / Sprints. Hilft Master bei der Welle-Planung.
Optional weitere Felder wie "Komplexitaet niedrig/mittel/hoch", "Risiko low/medium/high".
-->

## Akzeptable Alternative

<!--
Falls das Ideal nicht machbar ist: was waere eine brauchbare Zwischenloesung?
(z.B. Config-Default statt Selfcheck-Pflichtfeld, manueller Workaround mit
TODO-Vermerk)
-->

## Auswirkung wenn nicht umgesetzt

<!--
Blockiert was? Workaround in Kraft? Welche Phase / welches Release ist blockiert?
Hilft bei Priorisierung und Eskalation.
-->
