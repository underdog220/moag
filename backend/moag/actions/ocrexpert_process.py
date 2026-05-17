"""
Aktion: ocrexpert.process — Synchroner OCR-Lauf via Standard-Pipeline.

POST {OCREXPERT_BASE_URL}/api/v1/process
Body: {"pfad": "<Linux-Pfad-zur-PDF>"}

Default-Testpfad: /mnt/qnap_public/Dokumente/test.pdf
Uebersteuert durch body["pfad"] wenn vorhanden.

Result-Mapping:
  HTTP 200 → status="completed", result_summary mit Zeichen-Anzahl und Pfad
  HTTP !=200 → status="failed", error mit Fehlertext

ENV: MOAG_OCREXPERT_BASE_URL (Default: http://192.168.200.71:17810)
Timeout: 60s (OCR braucht Zeit bei groesseren Dokumenten)
"""
from __future__ import annotations

import logging
import time
from datetime import datetime, timezone

import httpx

from moag.actions.registry import register
from moag.pipeline_hooks import plog
from moag.schemas import Action, ActionTriggerResponse

logger = logging.getLogger("moag.actions.ocrexpert_process")

_DEFAULT_BASE = "http://192.168.200.71:17810"
_DEFAULT_PFAD = "/mnt/qnap_public/Dokumente/test.pdf"

_META = Action(
    action_id="ocrexpert.process",
    system_id="ocrexpert",
    name="OCR auf Datei ausfuehren",
    description=(
        "Synchroner OCR-Lauf gegen die Standard-Pipeline (POST /api/v1/process). "
        "Liefert Text + Doctype + PII direkt zurueck. "
        "Default-Pfad: /mnt/qnap_public/Dokumente/test.pdf "
        "(ueberschreibbar per body.pfad)."
    ),
    category="operation",
    sub_area="process",
    requires_confirm=False,
    is_destructive=False,
    estimated_duration_s=30,
    implemented=True,
)


@register(meta=_META)
async def handle_ocrexpert_process(body: dict) -> ActionTriggerResponse:
    """Triggert POST /api/v1/process am OCRexpert-Service."""
    import os
    triggered_at = datetime.now(timezone.utc)
    t0 = time.monotonic()

    base_url = os.environ.get("MOAG_OCREXPERT_BASE_URL", _DEFAULT_BASE).rstrip("/")
    pfad = body.get("pfad", _DEFAULT_PFAD) if body else _DEFAULT_PFAD

    plog.step(
        "actions.ocrexpert.process",
        "start",
        input={"url": base_url, "pfad": pfad},
    )

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{base_url}/api/v1/process",
                json={"pfad": pfad},
            )
            duration_ms = int((time.monotonic() - t0) * 1000)

            if not resp.is_success:
                plog.step(
                    "actions.ocrexpert.process",
                    "failed",
                    input={"url": base_url, "pfad": pfad},
                    output={"status_code": resp.status_code},
                    dauer_ms=duration_ms,
                    ok=False,
                )
                return ActionTriggerResponse(
                    action_id="ocrexpert.process",
                    triggered_at=triggered_at,
                    status="failed",
                    result_summary=f"OCR-Prozess: OCRexpert antwortete HTTP {resp.status_code}.",
                    payload={"status_code": resp.status_code, "pfad": pfad},
                    duration_ms=duration_ms,
                    error=f"HTTP {resp.status_code}: {resp.text[:300]}",
                )

            data: dict = {}
            try:
                data = resp.json()
            except Exception:
                # Unerwartetes Plain-Text-Format tolerieren
                data = {"raw_response": resp.text[:500]}

            # Zeichenanzahl aus Response extrahieren — verschiedene moegliche Feldnamen
            text_content: str = (
                data.get("text") or
                data.get("recognized_text") or
                data.get("content") or
                ""
            )
            n_chars = len(text_content) if isinstance(text_content, str) else 0

            summary = (
                f"OCR-Text erkannt: {n_chars} Zeichen aus {pfad}"
                + (f" · Doctype: {data['doctype']}" if data.get("doctype") else "")
            )

            plog.step(
                "actions.ocrexpert.process",
                "completed",
                input={"url": base_url, "pfad": pfad},
                output={"n_chars": n_chars, "doctype": data.get("doctype")},
                dauer_ms=duration_ms,
                ok=True,
            )

            return ActionTriggerResponse(
                action_id="ocrexpert.process",
                triggered_at=triggered_at,
                status="completed",
                result_summary=summary,
                payload={
                    "pfad":    pfad,
                    "n_chars": n_chars,
                    **data,
                },
                duration_ms=duration_ms,
            )

    except httpx.TimeoutException as exc:
        duration_ms = int((time.monotonic() - t0) * 1000)
        logger.warning("ocrexpert.process: Timeout: %s", exc)
        plog.step(
            "actions.ocrexpert.process",
            "failed",
            input={"url": base_url, "pfad": pfad},
            output={"error": "timeout"},
            dauer_ms=duration_ms,
            ok=False,
        )
        return ActionTriggerResponse(
            action_id="ocrexpert.process",
            triggered_at=triggered_at,
            status="failed",
            result_summary="OCR-Prozess: OCRexpert nicht erreichbar (Timeout nach 60s).",
            payload={"pfad": pfad},
            duration_ms=duration_ms,
            error=f"Timeout nach 60s: {exc}",
        )

    except (httpx.ConnectError, httpx.HTTPError) as exc:
        duration_ms = int((time.monotonic() - t0) * 1000)
        logger.warning("ocrexpert.process: Verbindungsfehler: %s", exc)
        plog.step(
            "actions.ocrexpert.process",
            "failed",
            input={"url": base_url, "pfad": pfad},
            output={"error": str(exc)},
            dauer_ms=duration_ms,
            ok=False,
        )
        return ActionTriggerResponse(
            action_id="ocrexpert.process",
            triggered_at=triggered_at,
            status="failed",
            result_summary="OCR-Prozess: OCRexpert nicht erreichbar.",
            payload={"pfad": pfad},
            duration_ms=duration_ms,
            error=str(exc)[:300],
        )

    except Exception as exc:
        duration_ms = int((time.monotonic() - t0) * 1000)
        logger.exception("ocrexpert.process: unerwarteter Fehler: %s", exc)
        plog.step(
            "actions.ocrexpert.process",
            "failed",
            input={"url": base_url, "pfad": pfad},
            output={"error": str(exc)},
            dauer_ms=duration_ms,
            ok=False,
        )
        return ActionTriggerResponse(
            action_id="ocrexpert.process",
            triggered_at=triggered_at,
            status="failed",
            result_summary="OCR-Prozess: unerwarteter Fehler.",
            payload={"pfad": pfad},
            duration_ms=duration_ms,
            error=str(exc)[:300],
        )
