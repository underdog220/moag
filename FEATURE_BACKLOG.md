# FEATURE_BACKLOG — MOAG

Geplante „später"-Features (R2A-Kategorie B): vorgemerkt, NICHT gebaut. Pro Eintrag:
Datum + ein Satz Kontext. Wird zu A gezogen, wenn Roman es freigibt.

## Datenschutzkonzept-Panel (Erweiterungen)

Kontext: Kern A = versioniertes, quellenbelegtes Datenschutzkonzept anzeigen
(CRs `moag/requests/open/2026-06-25-datenschutzkonzept-panel.md` +
`Oberon/requests/open/2026-06-25-moag-datenschutzkonzept-generator.md`).
Fundament (Schichtenmodell Fakten/Claims/Quellen/Probleme/Prosa) ist so gebaut, dass
diese B-Punkte ohne Refactoring andocken:

- **[2026-06-25] Versions-Diff-View** — side-by-side alt vs. neu (Feld-Diff auf dem
  strukturierten Modell, nicht Prosa-Re-Parsing). MOAG-Frontend.
- **[2026-06-25] Alert-Center- + Overview-Karten-Integration** — `problems[]` als
  `SystemStatus`-Adapter (`adapters/datenschutz.py`, ADR-008) in Übersicht + Alerts. MOAG.
- **[2026-06-25] PDF-Export + englische Fassung** — eine Version für die Anwalts-Übergabe
  rendern (Prosa-Layer neu rendern). MOAG/Oberon.
- **[2026-06-25] Periodische Quellen-Revalidierung** — Link-Rot-Check über `sources[]`,
  tote Quellen flaggen. Engine-seitig (Oberon) oder MOAG-Backend.
- **[2026-06-25] „Bei-Änderung"-Auto-Trigger** — Config-Change-Events lösen Neugenerierung
  aus (Kern A liefert nur Monats- + Manuell-Trigger). Engine-seitig (Oberon).
- **[2026-06-25] Scope-Erweiterung über Oberon hinaus** — OctoBoss-PII-Detect-Interna,
  rueckgrat-Export in den Bericht aufnehmen. Engine-seitig (Oberon), eigener Scope-Block.
