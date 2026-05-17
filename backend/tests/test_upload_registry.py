"""
Smoke-Tests für die Upload-Handler-Registry.
"""
from __future__ import annotations


def test_registry_importierbar():
    """Registry lässt sich ohne Fehler importieren."""
    from moag.upload.handlers.registry import HANDLERS, register_handler
    assert isinstance(HANDLERS, dict)


def test_stub_handler_registriert():
    """ocr.standard-Stub ist nach Import in HANDLERS."""
    import moag.upload.handlers  # Seiteneffekt: Registry befüllen
    from moag.upload.handlers.registry import HANDLERS
    assert "ocr.standard" in HANDLERS, "ocr.standard-Stub muss registriert sein"


def test_register_handler_dekorator():
    """@register_handler registriert einen neuen Handler korrekt."""
    from moag.upload.handlers.registry import HANDLERS, register_handler
    from moag.upload.schemas import UploadResult

    @register_handler("test.dummy")
    async def _dummy(upload_id, file_bytes, mime, params):
        return UploadResult(
            upload_id=upload_id,
            status="completed",
            operation="test.dummy",
        )

    assert "test.dummy" in HANDLERS
    assert HANDLERS["test.dummy"] is _dummy

    # Cleanup (damit andere Tests nicht beeinflusst werden)
    del HANDLERS["test.dummy"]


def test_stub_handler_signatur():
    """ocr.standard-Handler hat korrekte async-Signatur."""
    import asyncio
    import moag.upload.handlers
    from moag.upload.handlers.registry import HANDLERS

    handler = HANDLERS["ocr.standard"]
    result = asyncio.run(handler("test-id", b"daten", "application/pdf", {}))
    from moag.upload.schemas import UploadResult
    assert isinstance(result, UploadResult)
    assert result.upload_id == "test-id"
    assert result.operation == "ocr.standard"


def test_optional_handler_ladefehler_kein_crash():
    """Fehlende optionale Handler-Module verursachen keinen ImportError."""
    # Das __init__-Modul muss sich auch laden lassen wenn optionale
    # Handler-Module noch nicht da sind.
    import importlib
    import sys
    # Modul neu laden (falls schon im Cache)
    mod_name = "moag.upload.handlers"
    if mod_name in sys.modules:
        del sys.modules[mod_name]
    # Darf keinen Exception werfen
    importlib.import_module(mod_name)
