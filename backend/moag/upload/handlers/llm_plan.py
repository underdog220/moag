"""Upload-Handler: llm.plan — Bauplan-Analyse via Oberon.

Akzeptierte MIMEs: PDF, PNG, JPG
Keine Pflicht-Params.

Oberon-Endpoint: POST {OBERON_BASE_URL}/api/v2/plan/analyze

Schema-Strategie:
  - Oberon-openapi.json wird NICHT live abgefragt (wuerde Latenz erfordern
    und ist zur Upload-Zeit nicht garantiert erreichbar).
  - Stattdessen: pragmatisches JSON-Body-Schema, das aus Oberon-Doku
    bekannt ist (multipart/JSON). Handler sendet JSON mit base64-payload.
  - Falls Oberon 405/415 zurueckgibt: Soft-Fail mit klarem Hinweis.

Response: DIN 277 + WoFlV-Werte → result_summary mit Wohnflaeche/Nutzflaeche.
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
    """Baut result_summary aus DIN-277/WoFlV-Feldern."""
    parts = []

    # WoFlV-Wohnflaeche
    wohnflaeche = data.get("wohnflaeche") or data.get("living_area_m2")
    if wohnflaeche is not None:
        parts.append(f"Wohnflaeche: {wohnflaeche} m²")

    # DIN 277 Nutzflaeche
    nutzflaeche = data.get("nutzflaeche") or data.get("usable_area_m2") or data.get("nuf_m2")
    if nutzflaeche is not None:
        parts.append(f"Nutzflaeche: {nutzflaeche} m²")

    # Brutto-Grundflaeche
    bgf = data.get("bgf_m2") or data.get("gross_floor_area_m2")
    if bgf is not None:
        parts.append(f"BGF: {bgf} m²")

    # Raumanzahl
    rooms = data.get("rooms") or data.get("raum_anzahl")
    if rooms is not None:
        parts.append(f"Raeume: {rooms}")

    # Freitext-Zusammenfassung falls vorhanden
    summary_text = data.get("summary") or data.get("zusammenfassung")

    if parts:
        result = " | ".join(parts)
        if summary_text:
            result += f" — {summary_text[:200]}"
        return result
    elif summary_text:
        return str(summary_text)[:_SUMMARY_CHARS]
    else:
        return "Bauplan analysiert (keine strukturierten Flaechenwerte in Response)"


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

    # Datei als Base64 kodieren (JSON-Body-Ansatz)
    file_b64 = base64.b64encode(file_bytes).decode("ascii")

    body = {
        "clientId": "moag-upload",
        "file_base64": file_b64,
        "mime": mime,
        "standards": ["DIN_277", "WoFlV"],
    }

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
