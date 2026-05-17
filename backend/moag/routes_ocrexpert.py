"""
OCRexpert-spezifische API-Routen fuer MOAG.

Prefix: /api/v1/ocrexpert
Ziel-Service: OCRexpert auf VDR:17810 (konfigurierbar via Settings)

Endpoints:
  GET  /capabilities    → wrappt GET {OCREXPERT_BASE_URL}/api/v1/health
                           (Engines + LibreOffice + Shadow-Status)
  GET  /logs            → GET {OCREXPERT_BASE_URL}/logs (Plain-Text Pipeline-Logs)
  GET  /openapi-summary → Proxy auf GET {OCREXPERT_BASE_URL}/openapi.json
                           mit Reduktion auf Endpoint-Liste (Self-Service-Doku)
  POST /process         → Direkter Proxy auf POST {OCREXPERT_BASE_URL}/api/v1/process
                           Body: {"pfad": "<Linux-Pfad>"}, Timeout 60s
"""
from __future__ import annotations

import logging
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel

from .settings_store import SettingsStore

logger = logging.getLogger("moag.routes_ocrexpert")

_DEFAULT_BASE = "http://192.168.200.71:17810"
_DEFAULT_PFAD = "/mnt/qnap_public/Dokumente/test.pdf"


class _OcrProcessRequest(BaseModel):
    """Request-Body fuer POST /api/v1/ocrexpert/process."""
    pfad: str = _DEFAULT_PFAD


