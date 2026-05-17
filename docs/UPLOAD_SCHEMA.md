# MOAG Upload-Hub — Schema-Spec (verbindlich)

Stand 2026-05-17. Gilt für Frontend + Backend + DB. **Nicht selbst erfinden, nicht abweichen.** Drift-Schutz wie bei `docs/ACTIONS_SCHEMA.md`.

## Grundidee

MOAG bekommt eine **dritte Top-Achse `/upload`** neben Übersicht + Aktionen. Zwei Ebenen:

1. **Smart-Multi-Drop oben:** Datei rein → MOAG erkennt Format → schlägt kompatible Operations als Karten vor → User wählt → Operation läuft.
2. **Spezialisierte Operation-Karten unten:** pro Operation eigene Drop-Zone + Multi-File-Support + spezifische Parameter (Prompt, Engine, Profil).

Beide Ebenen schicken denselben `POST /api/v1/upload`.

## Operations-Vokabular

| operation_id | System | Beschreibung | Akzeptierte MIMEs | Pflicht-Params |
|---|---|---|---|---|
| `ocr.standard` | OCRexpert | Standard-OCR mit Text-Output | PDF, PNG, JPG, TIFF, BMP, WEBP | – |
| `ocr.shadow` | OCRexpert | PDF/A-Shadow-Kopie | PDF | – |
| `ocr.direct` | OctoBoss-Dispatch | OCR direkt auf Engine | PDF, PNG, JPG, TIFF | `engine` ∈ {tesseract,surya,paddle,easyocr} |
| `llm.text` | Oberon DSGVO-Proxy | LLM-Analyse von Text/PDF | PDF, TXT, MD, HTML, DOCX, RTF | `prompt` (string) |
| `llm.vision` | Oberon Vision | LLM-Vision auf Bild | PNG, JPG, WEBP | `prompt` (string) |
| `llm.plan` | Oberon Plan-Analyse | DIN 277 + WoFlV Bauplan | PDF, PNG, JPG | – |
| `audio.transcribe` | Oberon DSGVO-Transcribe | Whisper-Transkript | WAV, MP3, M4A, OGG, FLAC, AAC | – |
| `dsgvo.redact` | Oberon Visual Redaction | PDF/Bild anonymisieren | PDF, PNG, JPG | – |
| `pii.scan` | Oberon PII-Detect | PII-Findings in Text/PDF | PDF, TXT, MD | – |
| `pdf.split` | OCRexpert | PDF in Einzelseiten splitten | PDF | – |

## Format-Liste (Maximum, V1)

| Kategorie | MIMEs | Endungen |
|---|---|---|
| PDF | application/pdf | .pdf |
| Bild | image/png · image/jpeg · image/tiff · image/bmp · image/webp · image/gif · image/heic · image/svg+xml | .png .jpg .jpeg .tif .tiff .bmp .webp .gif .heic .svg |
| Office | docx · xlsx · pptx · odt · ods · odp · rtf · epub | .docx .xlsx .pptx .odt .ods .odp .rtf .epub |
| Text | text/plain · text/markdown · text/html · text/csv · application/json · application/xml · application/x-yaml · text/x-log | .txt .md .html .csv .json .xml .yaml .yml .log |
| Audio | audio/wav · audio/mpeg · audio/mp4 · audio/ogg · audio/flac · audio/aac | .wav .mp3 .m4a .ogg .flac .aac .wma |
| Code | text/x-python · text/javascript · text/x-typescript · text/x-go · text/x-rust · text/x-java · text/x-c · text/x-c++ · text/x-shellscript | .py .js .ts .go .rs .java .c .cpp .sh .ps1 |
| E-Mail | message/rfc822 · application/vnd.ms-outlook | .eml .msg |

V1-Limit: **200 MB pro Datei** (Frontend warnt, Backend lehnt > Limit mit HTTP 413 ab). Chunking ist Backlog (Phase Z).

## Pydantic-Schemas (Backend) / TypeScript-Mirror (Frontend)

### `Upload` (Metadaten-Eintrag)

```python
class Upload(BaseModel):
    upload_id: str                       # ULID (26 chars)
    operation: str                       # operation_id aus Tabelle oben
    filename: str                        # Original-Filename vom Client
    size_bytes: int
    mime: str                            # erkanntes MIME (Magic-Bytes + Endung)
    uploaded_at: datetime                # UTC
    status: Literal["queued", "processing", "completed", "failed"]
    params: dict                         # operation-spezifische Parameter (z.B. {"prompt": "...", "engine": "tesseract"})
```

### `UploadResult` (nach Operation-Abschluss)

```python
class UploadResult(BaseModel):
    upload_id: str
    status: Literal["queued", "processing", "completed", "failed"]
    operation: str
    completed_at: datetime | None
    duration_ms: int | None
    result_summary: str | None           # 1-Satz-Zusammenfassung (deutsch)
    result_payload: dict                 # adapter-spezifische strukturierte Ergebnisdaten
    artifact_url: str | None             # /api/v1/uploads/{id}/artifact wenn Output-Datei existiert
    artifact_mime: str | None
    error: str | None                    # bei status=failed
```

### `UploadListResponse`

```python
class UploadListResponse(BaseModel):
    uploads: list[Upload]
    total: int
    limit: int
    offset: int
```

## HTTP-Endpoints

