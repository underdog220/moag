"""
Upload-Handler-Registry.

Handler-Signatur: async (upload_id, file_bytes, mime, params) -> UploadResult

Andere Subagents (Y-C/D/E) füllen HANDLERS via @register_handler("ocr.standard") etc.
Dieses Modul legt nur das Skelett an.
"""
from __future__ import annotations

import logging
from typing import Awaitable, Callable

from moag.upload.schemas import UploadResult

logger = logging.getLogger("moag.upload.handlers.registry")

# Handler-Typ-Alias
UploadHandler = Callable[[str, bytes, str, dict], Awaitable[UploadResult]]

# Zentrale Handler-Map: operation_id -> async Handler-Funktion
HANDLERS: dict[str, UploadHandler] = {}


def register_handler(operation_id: str):
    """Dekorator zum Registrieren eines Upload-Handlers.

    Verwendung:
        @register_handler("ocr.standard")
        async def handle_ocr_standard(
            upload_id: str,
            file_bytes: bytes,
            mime: str,
            params: dict,
        ) -> UploadResult:
            ...
    """
    def decorator(fn: UploadHandler) -> UploadHandler:
        if operation_id in HANDLERS:
            logger.warning(
                "Upload-Handler '%s' wird überschrieben (doppelte Registrierung)",
                operation_id,
            )
        HANDLERS[operation_id] = fn
        logger.debug("Upload-Handler registriert: %s", operation_id)
        return fn
    return decorator