def build_ocrexpert_router(settings_store: SettingsStore) -> APIRouter:
    """Baut den OCRexpert-Router und gibt ihn zurueck."""
    router = APIRouter(prefix="/api/v1/ocrexpert", tags=["ocrexpert"])

    def _base_url() -> str:
        try:
            return settings_store.get().ocrexpert_base_url.rstrip("/")
        except Exception:
            return _DEFAULT_BASE

    # ── GET /capabilities ────────────────────────────────────────────────────

    @router.get("/capabilities")
    async def get_capabilities() -> dict[str, Any]:
        """Ruft OCRexpert /api/v1/health ab und liefert Capability-Snapshot.

        Felder:
          status, version, engines_local, engines_octoboss,
          octoboss_reachable, libreoffice_available, shadow_writable,
          fetched_at
        """
        base = _base_url()
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.get(f"{base}/api/v1/health")
        except httpx.TimeoutException as exc:
            logger.warning("OCRexpert /capabilities: Timeout: %s", exc)
            raise HTTPException(status_code=504, detail="OCRexpert nicht erreichbar (Timeout).")
        except (httpx.ConnectError, httpx.HTTPError) as exc:
            logger.warning("OCRexpert /capabilities: Verbindungsfehler: %s", exc)
            raise HTTPException(status_code=502, detail=f"OCRexpert nicht erreichbar: {exc}")

        if not resp.is_success:
            raise HTTPException(
                status_code=502,
                detail=f"OCRexpert /api/v1/health antwortete HTTP {resp.status_code}",
            )

        data = resp.json()
        return {
            "status":               data.get("status", "unknown"),
            "version":              data.get("version", "?"),
            "engines_local":        data.get("engines_local") or [],
            "engines_octoboss":     data.get("engines_octoboss") or [],
            "octoboss_reachable":   bool(data.get("octoboss_reachable")),
            "libreoffice_available": bool(data.get("libreoffice_available")),
            "shadow_writable":      bool(data.get("shadow_writable")),
            "source_url":           f"{base}/api/v1/health",
        }

    # ── GET /logs ────────────────────────────────────────────────────────────

    @router.get("/logs", response_class=PlainTextResponse)
    async def get_logs(n: int = Query(default=100, ge=1, le=1000)) -> str:
        """Liefert die letzten n Zeilen der OCRexpert-Pipeline-Logs.

        Ruft GET {OCREXPERT_BASE_URL}/logs auf und gibt Plain-Text zurueck.
        Query-Parameter n wird als Anzahl-Wunsch weitergegeben (wenn der
        Service ihn unterstuetzt). Eigenes Tail-Limiting falls der Service
        den Param ignoriert.
        """
        base = _base_url()
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(f"{base}/logs", params={"n": n})
        except httpx.TimeoutException as exc:
            logger.warning("OCRexpert /logs: Timeout: %s", exc)
            raise HTTPException(status_code=504, detail="OCRexpert nicht erreichbar (Timeout).")
        except (httpx.ConnectError, httpx.HTTPError) as exc:
            logger.warning("OCRexpert /logs: Verbindungsfehler: %s", exc)
            raise HTTPException(status_code=502, detail=f"OCRexpert nicht erreichbar: {exc}")

        if not resp.is_success:
            raise HTTPException(
                status_code=502,
                detail=f"OCRexpert /logs antwortete HTTP {resp.status_code}",
            )

        # Eigenes Tail-Limiting: letzte n Zeilen falls Service den Param ignoriert
        text = resp.text
        lines = text.splitlines()
        if len(lines) > n:
            lines = lines[-n:]
        return "\n".join(lines)

    # ── GET /openapi-summary ──────────────────────────────────────────────────

    @router.get("/openapi-summary")
    async def get_openapi_summary() -> dict[str, Any]:
        """Proxy auf OCRexpert openapi.json — reduziert auf Endpoint-Liste.

        Nuetzlich fuer Self-Service-Doku in MOAG (zeigt welche Endpoints
        der OCRexpert-Service kennt).

        Liefert:
          title, version, endpoints: [{path, method, summary, tags}]
        """
        base = _base_url()
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(f"{base}/openapi.json")
        except httpx.TimeoutException as exc:
            logger.warning("OCRexpert /openapi-summary: Timeout: %s", exc)
            raise HTTPException(status_code=504, detail="OCRexpert nicht erreichbar (Timeout).")
        except (httpx.ConnectError, httpx.HTTPError) as exc:
            logger.warning("OCRexpert /openapi-summary: Verbindungsfehler: %s", exc)
            raise HTTPException(status_code=502, detail=f"OCRexpert nicht erreichbar: {exc}")

        if not resp.is_success:
            raise HTTPException(
                status_code=502,
                detail=f"OCRexpert /openapi.json antwortete HTTP {resp.status_code}",
            )

        spec = resp.json()
        info = spec.get("info", {})
        paths = spec.get("paths", {})

        endpoints: list[dict[str, Any]] = []
        for path, path_item in paths.items():
            for method, op in path_item.items():
                if method.upper() not in {"GET", "POST", "PUT", "DELETE", "PATCH"}:
                    continue
                endpoints.append({
                    "path":    path,
                    "method":  method.upper(),
                    "summary": op.get("summary", ""),
                    "tags":    op.get("tags", []),
                })

        return {
            "title":     info.get("title", "OCRexpert"),
            "version":   info.get("version", "?"),
            "endpoints": endpoints,
            "source_url": f"{base}/openapi.json",
        }

    # ── POST /process ─────────────────────────────────────────────────────────

    @router.post("/process")
    async def post_process(req: _OcrProcessRequest) -> dict[str, Any]:
        """Direkter Proxy auf OCRexpert POST /api/v1/process.

        Nimmt einen Linux-Pfad entgegen (im OCRexpert-Container sichtbar
        via CIFS-Mount) und liefert die vollstaendige OCR-Antwort als JSON.

        Body: {"pfad": "/mnt/qnap_public/Dokumente/..."}
        Response-Felder (je nach OCRexpert-Version):
          text, words, doctype, pii, duration_ms, pfad

        Timeout: 60s (OCR-Lauf auf grossen Dokumenten kann Zeit brauchen).
        """
        base = _base_url()
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(
                    f"{base}/api/v1/process",
                    json={"pfad": req.pfad},
                )
        except httpx.TimeoutException as exc:
            logger.warning("OCRexpert /process: Timeout: %s", exc)
            raise HTTPException(
                status_code=504,
                detail="OCRexpert nicht erreichbar (Timeout nach 60s).",
            )
        except (httpx.ConnectError, httpx.HTTPError) as exc:
            logger.warning("OCRexpert /process: Verbindungsfehler: %s", exc)
            raise HTTPException(
                status_code=502,
                detail=f"OCRexpert nicht erreichbar: {exc}",
            )

        if not resp.is_success:
            raise HTTPException(
                status_code=502,
                detail=f"OCRexpert /api/v1/process antwortete HTTP {resp.status_code}: {resp.text[:200]}",
            )

        try:
            data: dict[str, Any] = resp.json()
        except Exception:
            data = {"raw_response": resp.text[:500]}

        # Zeichenanzahl berechnen und hinzufuegen (fuer Frontend-Anzeige)
        text_content = data.get("text") or data.get("recognized_text") or data.get("content") or ""
        n_chars = len(text_content) if isinstance(text_content, str) else 0

        return {
            "pfad":     req.pfad,
            "n_chars":  n_chars,
            "source_url": f"{base}/api/v1/process",
            **data,
        }

    return router
