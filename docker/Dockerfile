# MOAG — Mother of All GUIs — Multi-Stage Build
#
# Stage 1 (builder): Node.js baut das React/Vite-Frontend
# Stage 2 (runtime): Python-Slim serviert Backend + eingebettetes Frontend
#
# Build (Version wird aus backend/pyproject.toml gelesen, deploy-vdr.ps1 erledigt das automatisch):
#   VERSION=$(grep '^version' backend/pyproject.toml | head -1 | grep -oP '"\K[^"]+')
#   docker build -t moag:$VERSION -f docker/Dockerfile .
#
# Empfohlen: einziger Aufruf via deploy-Skript (baut + transferiert + deployt):
#   pwsh -File scripts/deploy-vdr.ps1
#
# Manuell (LAN-Bind, Auth-Layer ist TODO Phase 9+):
#   docker run --rm -p 17900:17900 \
#       --env-file .env \
#       moag:$VERSION
#
# Health-Check: /api/health

# ============================================================
# Stage 1: Frontend-Build
# ============================================================
FROM node:20-slim AS builder

WORKDIR /build/frontend

# Abhaengigkeiten zuerst (besseres Layer-Caching)
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

# Build-Identitaet (#3): von deploy-vdr.ps1 als --build-arg gereicht. Vite liest
# VITE_-praefixierte ENV-Variablen zur Build-Zeit (frontend/src/lib/env.ts) und
# backt sie ins Bundle -> PageBadge zeigt echten Commit-Hash + Build-Timestamp.
# Default "dev"/leer => env.ts faellt auf "dev" bzw. Laufzeit-Timestamp zurueck.
ARG VITE_BUILD_HASH=dev
ARG VITE_BUILD_TS=
ENV VITE_BUILD_HASH=$VITE_BUILD_HASH \
    VITE_BUILD_TS=$VITE_BUILD_TS

# Quellcode kopieren und Produktions-Build ausloesen
COPY frontend/ ./
RUN npm run build

# vite.config.ts hat outDir = "../backend/moag/static" — Build landet also unter
# /build/backend/moag/static/ (Vite legt Parent-Verzeichnisse via emptyOutDir an).
# So funktioniert die lokale Dev-Loop ohne Extra-Copy, weil das Backend den Build
# direkt aus seinem eigenen moag/static/-Verzeichnis als SPA serviert.

# ============================================================
# Stage 2: Python-Runtime
# ============================================================
FROM python:3.12-slim

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# Nur das Noetigste — MOAG braucht kein Tesseract/LibreOffice
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python-Abhaengigkeiten (Layer-Cache: erst requirements, dann Code)
COPY backend/requirements.txt ./
RUN pip install --upgrade pip && pip install --no-cache-dir -r requirements.txt

# Backend-Anwendungscode
COPY backend/ ./

# moag selbst als Paket installieren (--no-deps weil requirements.txt schon lief).
# Ohne diesen Schritt liefert `importlib.metadata.version("moag")` 0.0.0-dev
# oder — schlimmer — die Version einer veralteten egg-info aus dem Build-Context
# (Bug 5, 2026-05-24). Mit pip install entsteht eine frische dist-info aus
# der aktuellen pyproject.toml.
RUN pip install --no-deps --no-cache-dir .

# Frontend-Bundle aus Stage 1 einkopieren
# Backend serviert statische Dateien aus moag/static/ als SPA
COPY --from=builder /build/backend/moag/static ./moag/static

# Non-root User (uid 1000)
RUN useradd -u 1000 -m moag && chown -R moag:moag /app
USER moag

ENV MOAG_HOST=0.0.0.0 \
    MOAG_PORT=17900 \
    MOAG_PIPELINE_LOG_ENABLED=true

EXPOSE 17900

# Health-Check gegen lokalen API-Endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -sf http://127.0.0.1:17900/api/health >/dev/null || exit 1

# uvicorn via App-Factory-Pattern (--factory laedt create_app())
CMD ["uvicorn", "moag.api:create_app", "--factory", "--host", "0.0.0.0", "--port", "17900"]
