"""Upload-Handler: llm.plan — Bauplan-Analyse via Oberon.

Akzeptierte MIMEs: PDF, PNG, JPG
Keine Pflicht-Params.

Oberon-Endpoint: POST {OBERON_BASE_URL}/api/v2/plan/analyze

Request-Schema (live verifiziert 2026-05-17):
  {"imageUrl": "data:<mime>;base64,<b64>", "prompt": "<optional>"}
  Oberon erwartet imageUrl als Data-URL oder HTTP-URL, KEIN file_base64-Feld.

Response-Schema (live verifiziert 2026-05-17):
  {
    "planType": "UNBEKANNT" | ...,
    "planTypBeschreibung": "...",
    "erkannteRaeume": [...],
    "rohdatenKi": "...",
    "hinweise": [...],
    "id": "..."
  }
  Felder wie wohnflaeche/nutzflaeche/bgf_m2 existieren nicht auf Top-Level.
  Flaechenwerte kommen als Objekte in erkannteRaeume[].flaeche.
"""
from __future__ import annotations

import base64
import logging
import os
import time
from datetime import datetime, timezone

import httpx

from moag.upload.handlers.registry import register_handler
from moag.upload.schemas import UploadResult

logger = logging.getLogger("moag.upload.handlers.llm_plan")

_SUMMARY_CHARS = 300


def _failed(upload_id: str, error: str, duration_ms: int = 0) -> UploadResult:
    return UploadResult(
        upload_id=upload_id,
        status="failed",
        operation="llm.plan",
        completed_at=datetime.now(timezone.utc),
        duration_ms=duration_ms,
        error=error,
    )


def _base_url() -> str:
    return os.environ.get("MOAG_OBERON_BASE_URL", "http://192.168.200.169:17900").rstrip("/")


def _auth_headers() -> dict[str, str]:
    token = os.environ.get("MOAG_OBERON_TOKEN", "")
    if token:
        return {"Authorization": f"Bearer {token}"}
    return {}


def _build_summary(data: dict) -> str:
    """Baut result_summary aus dem tatsaechlichen Oberon-Plan-Response-Schema.

    Oberon liefert:
      planType, planTypBeschreibung, erkannteRaeume[], hinweise[], rohdatenKi, id
    Flaechenwerte stehen in erkannteRaeume[].flaeche (falls vorhanden).
    """
    parts = []

    # Plantyp
    plan_typ = data.get("planTypBeschreibung") or data.get("planType")
    if plan_typ and plan_typ != "UNBEKANNT":
        parts.append(f"Plantyp: {plan_typ}")

    # Erkannte Raeume und ihre Flaechen
    raeume = data.get("erkannteRaeume") or []
    if raeume:
        parts.append(f"{len(raeume)} Raeume erkannt")

        # Gesamtflaeche berechnen wenn Flaechenangaben vorhanden
        gesamt_flaeche = 0.0
        hat_flaeche = False
        for raum in raeume:
            if isinstance(raum, dict):
                flaeche = raum.get("flaeche") or raum.get("area_m2")
                if flaeche is not None:
                    try:
                        gesamt_flaeche += float(flaeche)
                        hat_flaeche = True
                    except (ValueError, TypeError):
                        pass
        if hat_flaeche:
            parts.append(f"Gesamt: {gesamt_flaeche:.1f} m²")

    # Hinweise
    hinweise = data.get("hinweise") or []
    if hinweise:
        # Ersten Hinweis (ohne KI-Entwurf-Tag) anzeigen
        erster_hinweis = next(
            (h for h in hinweise if "[KI-ENTWURF]" not in str(h)),
            hinweise[0] if hinweise else None,
        )
        if erster_hinweis:
            parts.append(str(erster_hinweis)[:120])

    if parts:
        return " | ".join(parts)[:_SUMMARY_CHARS]
    else:
        return "Bauplan analysiert (keine strukturierten Angaben erkannt)"


@register_handler("llm.plan")
async def handle_llm_plan(
    upload_id: str,
    file_bytes: bytes,
    mime: str,
    params: dict,
) -> UploadResult:
    """DIN 277 + WoFlV Bauplan-Analyse via Oberon /api/v2/plan/analyze."""
    t0 = time.monotonic()

    base = _base_url()
    headers = _auth_headers()

    # Datei als Data-URL (Oberon erwartet imageUrl, kein file_base64)
    file_b64 = base64.b64encode(file_bytes).decode("ascii")
    image_data_url = f"data:{mime};base64,{file_b64}"

    body: dict = {
        "imageUrl": image_data_url,
    }

    # Optionaler Prompt aus params
    custom_prompt = (params or {}).get("prompt")
    if custom_prompt:
        body["prompt"] = str(custom_prompt)

    try:
        with httpx.Client(headers=headers, timeout=90.0) as client:
            resp = client.post(
                f"{base}/api/v2/plan/analyze",
                json=body,
            )
    except (httpx.ConnectError, httpx.TimeoutException, OSError) as exc:
        duration_ms = int((time.monotonic() - t0) * 1000)
        return _failed(upload_id, f"Oberon nicht erreichbar: {exc}", duration_ms)

    duration_ms = int((time.monotonic() - t0) * 1000)

    if resp.status_code == 405:
        # Endpoint existiert nicht / anderes Schema erwartet
        return _failed(
            upload_id,
            "Oberon /plan/analyze: HTTP 405 — Endpoint nicht aktiviert oder anderes Request-Schema erwartet.",
            duration_ms,
        )

    if resp.status_code != 200:
        return UploadResult(
            upload_id=upload_id,
            status="failed",
            operation="llm.plan",
            completed_at=datetime.now(timezone.utc),
            duration_ms=duration_ms,
            error=f"Oberon HTTP {resp.status_code}: {resp.text[:300]}",
            result_payload={"status_code": resp.status_code},
        )

    data = resp.json()
    summary = _build_summary(data)

    return UploadResult(
        upload_id=upload_id,
        status="completed",
        operation="llm.plan",
        completed_at=datetime.now(timezone.utc),
        duration_ms=duration_ms,
        result_summary=summary,
        result_payload=data if isinstance(data, dict) else {"raw": data},
    )
