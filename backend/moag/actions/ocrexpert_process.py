"""
Aktion: ocrexpert.process — Async OCR-Batch via Standard-Pipeline.

POST {OCREXPERT_BASE_URL}/api/v1/process/batch
Body: {"files": ["<Pfad1>", ...], "profile": "generic", "output": "json"}

Default-Testpfad: /mnt/qnap_public/Dokumente/test.pdf
Body-Override: body["pfad"] (str) oder body["files"] (list) — beide werden in
files[]-Array gemappt. Optional: body["profile"] und body["output"].

Hintergrund: /api/v1/process (sync, single-file) erwartet multipart/form-data,
das passt nicht zu unserer Pfad-basierten Aktion-API. /api/v1/process/batch
nimmt JSON mit Pfad-Liste — passt zu MOAG.

Result-Mapping:
  HTTP 200/202 mit batch_id → status="started", result_summary mit batch_id
  HTTP !=200 → status="failed", error mit Fehlertext

ENV: MOAG_OCREXPERT_BASE_URL (Default: http://192.168.200.71:17810)
Timeout: 30s (Batch-Submit ist async, OCR selbst läuft im Hintergrund)
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
    name="OCR-Datei verarbeiten",
    description=(
        "STUB bis Phase 1.5b. OCRexpert /api/v1/process erwartet multipart-Upload, "
        "/api/v1/process/batch erwartet URL-basierte UploadBatchFile-Objekte. "
        "MOAG braucht dafuer eine File-Upload-UI oder einen URL-Host. "
        "Bis dahin: ocrexpert.shadow.batch fuer Pfad-basierte Aufrufe nutzen."
    ),
    category="operation",
    sub_area="process",
    requires_confirm=False,
    is_destructive=False,
    estimated_duration_s=None,
    implemented=False,
)


@register(meta=_META)
async def handle_ocrexpert_process(body: dict) -> ActionTriggerResponse:
    """STUB-Handler: gibt not_implemented zurueck.

    Echte Implementierung kommt in Phase 1.5b, wenn MOAG eine File-Upload-UI
    oder einen kleinen URL-Host bekommt. Bis dahin verweisen wir auf die
    funktionierende Pfad-basierte Aktion `ocrexpert.shadow.batch`.
    """
    triggered_at = datetime.now(timezone.utc)
    return ActionTriggerResponse(
        action_id="ocrexpert.process",
        triggered_at=triggered_at,
        status="not_implemented",
        result_summary=(
            "ocrexpert.process — STUB bis Phase 1.5b. OCRexpert-Endpoints brauchen "
            "Multipart-File oder URL-Objekte. Pfad-basierte Aufrufe: ocrexpert.shadow.batch."
        ),
        payload={
            "alternative_action_id": "ocrexpert.shadow.batch",
            "phase":                 "1.5b",
            "reason":                "OCRexpert /api/v1/process ist multipart, /api/v1/process/batch erwartet URL-Objekte",
        },
        duration_ms=0,
    )


async def _legacy_unused_will_become_phase_1_5b(body: dict) -> ActionTriggerResponse:
    """Behalten als Referenz — wird heute nicht aufgerufen, Code kommt zurueck wenn Phase 1.5b startet."""
    import os
    triggered_at = datetime.now(timezone.utc)
    t0 = time.monotonic()

    base_url = os.environ.get("MOAG_OCREXPERT_BASE_URL", _DEFAULT_BASE).rstrip("/")

    # Pfad-Eingabe normalisieren: body.files hat Vorrang, sonst body.pfad als Liste
    if body and isinstance(body.get("files"), list) and body["files"]:
        files = body["files"]
    else:
        single_pfad = (body or {}).get("pfad", _DEFAULT_PFAD)
        files = [single_pfad]

    profile = (body or {}).get("profile", "generic")
    output_fmt = (body or {}).get("output", "json")
    language = (body or {}).get("language")

    payload_body: dict = {"files": files, "profile": profile, "output": output_fmt}
    if language:
        payload_body["language"] = language

    plog.step(
        "actions.ocrexpert.process",
        "start",
        input={"url": base_url, "files": files, "profile": profile},
    )

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{base_url}/api/v1/process/batch",
                json=payload_body,
            )
            duration_ms = int((time.monotonic() - t0) * 1000)

            if not resp.is_success:
                plog.step(
                    "actions.ocrexpert.process",
                    "failed",
                    input={"url": base_url, "files": files},
                    output={"status_code": resp.status_code, "response": resp.text[:300]},
                    dauer_ms=duration_ms,
                    ok=False,
                )
                return ActionTriggerResponse(
                    action_id="ocrexpert.process",
                    triggered_at=triggered_at,
                    status="failed",
                    result_summary=f"OCR-Batch: OCRexpert antwortete HTTP {resp.status_code}.",
                    payload={"status_code": resp.status_code, "files": files, "body_sent": payload_body},
                    duration_ms=duration_ms,
                    error=f"HTTP {resp.status_code}: {resp.text[:300]}",
                )

            data: dict = {}
            try:
                data = resp.json()
            except Exception:
                data = {"raw_response": resp.text[:500]}

            batch_id = data.get("batch_id") or data.get("id") or "(keine batch_id zurueck)"
            summary = (
                f"OCR-Batch gestartet · batch_id={batch_id} · {len(files)} Datei(en) · "
                f"Status via GET /api/v1/process/batch/{batch_id}"
            )

            plog.step(
                "actions.ocrexpert.process",
                "started",
                input={"url": base_url, "files": files},
                output={"batch_id": batch_id},
                dauer_ms=duration_ms,
                ok=True,
            )

            return ActionTriggerResponse(
                action_id="ocrexpert.process",
                triggered_at=triggered_at,
                status="started",
                result_summary=summary,
                payload={
                    "files":    files,
                    "batch_id": batch_id,
                    "profile":  profile,
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
            input={"url": base_url, "files": files},
            output={"error": "timeout"},
            dauer_ms=duration_ms,
            ok=False,
        )
        return ActionTriggerResponse(
            action_id="ocrexpert.process",
            triggered_at=triggered_at,
            status="failed",
            result_summary="OCR-Prozess: OCRexpert nicht erreichbar (Timeout nach 60s).",
            payload={"files": files},
            duration_ms=duration_ms,
            error=f"Timeout nach 60s: {exc}",
        )

    except (httpx.ConnectError, httpx.HTTPError) as exc:
        duration_ms = int((time.monotonic() - t0) * 1000)
        logger.warning("ocrexpert.process: Verbindungsfehler: %s", exc)
        plog.step(
            "actions.ocrexpert.process",
            "failed",
            input={"url": base_url, "files": files},
            output={"error": str(exc)},
            dauer_ms=duration_ms,
            ok=False,
        )
        return ActionTriggerResponse(
            action_id="ocrexpert.process",
            triggered_at=triggered_at,
            status="failed",
            result_summary="OCR-Prozess: OCRexpert nicht erreichbar.",
            payload={"files": files},
            duration_ms=duration_ms,
            error=str(exc)[:300],
        )

    except Exception as exc:
        duration_ms = int((time.monotonic() - t0) * 1000)
        logger.exception("ocrexpert.process: unerwarteter Fehler: %s", exc)
        plog.step(
            "actions.ocrexpert.process",
            "failed",
            input={"url": base_url, "files": files},
            output={"error": str(exc)},
            dauer_ms=duration_ms,
            ok=False,
        )
        return ActionTriggerResponse(
            action_id="ocrexpert.process",
            triggered_at=triggered_at,
            status="failed",
            result_summary="OCR-Prozess: unerwarteter Fehler.",
            payload={"files": files},
            duration_ms=duration_ms,
            error=str(exc)[:300],
        )
