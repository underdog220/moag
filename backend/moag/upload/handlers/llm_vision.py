"""Upload-Handler: llm.vision — Bild an Oberon Vision-Instanz.

Akzeptierte MIMEs: PNG, JPG, WEBP
Pflicht-Param: prompt (string)

Vision-Instance-ID:
  - ENV MOAG_OBERON_VISION_INSTANCE_ID (bevorzugt)
  - Sonst: einmalig Instance anlegen via POST /api/v2/instances,
    ID in Modul-Variable cachen (kein DB-Touch).

Oberon-Endpoint: POST /api/v2/instances/{id}/vision
Body: {"prompt": "...", "image_base64": "..."}
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

logger = logging.getLogger("moag.upload.handlers.llm_vision")

# Gecachte Vision-Instance-ID (Modul-Variable, in-process)
_cached_vision_instance_id: str | None = None

_SUMMARY_CHARS = 200


def _failed(upload_id: str, error: str, duration_ms: int = 0) -> UploadResult:
    return UploadResult(
        upload_id=upload_id,
        status="failed",
        operation="llm.vision",
        completed_at=datetime.now(timezone.utc),
        duration_ms=duration_ms,
        error=error,
    )


def _auth_headers() -> dict[str, str]:
    token = os.environ.get("MOAG_OBERON_TOKEN", "")
    if token:
        return {"Authorization": f"Bearer {token}"}
    return {}


def _base_url() -> str:
    return os.environ.get("MOAG_OBERON_BASE_URL", "http://192.168.200.169:17900").rstrip("/")


def _get_or_create_vision_instance(client: httpx.Client) -> str | None:
    """Liefert die Vision-Instance-ID aus ENV oder legt eine neue an.

    Gibt None zurueck wenn die Anlage fehlschlaegt.
    """
    global _cached_vision_instance_id

    # ENV hat Vorrang
    env_id = os.environ.get("MOAG_OBERON_VISION_INSTANCE_ID", "").strip()
    if env_id:
        return env_id

    # Cache pruefen
    if _cached_vision_instance_id:
        return _cached_vision_instance_id

    # Neue Instance anlegen
    base = _base_url()
    try:
        resp = client.post(
            f"{base}/api/v2/instances",
            json={
                "type": "TOPIC_FOCUS",
                "domain": "VISION",
                "label": "MOAG Upload-Vision",
            },
            headers=_auth_headers(),
        )
    except (httpx.ConnectError, httpx.TimeoutException, OSError) as exc:
        logger.warning("Vision-Instance anlegen fehlgeschlagen: %s", exc)
        return None

    if resp.status_code not in (200, 201):
        logger.warning(
            "Vision-Instance anlegen: HTTP %s — %s",
            resp.status_code, resp.text[:200],
        )
        return None

    data = resp.json()
    # Oberon liefert typischerweise {"id": "..."} oder {"instanceId": "..."}
    instance_id = data.get("id") or data.get("instanceId")
    if not instance_id:
        logger.warning("Vision-Instance anlegen: kein 'id' in Response: %s", data)
        return None

    _cached_vision_instance_id = str(instance_id)
    logger.info("Vision-Instance angelegt und gecacht: %s", _cached_vision_instance_id)
    return _cached_vision_instance_id


@register_handler("llm.vision")
async def handle_llm_vision(
    upload_id: str,
    file_bytes: bytes,
    mime: str,
    params: dict,
) -> UploadResult:
    """LLM Vision-Analyse via Oberon Vision-Instance."""
    t0 = time.monotonic()

    # Pflicht-Param pruefen
    prompt = params.get("prompt")
    if not prompt or not str(prompt).strip():
        return _failed(upload_id, "Pflicht-Param 'prompt' fehlt oder leer.")

    # Bild als Base64
    image_b64 = base64.b64encode(file_bytes).decode("ascii")

    base = _base_url()
    headers = _auth_headers()

    with httpx.Client(base_url=base, headers=headers, timeout=60.0) as client:
        # Instance-ID holen / anlegen
        instance_id = _get_or_create_vision_instance(client)
        if not instance_id:
            duration_ms = int((time.monotonic() - t0) * 1000)
            return _failed(
                upload_id,
                "Vision-Instance nicht verfuegbar — Oberon nicht erreichbar oder Instance-Anlage fehlgeschlagen.",
                duration_ms,
            )

        # Vision-Endpoint aufrufen
        try:
            resp = client.post(
                f"{base}/api/v2/instances/{instance_id}/vision",
                json={"prompt": str(prompt), "image_base64": image_b64},
                headers=headers,
            )
        except (httpx.ConnectError, httpx.TimeoutException, OSError) as exc:
            duration_ms = int((time.monotonic() - t0) * 1000)
            return _failed(upload_id, f"Oberon nicht erreichbar: {exc}", duration_ms)

    duration_ms = int((time.monotonic() - t0) * 1000)

    if resp.status_code != 200:
        return UploadResult(
            upload_id=upload_id,
            status="failed",
            operation="llm.vision",
            completed_at=datetime.now(timezone.utc),
            duration_ms=duration_ms,
            error=f"Oberon HTTP {resp.status_code}: {resp.text[:200]}",
            result_payload={"status_code": resp.status_code},
        )

    data = resp.json()
    # Oberon Vision-Response: {"response": "...", ...} oder DevLoop-Marker-Format
    llm_response: str = (
        data.get("response")
        or data.get("answer")
        or data.get("text")
        or ""
    )
    summary = llm_response[:_SUMMARY_CHARS] if llm_response else "(keine Antwort)"

    return UploadResult(
        upload_id=upload_id,
        status="completed",
        operation="llm.vision",
        completed_at=datetime.now(timezone.utc),
        duration_ms=duration_ms,
        result_summary=summary,
        result_payload={
            "response": llm_response,
            "instance_id": instance_id,
            "raw": data,
        },
    )
