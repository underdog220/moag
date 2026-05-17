"""
Aktion: ocrexpert.shadow.batch — Shadow-Verarbeitungs-Batch starten.

POST {OCREXPERT_BASE_URL}/api/v1/shadow/process
Body: {"pfad": "<Pfad-zur-PDF>"}

Default-Testpfad: /mnt/qnap_public/Dokumente/test.pdf
Uebersteuert wird er durch body["pfad"] wenn vorhanden.

Result-Mapping:
  HTTP 200 → status="completed", result_summary enthaelt pdfa_pfad aus Response
  HTTP !=200 → status="failed", error enthaelt Fehlertext

ENV: MOAG_OCREXPERT_BASE_URL (Default: http://192.168.200.71:17810)
"""
from __future__ import annotations

import logging
import time
from datetime import datetime, timezone

import httpx

from moag.actions.registry import register
from moag.pipeline_hooks import plog
from moag.schemas import Action, ActionTriggerResponse

logger = logging.getLogger("moag.actions.ocrexpert_shadow_batch")

_DEFAULT_BASE = "http://192.168.200.71:17810"
_DEFAULT_PFAD = "/mnt/qnap_public/Dokumente/test.pdf"

_META = Action(
    action_id="ocrexpert.shadow.batch",
    system_id="ocrexpert",
    name="Shadow-Batch starten",
    description=(
        "Startet einen Shadow-Verarbeitungs-Batch fuer ein Dokument im "
        "Shadow-Input-Verzeichnis. Das Shadow-Modul legt eine PDF/A-Kopie "
        "in Dokumente_pdfa/ ab. Default-Pfad: /mnt/qnap_public/Dokumente/test.pdf "
        "(ueberschreibbar per body.pfad)."
    ),
    category="operation",
    sub_area="shadow",
    requires_confirm=False,
    is_destructive=False,
    estimated_duration_s=30,
    implemented=True,
)


@register(meta=_META)
async def handle_ocrexpert_shadow_batch(body: dict) -> ActionTriggerResponse:
    """Triggert POST /api/v1/shadow/process am OCRexpert-Service."""
    import os
    triggered_at = datetime.now(timezone.utc)
    t0 = time.monotonic()

    base_url = os.environ.get("MOAG_OCREXPERT_BASE_URL", _DEFAULT_BASE).rstrip("/")
    pfad = body.get("pfad", _DEFAULT_PFAD) if body else _DEFAULT_PFAD

    plog.step(
        "actions.ocrexpert.shadow.batch",
        "start",
        input={"url": base_url, "pfad": pfad},
    )

    try:
        async with httpx.AsyncClient(timeout=35.0) as client:
            resp = await client.post(
                f"{base_url}/api/v1/shadow/process",
                json={"pfad": pfad},
            )
            duration_ms = int((time.monotonic() - t0) * 1000)

            if not resp.is_success:
                plog.step(
                    "actions.ocrexpert.shadow.batch",
                    "failed",
                    input={"url": base_url, "pfad": pfad},
                    output={"status_code": resp.status_code},
                    dauer_ms=duration_ms,
                    ok=False,
                )
                return ActionTriggerResponse(
                    action_id="ocrexpert.shadow.batch",
                    triggered_at=triggered_at,
                    status="failed",
                    result_summary=f"Shadow-Batch: OCRexpert antwortete HTTP {resp.status_code}.",
                    payload={"status_code": resp.status_code, "pfad": pfad},
                    duration_ms=duration_ms,
                    error=f"HTTP {resp.status_code}: {resp.text[:300]}",
                )

            data: dict = {}
            try:
                data = resp.json()
            except Exception:
                # Manche Shadow-Implementierungen liefern Plain-Text
                data = {"raw_response": resp.text[:500]}

            pdfa_pfad = data.get("pdfa_pfad") or data.get("output_path") or data.get("output")
            summary = (
                f"Shadow-Batch abgeschlossen. "
                f"Eingabe: {pfad}"
                + (f" → PDF/A: {pdfa_pfad}" if pdfa_pfad else " (kein Output-Pfad in Response)")
            )

            plog.step(
                "actions.ocrexpert.shadow.batch",
                "completed",
                input={"url": base_url, "pfad": pfad},
                output={"pdfa_pfad": pdfa_pfad},
                dauer_ms=duration_ms,
                ok=True,
            )

            return ActionTriggerResponse(
                action_id="ocrexpert.shadow.batch",
                triggered_at=triggered_at,
                status="completed",
                result_summary=summary,
                payload={
                    "pfad":      pfad,
                    "pdfa_pfad": pdfa_pfad,
                    **data,
                },
                duration_ms=duration_ms,
            )

    except httpx.TimeoutException as exc:
        duration_ms = int((time.monotonic() - t0) * 1000)
        logger.warning("ocrexpert.shadow.batch: Timeout: %s", exc)
        plog.step(
            "actions.ocrexpert.shadow.batch",
            "failed",
            input={"url": base_url, "pfad": pfad},
            output={"error": "timeout"},
            dauer_ms=duration_ms,
            ok=False,
        )
        return ActionTriggerResponse(
            action_id="ocrexpert.shadow.batch",
            triggered_at=triggered_at,
            status="failed",
            result_summary="Shadow-Batch: OCRexpert nicht erreichbar (Timeout).",
            payload={"pfad": pfad},
            duration_ms=duration_ms,
            error=f"Timeout nach 35s: {exc}",
        )

    except (httpx.ConnectError, httpx.HTTPError) as exc:
        duration_ms = int((time.monotonic() - t0) * 1000)
        logger.warning("ocrexpert.shadow.batch: Verbindungsfehler: %s", exc)
        plog.step(
            "actions.ocrexpert.shadow.batch",
            "failed",
            input={"url": base_url, "pfad": pfad},
            output={"error": str(exc)},
            dauer_ms=duration_ms,
            ok=False,
        )
        return ActionTriggerResponse(
            action_id="ocrexpert.shadow.batch",
            triggered_at=triggered_at,
            status="failed",
            result_summary="Shadow-Batch: OCRexpert nicht erreichbar.",
            payload={"pfad": pfad},
            duration_ms=duration_ms,
            error=str(exc)[:300],
        )

    except Exception as exc:
        duration_ms = int((time.monotonic() - t0) * 1000)
        logger.exception("ocrexpert.shadow.batch: unerwarteter Fehler: %s", exc)
        plog.step(
            "actions.ocrexpert.shadow.batch",
            "failed",
            input={"url": base_url, "pfad": pfad},
            output={"error": str(exc)},
            dauer_ms=duration_ms,
            ok=False,
        )
        return ActionTriggerResponse(
            action_id="ocrexpert.shadow.batch",
            triggered_at=triggered_at,
            status="failed",
            result_summary="Shadow-Batch: unerwarteter Fehler.",
            payload={"pfad": pfad},
            duration_ms=duration_ms,
            error=str(exc)[:300],
        )
