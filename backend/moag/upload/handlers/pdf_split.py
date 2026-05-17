"""
Upload-Handler: pdf.split

Leitet multipart-Upload an OCRexpert POST /ocr/split weiter.

SplitResponse:
  pfad            — Ausgabepfad (server-seitig)
  seiten_anzahl   — Gesamt-Seitenzahl
  anzahl_teildokumente — Anzahl Split-Dokumente
  llm_benutzt     — ob LLM für Grenz-Erkennung genutzt wurde
  teildokumente   — Liste von Dicts je Teildokument
  grenzen         — erkannte Seitenbrüche
  seiten_signale  — Erkennungs-Signale je Seite

Da teildokumente keine direkten Download-URLs haben, werden die
Server-Pfade als result_payload.pages transportiert. Das erste
Teildokument wird als Haupt-Artifact markiert wenn der Pfad vorhanden ist.
"""
from __future__ import annotations

import logging
import os
import time
from datetime import datetime, timezone

import httpx

from moag.pipeline_hooks import plog
from moag.upload.handlers.registry import register_handler
from moag.upload.schemas import UploadResult

logger = logging.getLogger("moag.upload.handlers.pdf_split")

_OCREXPERT_BASE_URL = os.environ.get("MOAG_OCREXPERT_BASE_URL", "http://192.168.200.71:17810")


def _extract_pages(teildokumente: list) -> list[dict]:
    """Normalisiert teildokumente-Liste auf einheitliches pages-Format.

    Jedes Element kann unterschiedliche Felder haben (additionalProperties:true).
    Wir extrahieren was wir kennen und leiten den Rest durch.
    """
    pages = []
    for i, teil in enumerate(teildokumente):
        if not isinstance(teil, dict):
            pages.append({"page_number": i + 1})
            continue
        page_entry: dict = {"page_number": i + 1}
        # Bekannte Felder
        for key in ("pfad", "path", "seiten", "pages", "titel", "title", "seite_von", "seite_bis"):
            if key in teil:
                page_entry[key] = teil[key]
        # Unbekannte Felder durchreichen
        for k, v in teil.items():
            if k not in page_entry:
                page_entry[k] = v
        pages.append(page_entry)
    return pages


@register_handler("pdf.split")
async def handle_pdf_split(
    upload_id: str,
    file_bytes: bytes,
    mime: str,
    params: dict,
) -> UploadResult:
    """Splittet ein PDF in Teildokumente via OCRexpert POST /ocr/split.

    Liefert mehrere Teildokumente (pages) in result_payload.
    Das erste Teildokument wird als primäres Artifact markiert.
    """
    base = _OCREXPERT_BASE_URL.rstrip("/")
    t0 = time.monotonic()

    plog.step(
        "pdf.split", "start",
        input={"upload_id": upload_id, "bytes": len(file_bytes)},
        dauer_ms=0,
    )

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                f"{base}/ocr/split",
                files={"file": ("upload", file_bytes, mime)},
            )
    except httpx.TimeoutException as exc:
        dauer_ms = int((time.monotonic() - t0) * 1000)
        plog.step("pdf.split", "timeout", output=str(exc), dauer_ms=dauer_ms, ok=False)
        logger.warning("pdf.split Timeout nach %dms für upload_id=%s", dauer_ms, upload_id)
        return UploadResult(
            upload_id=upload_id,
            status="failed",
            operation="pdf.split",
            completed_at=datetime.now(timezone.utc),
            duration_ms=dauer_ms,
            error=f"OCRexpert Split-Timeout nach {dauer_ms}ms",
        )
    except httpx.ConnectError as exc:
        dauer_ms = int((time.monotonic() - t0) * 1000)
        plog.step("pdf.split", "connect_error", output=str(exc), dauer_ms=dauer_ms, ok=False)
        logger.warning("pdf.split Verbindungsfehler upload_id=%s: %s", upload_id, exc)
        return UploadResult(
            upload_id=upload_id,
            status="failed",
            operation="pdf.split",
            completed_at=datetime.now(timezone.utc),
            duration_ms=dauer_ms,
            error=f"OCRexpert nicht erreichbar: {exc}",
        )

    dauer_ms = int((time.monotonic() - t0) * 1000)

    if not resp.is_success:
        plog.step("pdf.split", "http_error", output={"status": resp.status_code}, dauer_ms=dauer_ms, ok=False)
        logger.warning("pdf.split HTTP %d für upload_id=%s", resp.status_code, upload_id)
        return UploadResult(
            upload_id=upload_id,
            status="failed",
            operation="pdf.split",
            completed_at=datetime.now(timezone.utc),
            duration_ms=dauer_ms,
            error=f"OCRexpert HTTP {resp.status_code}: {resp.text[:200]}",
        )

    try:
        data = resp.json()
    except Exception as exc:
        plog.step("pdf.split", "parse_error", output=str(exc), dauer_ms=dauer_ms, ok=False)
        return UploadResult(
            upload_id=upload_id,
            status="failed",
            operation="pdf.split",
            completed_at=datetime.now(timezone.utc),
            duration_ms=dauer_ms,
            error=f"Antwort nicht parsierbar: {exc}",
        )

    # SplitResponse auswerten
    seiten_anzahl = data.get("seiten_anzahl", 0)
    anzahl_teildokumente = data.get("anzahl_teildokumente", 0)
    teildokumente = data.get("teildokumente", [])
    grenzen = data.get("grenzen", [])
    llm_benutzt = bool(data.get("llm_benutzt", False))
    output_pfad = data.get("pfad", "")

    pages = _extract_pages(teildokumente)

    # Haupt-Artifact: erstes Teildokument mit Pfad, falls vorhanden
    first_pfad = None
    if pages and pages[0].get("pfad"):
        first_pfad = pages[0]["pfad"]
    elif output_pfad:
        first_pfad = output_pfad

    result_summary = (
        f"PDF gesplittet: {anzahl_teildokumente} Teildokument(e) aus {seiten_anzahl} Seite(n)"
        f"{' (LLM-Grenz-Erkennung)' if llm_benutzt else ''}."
    )

    plog.step(
        "pdf.split", "done",
        output={
            "teildokumente": anzahl_teildokumente,
            "seiten": seiten_anzahl,
            "llm_benutzt": llm_benutzt,
        },
        dauer_ms=dauer_ms,
        ok=True,
    )
    logger.info(
        "pdf.split OK upload_id=%s teildokumente=%d seiten=%d",
        upload_id, anzahl_teildokumente, seiten_anzahl,
    )

    return UploadResult(
        upload_id=upload_id,
        status="completed",
        operation="pdf.split",
        completed_at=datetime.now(timezone.utc),
        duration_ms=dauer_ms,
        result_summary=result_summary,
        result_payload={
            "seiten_anzahl": seiten_anzahl,
            "anzahl_teildokumente": anzahl_teildokumente,
            "llm_benutzt": llm_benutzt,
            "output_pfad": output_pfad,
            "pages": pages,
            "grenzen": grenzen,
            "seiten_signale": data.get("seiten_signale", []),
        },
        # Haupt-Artifact: server-seitiger Pfad des ersten Teildokuments
        # artifact_url bleibt None (keine öffentliche URL; DB-Schicht setzt artifact_path)
        artifact_url=None,
        artifact_mime="application/pdf" if first_pfad else None,
    )
