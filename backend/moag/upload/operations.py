"""
Upload-Operations-Registry — Backend-Spiegel von frontend/src/lib/uploadOperations.ts.

Exakt nach docs/UPLOAD_SCHEMA.md §Operations-Vokabular. Nicht abweichen.
"""
from __future__ import annotations

from typing import Any

OPERATIONS: dict[str, dict[str, Any]] = {
    "ocr.standard": {
        "name": "OCR (Standard)",
        "system": "ocrexpert",
        "description": "Standard-OCR mit Text-Output über OCRexpert-Pipeline.",
        "accepted_mimes": [
            "application/pdf",
            "image/png",
            "image/jpeg",
            "image/tiff",
            "image/bmp",
            "image/webp",
        ],
        "requires_prompt": False,
        "estimated_duration_s": 30,
        "category": "ocr",
    },
    "ocr.shadow": {
        "name": "OCR Shadow-Kopie",
        "system": "ocrexpert",
        "description": "Erstellt eine durchsuchbare PDF/A-Shadow-Kopie des Originals.",
        "accepted_mimes": ["application/pdf"],
        "requires_prompt": False,
        "estimated_duration_s": 60,
        "category": "ocr",
    },
    "ocr.direct": {
        "name": "OCR (direkt, Engine-Wahl)",
        "system": "octoboss",
        "description": "OCR direkt auf ausgewählter Engine (Tesseract, Surya, Paddle, EasyOCR).",
        "accepted_mimes": [
            "application/pdf",
            "image/png",
            "image/jpeg",
            "image/tiff",
        ],
        "requires_prompt": False,
        "requires_engine_choice": ["tesseract", "surya", "paddle", "easyocr"],
        "estimated_duration_s": 20,
        "category": "ocr",
    },
    "llm.text": {
        "name": "LLM Text-Analyse",
        "system": "oberon",
        "description": "LLM-Analyse von Text- oder PDF-Dokumenten über Oberon DSGVO-Proxy.",
        "accepted_mimes": [
            "application/pdf",
            "text/plain",
            "text/markdown",
            "text/html",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/rtf",
            "text/rtf",
        ],
        "requires_prompt": True,
        "estimated_duration_s": 20,
        "category": "llm",
    },
    "llm.vision": {
        "name": "LLM Vision",
        "system": "oberon",
        "description": "LLM-Vision-Analyse von Bildern über Oberon Vision-Profil.",
        "accepted_mimes": [
            "image/png",
            "image/jpeg",
            "image/webp",
        ],
        "requires_prompt": True,
        "estimated_duration_s": 15,
        "category": "llm",
    },
    "llm.plan": {
        "name": "LLM Bauplan-Analyse",
        "system": "oberon",
        "description": "DIN 277 + WoFlV Bauplan-Analyse — erkennt Räume, Flächen, Nutzungsarten.",
        "accepted_mimes": [
            "application/pdf",
            "image/png",
            "image/jpeg",
        ],
        "requires_prompt": False,
        "estimated_duration_s": 25,
        "category": "llm",
    },
    "audio.transcribe": {
        "name": "Audio-Transkript",
        "system": "oberon",
        "description": "Whisper-Transkription von Audio-Dateien über Oberon DSGVO-Transcribe.",
        "accepted_mimes": [
            "audio/wav",
            "audio/mpeg",
            "audio/mp4",
            "audio/ogg",
            "audio/flac",
            "audio/aac",
            "audio/x-wav",
            "audio/mp3",
        ],
        "requires_prompt": False,
        "estimated_duration_s": 60,
        "category": "audio",
    },
    "dsgvo.redact": {
        "name": "DSGVO-Redaktion",
        "system": "oberon",
        "description": "PDF oder Bild anonymisieren — personenbezogene Daten werden geschwärzt.",
        "accepted_mimes": [
            "application/pdf",
            "image/png",
            "image/jpeg",
        ],
        "requires_prompt": False,
        "estimated_duration_s": 30,
        "category": "dsgvo",
    },
    "pii.scan": {
        "name": "PII-Scan",
        "system": "oberon",
        "description": "PII-Findings in Text- oder PDF-Dokumenten über Oberon PII-Detect.",
        "accepted_mimes": [
            "application/pdf",
            "text/plain",
            "text/markdown",
        ],
        "requires_prompt": False,
        "estimated_duration_s": 15,
        "category": "dsgvo",
    },
    "pdf.split": {
        "name": "PDF Seiten-Split",
        "system": "ocrexpert",
        "description": "PDF in Einzelseiten aufteilen — liefert ZIP mit Einzel-PDFs.",
        "accepted_mimes": ["application/pdf"],
        "requires_prompt": False,
        "estimated_duration_s": 10,
        "category": "pdf",
    },
}


def compatible_operations(mime: str) -> list[str]:
    """Gibt alle operation_ids zurück, die das gegebene MIME akzeptieren.

    Wird für die Smart-Multi-Drop-Logik verwendet.
    """
    return [
        op_id
        for op_id, cfg in OPERATIONS.items()
        if mime in cfg.get("accepted_mimes", [])
    ]
