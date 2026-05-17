# MOAG — Deployment auf VDR

## Wo läuft MOAG?

Docker-Container auf VDR (192.168.200.71), Port 17900.
Erreichbar im LAN: `http://192.168.200.71:17900/`

---

## env-file-Pattern — Warum?

**Problem mit `docker run -e TOKEN=...`:**
- Token und Passwort sind via `docker inspect moag` für jeden mit Docker-Zugriff lesbar.
- Sie landen in der Shell-History.

**Lösung:** env-Datei auf VDR unter `/etc/moag.env` (chmod 600, root-Eigentümer).
Container startet mit `docker run --env-file /etc/moag.env` — kein einziger Sensitive-Wert
geht durch Shell oder `docker inspect`.

---

## Erster Deploy / Token-Rotation

### Schritt 1: `secrets.local.env` anlegen (lokal, gitignored)

```
# secrets.local.env — NICHT committen, liegt in .gitignore
MOAG_OBERON_TOKEN=mein-sicheres-token
MOAG_NASDOMINATOR_PASSWORD=mein-passwort
```

Alles andere hat Defaults im Deploy-Skript. Vollständige Schlüsselliste siehe `.env.example`.

### Schritt 2: Deploy-Skript ausführen

```powershell
pwsh -File scripts/deploy-vdr.ps1
```

Das Skript:
1. Liest Secrets aus `secrets.local.env`
2. Baut `/etc/moag.env` lokal (temporäre Datei)
3. Überträgt sie per scp nach VDR: `/tmp/moag-deploy.env`
4. Installiert auf VDR: `sudo mv ... /etc/moag.env && sudo chmod 600 /etc/moag.env`
5. Stoppt + entfernt alten Container
6. Startet neuen Container mit `--env-file /etc/moag.env`
7. Führt Smoke-Check gegen `/api/health` aus

### Schritt 3: Smoke-Check (vollständig)

```powershell
pwsh -File scripts/smoke-vdr.ps1
```

5 Read-only-Prüfungen: api-health, overview-schema, aggregator-konsistenz, frontend-html, frontend-assets.

---

## Parameter-Varianten

```powershell
# Tokens als Parameter (ohne secrets.local.env):
pwsh -File scripts/deploy-vdr.ps1 `
  -OberonToken "mein-token" `
  -NasDomPassword "mein-pw"

# Nur Smoke-Check ohne Re-Deploy:
pwsh -File scripts/deploy-vdr.ps1 -SmokeOnly

# Anderer Image-Tag:
pwsh -File scripts/deploy-vdr.ps1 -ImageTag "moag:0.2.0"
```

---

## Token-Rotation

1. Neues Token in `secrets.local.env` eintragen.
2. `pwsh -File scripts/deploy-vdr.ps1` ausführen.
3. Das Skript tauscht `/etc/moag.env` auf VDR aus und startet den Container neu.

Kein manuelles SSH + `docker run` nötig.

---

## Manueller `docker run`-Befehl (Referenz)

Falls das Skript nicht verfügbar ist — Achtung: Token in Shell-History:

```bash
# Auf VDR (ssh vdr):
docker run -d --name moag --restart unless-stopped \
  -p 17900:17900 \
  --env-file /etc/moag.env \
  moag:0.1.0
```

---

## Logs + Diagnose

```bash
# Logs live:
ssh vdr "docker logs -f moag"

# Letzten 50 Zeilen:
ssh vdr "docker logs --tail 50 moag"

# Container-Status:
ssh vdr "docker ps --filter name=moag"

# Env-Datei prüfen (nur root auf VDR):
ssh vdr "sudo cat /etc/moag.env"
```

---

## Sicherheitshinweise

- `/etc/moag.env` ist `chmod 600`, Eigentümer `root` — kein normaler Docker-User kann sie lesen.
- Die Datei liegt **nicht** im Repo (`.gitignore` erfasst `secrets.local.env`, `*.secrets.env`).
- `docker inspect moag` zeigt nur `--env-file`-Pfad, nicht die enthaltenen Werte.
- Token-Rotation kostet ~30 Sekunden Container-Downtime (Stop → Neu-Start).
- Auth-Layer (Bearer-Token für MOAG selbst) ist V1-TODO (Phase 9+, ADR-006).
