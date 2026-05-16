# MOAG — Mother of All GUIs

Zentrales Browser-Cockpit auf VDR, das Oberon, OctoBoss, SonOfSETI, OCRexpert,
NasDominator, qnapbackup, Custos und Panopticor in einer Drilldown-Oberflaeche
buendelt. Loesung des OCRexpert-internen GUI-Prototyps (ocrexpert-gui:0.7.1)
als eigenstaendiges Projekt.

**Port:** 17900 | **Stack:** FastAPI + React/Vite | **Deployment:** Docker auf VDR

---

## Quick Start lokal

**Backend:**
```bash
cd backend
pip install -r requirements.txt
uvicorn moag.api:create_app --factory --reload --port 17900
```

**Frontend (separates Terminal):**
```bash
cd frontend
npm install
npm run dev
```

Frontend dev-server: http://localhost:5173
Backend API: http://localhost:17900/api

---

## Container bauen und lokal starten

```bash
# Image bauen (Kontext = Repo-Root)
docker build -t moag:0.1.0 -f docker/Dockerfile .

# Starten (mit .env-Datei)
docker run --rm -p 17900:17900 --env-file .env moag:0.1.0
```

Cockpit: http://localhost:17900

---

## Deployment auf VDR

Siehe `docs/DEPLOYMENT_VDR.md` (wird in Phase 1 angelegt).
VDR-Adresse: 192.168.200.71, Ziel-Port 17900.

---

## Architektur

Siehe [ARCHITEKTUR.md](ARCHITEKTUR.md).
8 Sub-Systeme in drei Gruppen (KI-Backbone / Infrastruktur / Compliance+Test),
Multi-Stage-Docker-Build, WebSocket-EventBus fuer Live-Updates.

---

## Status

Siehe [PROJEKT_STATUS.md](PROJEKT_STATUS.md).

---

## Beitragen

Code-Konventionen und Session-Regeln in [CLAUDE.md](CLAUDE.md)
(erhaelt globale Regeln aus `C:\Users\roman\.claude\CLAUDE.md`).