| Methode | Pfad | Zweck |
|---|---|---|
| `POST` | `/api/v1/upload` | Multipart-Upload mit Operation-Trigger |
| `GET` | `/api/v1/uploads?status=...&operation=...&limit=N&offset=N` | Liste mit Filter |
| `GET` | `/api/v1/uploads/{upload_id}` | Detail (Upload-Metadaten) |
| `GET` | `/api/v1/uploads/{upload_id}/result` | Result-Payload |
| `GET` | `/api/v1/uploads/{upload_id}/artifact` | Output-Datei-Download (z.B. PDF/A) |
| `DELETE` | `/api/v1/uploads/{upload_id}` | Upload + Result + Artifact löschen |

### POST `/api/v1/upload` Request

Multipart/form-data mit Feldern:
- `file` (binary, Pflicht, ≤ 200 MB)
- `operation` (string, Pflicht, einer der operation_ids)
- `params` (JSON-string, optional — operation-spezifisch)

### POST `/api/v1/upload` Response

V1 ist synchron für ≤ 30s-Operations, sonst async-Pattern:
- Sync-Fall (Standard): `200 OK` mit kompletter `UploadResult`
- Async-Fall (große Files, Audio, Vision): `202 Accepted` mit `Upload` (status=processing), Polling via `GET /uploads/{id}/result`

## Persistenz (PostgreSQL via Oberon DB-Broker)

### DB-Provisioning beim ersten Start

MOAG ruft `POST {OBERON_BASE_URL}/api/v2/database/provision` mit `{"appName": "moag"}`. Oberon antwortet:
```json
{
  "jdbcUrl": "jdbc:postgresql://192.168.200.169:5432/oberon_moag",
  "username": "moag_svc",
  "password": "<generated>"
}
```

MOAG cached die Credentials in `~/.moag/db.json` (chmod 600) oder Settings-Volume. Bei Container-Restart wird Provision-Endpoint erneut gerufen — Oberon liefert dieselben Creds (idempotent).

### Tabellen

```sql
CREATE TABLE uploads (
    upload_id        VARCHAR(26) PRIMARY KEY,        -- ULID
    operation        VARCHAR(40) NOT NULL,
    filename         VARCHAR(500) NOT NULL,
    mime             VARCHAR(100),
    size_bytes       BIGINT NOT NULL,
    uploaded_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at     TIMESTAMPTZ,
    status           VARCHAR(20) NOT NULL DEFAULT 'queued',
    params           JSONB NOT NULL DEFAULT '{}',
    result_summary   TEXT,
    result_payload   JSONB,
    artifact_path    TEXT,                            -- NULL wenn kein Output, sonst File-System-Pfad
    artifact_mime    VARCHAR(100),
    error            TEXT,
    duration_ms      INT
);
CREATE INDEX idx_uploads_status ON uploads(status);
CREATE INDEX idx_uploads_operation ON uploads(operation);
CREATE INDEX idx_uploads_uploaded_at ON uploads(uploaded_at DESC);

CREATE TABLE upload_files (
    upload_id        VARCHAR(26) PRIMARY KEY REFERENCES uploads(upload_id) ON DELETE CASCADE,
    storage_kind     VARCHAR(20) NOT NULL,            -- 'bytea' (< 5MB) | 'filesystem' (>= 5MB)
    content          BYTEA,                            -- nur wenn storage_kind='bytea'
    filesystem_path  TEXT                              -- nur wenn storage_kind='filesystem' — z.B. /data/moag/uploads/<id>
);
```

Migration via Alembic (Backlog) oder einfacher Init-Script in V1.

### File-Storage-Strategie

- **< 5 MB:** BYTEA in `upload_files.content` (DB-native, einfach)
- **>= 5 MB:** Filesystem unter `/data/moag/uploads/<upload_id>` (gemountetes Volume im Container), Pfad in `upload_files.filesystem_path`
- DELETE-Endpoint räumt beide (DB + Filesystem)

## Frontend-Operations-Registry

`frontend/src/lib/uploadOperations.ts`:
```typescript
export interface UploadOperation {
  id: string;                              // "ocr.standard"
  name: string;                            // "OCR (Standard)"
  system: string;                          // "ocrexpert"
  description: string;                     // 1-2 Sätze
  accepted_mimes: string[];                // ["application/pdf", "image/png", ...]
  requires_prompt: boolean;
  requires_engine_choice?: string[];       // ["tesseract", "surya", ...] für ocr.direct
  estimated_duration_s: number;
  category: "ocr" | "llm" | "audio" | "dsgvo" | "pdf";
}

export const UPLOAD_OPERATIONS: UploadOperation[] = [
  // genau die 10 aus der Operations-Vokabular-Tabelle
];

export function compatibleOperations(mime: string): UploadOperation[] {
  return UPLOAD_OPERATIONS.filter(op => op.accepted_mimes.includes(mime));
}
```

Backend muss dieses Vokabular spiegeln (`backend/moag/upload/operations.py` mit identischem `OPERATIONS`-Konstant).

## ULID-Generierung

Backend nutzt `python-ulid` (oder fallback `secrets.token_urlsafe(20)` falls Lib nicht da). Vorteil ULID: zeitlich sortierbar = Default-Anzeige-Reihenfolge.

## Was NICHT in V1

- Chunking für > 200 MB → Phase Z
- ZIP-Auto-Entpacken → Phase Z
- Multi-User-Isolation (alle Uploads werden global gespeichert) → Phase 9+
- Upload-Quota pro System → Phase 9+
- Async-Long-Running mit Webhooks → V1 ist synchron + Polling
- Resumable-Upload → Phase Z
