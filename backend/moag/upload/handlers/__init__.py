"""
Upload-Handler-Paket.

Beim Import werden alle Handler-Module geladen, damit ihre
@register_handler-Dekoratoren die HANDLERS-Map befüllen.

Subagents (Y-C/D/E) legen hier neue Handler-Module ab und ergänzen
den Import unten sobald die Dateien existieren.
"""
from __future__ import annotations
import importlib
import logging

logger = logging.getLogger("moag.upload.handlers")

# Stub-Handler (immer da — für Tests + Frontend-Voransicht)
from moag.upload.handlers import stubs  # noqa: F401

# Weitere Handler — werden lazy geladen damit fehlende Module keinen Importfehler erzeugen
# Subagents Y-C/D/E ergänzen ihre Module hier wenn sie implementiert sind.
_OPTIONAL_HANDLERS = [
    "moag.upload.handlers.llm_text",
    "moag.upload.handlers.llm_vision",
    "moag.upload.handlers.llm_plan",
    "moag.upload.handlers.pii_scan",
    "moag.upload.handlers.ocr_standard",  # überschreibt Stub aus stubs.py
    "moag.upload.handlers.ocr_shadow",
    "moag.upload.handlers.ocr_direct",
    "moag.upload.handlers.audio_transcribe",
    "moag.upload.handlers.dsgvo_redact",
    "moag.upload.handlers.dsgvo_visual_redact",
    "moag.upload.handlers.pdf_split",
]

for _mod in _OPTIONAL_HANDLERS:
    try:
        importlib.import_module(_mod)
    except ModuleNotFoundError:
        pass  # Handler noch nicht implementiert — wird von Subagent nachgezogen
    except Exception as _e:
        logger.warning("Handler-Modul '%s' Ladefehler: %s", _mod, _e)
