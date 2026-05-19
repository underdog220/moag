# MOAG -- Deployment auf VDR

## Wo laeuft MOAG?

Docker-Container auf VDR (192.168.200.71), Port 17900.
Erreichbar im LAN: `http://192.168.200.71:17900/`

---

## Versions-Source-of-Truth

**`backend/pyproject.toml`** ist einziger Versions-Master.
Das Deploy-Skript liest die Version automatisch aus dieser Datei.
`PROJEKT_STATUS.md` und `docs/capabilities/moag.yaml` sind nur Doku -- sie
werden NICHT vom Skript gelesen.

Aktuelle Version: **0.2.2**

---

## Standard-Deploy (empfohlen)

Ein einziger Aufruf baut das Image lokal, uebertraegt es auf VDR und deployt:

```powershell
pwsh -File scripts/deploy-vdr.ps1
```

Das Skript fuehrt folgende Schritte aus:

1. **Version lesen** aus `backend/pyproject.toml` -> `ImageTag = moag:<version>`
2. **Build** `docker build -t moag:<version> -f docker/Dockerfile .`
   (Build-Fehler = harter Abbruch, kein Transfer, kein Deploy)
3. **Transfer** per Stream-Pipe: `docker save | ssh vdr "docker load"` --
   idempotent: wenn das Image auf VDR schon existiert, wird Transfer uebersprungen.
   Fallback: Tarball via `scp` + `docker load`, falls Stream-Pipe fehlschlaegt.
4. **Secrets laden** aus `secrets.local.env` (gitignored)
5. **env-Datei** lokal zusammenbauen + per scp nach `/etc/moag.env` uebertragen
   (chmod 600, root-Eigentuemer -- kein Wert taucht in `docker inspect` auf)
6. **Volume vorbereiten** (`mkdir -p` + `chmod` auf VDR)
7. **Container stoppen + neu starten** mit `--env-file`, `--user`, `-v`
8. **Smoke-Check** gegen `/api/health`

---

## Secrets vorbereiten

### Schritt 1: `secrets.local.env` anlegen (lokal, gitignored)

```
# secrets.local.env -- NICHT committen, liegt in .gitignore
MOAG_OBERON_TOKEN=mein-sicheres-token
MOAG_NASDOMINATOR_PASSWORD=mein-passwort
```

Alles andere hat Defaults im Deploy-Skript. Vollstaendige Schluessel-Liste
siehe `.env.example`.

---

## Parameter-Varianten

```powershell
# Tokens als Parameter (ohne secrets.local.env):
pwsh -File scripts/deploy-vdr.ps1 `
  -OberonToken "mein-token" `
  -NasDomPassword "mein-pw"

# Build ueberspringen (Image lokal schon gebaut):
pwsh -File scripts/deploy-vdr.ps1 -SkipBuild

# Build + Transfer ueberspringen (Image auf VDR schon vorhanden, nur Container neu starten):
pwsh -File scripts/deploy-vdr.ps1 -SkipBuild -SkipTransfer

# Nur bauen, kein Transfer, kein Deploy (CI-aehnlicher Pruef-Lauf):
pwsh -File scripts/deploy-vdr.ps1 -BuildOnly

# Nur Smoke-Check, kein Re-Deploy:
pwsh -File scripts/deploy-vdr.ps1 -SmokeOnly

# Anderen Image-Tag verwenden (ueberschreibt pyproject.toml-Version):
pwsh -File scripts/deploy-vdr.ps1 -ImageTag "moag:custom-branch"
```

---

## Wann welchen Flag?

| Szenario | Empfohlener Aufruf |
|---|---|
| Normaler Release (Code geaendert, neues Image noetig) | Standard ohne Flags |
| Image schon lokal gebaut (2. Versuch nach Fehler) | `-SkipBuild` |
| Image schon auf VDR (nur Secrets-Rotation, kein Code-Change) | `-SkipBuild -SkipTransfer` |
| Nur pruefen ob Container und API laufen | `-SmokeOnly` |
| Nur Build-Pruefung (CI-Loop, kein VDR-Zugriff) | `-BuildOnly` |

---

## Smoke-Check (vollstaendig)

```powershell
pwsh -File scripts/smoke-vdr.ps1
```

5 Read-only-Pruefungen: api-health, overview-schema, aggregator-konsistenz,
frontend-html, frontend-assets.

---

## Token-Rotation

1. Neues Token in `secrets.local.env` eintragen.
2. `pwsh -File scripts/deploy-vdr.ps1 -SkipBuild -SkipTransfer` ausfuehren
   (Image ist unveraendert, nur env-File muss getauscht werden).
3. Skript tauscht `/etc/moag.env` und startet Container neu (~30s Downtime).

---

## Logs + Diagnose

```bash
# Logs live:
ssh vdr "docker logs -f moag"

# Letzten 50 Zeilen:
ssh vdr "docker logs --tail 50 moag"

# Container-Status:
ssh vdr "docker ps --filter name=moag"

# Env-Datei pruefen (nur root auf VDR):
ssh vdr "sudo cat /etc/moag.env"
```

---

## Manueller `docker run`-Befehl (Referenz)

Falls das Skript nicht verfuegbar ist -- Achtung: Secrets muessen vorher
manuell nach `/etc/moag.env` uebertragen werden:

```bash
# Auf VDR (ssh vdr):
docker run -d --name moag --restart unless-stopped \
  -p 17900:17900 \
  --user 1002:1002 \
  -v /home/underdog/moag-data:/data/moag \
  --env-file /etc/moag.env \
  moag:0.2.2
```

---

## Sicherheitshinweise

- `/etc/moag.env` ist `chmod 600`, Eigentuemer `root` -- kein normaler
  Docker-User kann sie lesen.
- Die Datei liegt **nicht** im Repo (`.gitignore` erfasst `secrets.local.env`,
  `*.secrets.env`).
- `docker inspect moag` zeigt nur `--env-file`-Pfad, nicht die enthaltenen Werte.
- Token-Rotation kostet ~30 Sekunden Container-Downtime (Stop -> Neu-Start).
- Auth-Layer (Bearer-Token fuer MOAG selbst) ist V1-TODO (Phase 9+, ADR-006).

---

## Warnung: Alter Hot-Patch-Workflow (deprecated)

Vor Phase Y/H wurden Code-Aenderungen per `docker cp` in den laufenden
Container kopiert:

```bash
# ALT -- NICHT MEHR VERWENDEN
docker cp datei.py moag:/app/moag/datei.py
ssh vdr "docker restart moag"
```

**Probleme dieses Ansatzes:**
- Funktioniert nur fuer `.py`-Edits -- Frontend-Build-Aenderungen, neue
  Module, neue Routen-Dateien werden NICHT wirksam.
- Container-Stand weicht vom Image ab -- kein Diff moeglich.
- Nach Container-Neustart (Crash, Reboot) ist der Hot-Patch verloren.
- Ursache dafuer dass VDR bis 2026-05-19 noch auf v0.1.0 lief obwohl
  das Repo schon bei v0.2.2 war.

**Ab v0.2.2 gilt ausschliesslich der vollstaendige Build+Transfer+Deploy-Pfad.**
