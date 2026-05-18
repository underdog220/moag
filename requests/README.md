# MOAG — Change-Requests

Dieses Verzeichnis enthaelt alle Change-Requests (CRs) fuer das MOAG-Projekt
(Mother of All GUIs).

Das **zentrale CR-Schema** (Format, Lifecycle, Validator, Vorlage) liegt in der
Sebald-Suite-Doku:

> `C:\code\sebald-suite\docs\cr-schema\README.md`

Neuen CR anlegen: `TEMPLATE.md` in `open/<YYYY-MM-DD-<kurz-slug>.md>` kopieren,
Frontmatter ausfuellen, validieren:

```powershell
python C:\code\sebald-suite\docs\cr-schema\scripts\validate-crs.py `
       C:\code\MOAG\requests\open\<dateiname>.md
```

## Verzeichnis-Struktur

| Verzeichnis | Inhalt |
|---|---|
| `open/` | Offene CRs (status: open oder in-progress) |
| `done/` | Umgesetzte CRs (status: done, Commit-Hash eingetragen) |
| `rejected/` | Verworfene CRs (status: rejected, Begruendung eingetragen) |
