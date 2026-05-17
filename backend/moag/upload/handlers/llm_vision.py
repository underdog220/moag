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

import re

logger = logging.getLogger("moag.upload.handlers.llm_vision")

# Gecachte Vision-Instance-ID (Modul-Variable, in-process)
_cached_vision_instance_id: str | None = None

# Oberon /instances/{id}/vision nutzt den DevLoop-Endpoint und liefert Multi-Mode-Marker.
# Diese werden hier herausgefiltert, sodass nur der saubere Antworttext bleibt.
_DEVLOOP_MARKER_PATTERN = re.compile(
    r"\[CHATGPT_ANSWER\]|\[CURSOR_PROMPT\].*?(\[|$)|\[CODEX_TASK\].*?(\[|$)",
    re.DOTALL,
)

_MARKER_NAMES = ["[CHATGPT_ANSWER]", "[CURSOR_PROMPT]", "[CODEX_TASK]"]


def _strip_devloop_markers(text: str) -> str:
    """Entfernt DevLoop-Marker-Tags und gibt den sauberen Antworttext zurueck.

    Oberon /instances/{id}/vision antwortet mit:
      [CHATGPT_ANSWER]<text>[CURSOR_PROMPT]<...>
    Wir behalten nur den Teil nach [CHATGPT_ANSWER] bis zum naechsten Marker.
    """
    if not text:
        return text

    # Pruefe ob Marker vorhanden
    if "[CHATGPT_ANSWER]" in text:
        # Extrahiere Bereich zwischen [CHATGPT_ANSWER] und dem naechsten Marker (oder Ende)
        start = text.index("[CHATGPT_ANSWER]") + len("[CHATGPT_ANSWER]")
        rest = text[start:]
        # Schneide beim ersten anderen Marker ab
        for marker in ["[CURSOR_PROMPT]", "[CODEX_TASK]"]:
            if marker in rest:
                rest = rest[:rest.index(marker)]
        return rest.strip()

    # Kein [CHATGPT_ANSWER]-Wrapper — entferne trotzdem bekannte Marker-Tags
    for marker in _MARKER_NAMES:
        text = text.replace(marker, "")
    return text.strip()

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
    # Oberon erwartet: projectId + label (type/domain sind kein gueliges Feld)
    base = _base_url()
    try:
        resp = client.post(
            f"{base}/api/v2/instances",
            json={
                "projectId": "moag",
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

    # Bild als Data-URL (Oberon erwartet imageUrl als data:mime;base64,... oder HTTP-URL)
    image_b64 = base64.b64encode(file_bytes).decode("ascii")
    image_data_url = f"data:{mime};base64,{image_b64}"

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
        # Oberon-Feld: imageUrl (Data-URL oder HTTP-URL), nicht image_base64
        try:
            resp = client.post(
                f"{base}/api/v2/instances/{instance_id}/vision",
                json={"prompt": str(prompt), "imageUrl": image_data_url},
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
    # Oberon Vision-Response: {"response": "...", "instanceId": "...", ...}
    # Der /instances/{id}/vision-Endpoint liefert DevLoop-Marker im response-Feld.
    # Diese werden herausgefiltert: [CHATGPT_ANSWER], [CURSOR_PROMPT], [CODEX_TASK]
    raw_response: str = (
        data.get("response")
        or data.get("answer")
        or data.get("text")
        or ""
    )
    llm_response = _strip_devloop_markers(raw_response)
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
