"""
Pydantic-Schemas für den Upload-Hub.

Exakt nach docs/UPLOAD_SCHEMA.md §Pydantic-Schemas. Nicht abweichen.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class Upload(BaseModel):
    """Metadaten-Eintrag eines Uploads."""

    upload_id: str = Field(..., description="ULID (26 Zeichen)")
    operation: str = Field(..., description="operation_id aus UPLOAD_SCHEMA.md")
    filename: str = Field(..., description="Original-Filename vom Client")
    size_bytes: int
    mime: str = Field(..., description="Erkanntes MIME (Magic-Bytes + Endung)")
    uploaded_at: datetime = Field(..., description="UTC-Zeitstempel des Uploads")
    status: Literal["queued", "processing", "completed", "failed"]
    params: dict[str, Any] = Field(default_factory=dict, description="Operation-spezifische Parameter")


class UploadResult(BaseModel):
    """Ergebnis nach Abschluss einer Upload-Operation."""

    upload_id: str
    status: Literal["queued", "processing", "completed", "failed"]
    operation: str
    completed_at: datetime | None = None
    duration_ms: int | None = None
    result_summary: str | None = Field(None, description="1-Satz-Zusammenfassung (deutsch)")
    result_payload: dict[str, Any] = Field(default_factory=dict, description="Adapter-spezifische Ergebnisdaten")
    artifact_url: str | None = Field(None, description="/api/v1/uploads/{id}/artifact wenn Output-Datei existiert")
    artifact_mime: str | None = None
    error: str | None = Field(None, description="Fehlermeldung bei status=failed")


class UploadListResponse(BaseModel):
    """Paginierte Liste von Uploads."""

    uploads: list[Upload]
    total: int
    limit: int
    offset: int


class OperationParams(BaseModel):
    """Generischer Wrapper für operation-spezifische Parameter.

    Konkrete Validierung passiert in den jeweiligen Handlern.
    """

    data: dict[str, Any] = Field(default_factory=dict)

    @classmethod
    def from_dict(cls, d: dict[str, Any] | None) -> "OperationParams":
        return cls(data=d or {})
