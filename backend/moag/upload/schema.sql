-- Upload-Hub DB-Schema
-- Idempotent: CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS
-- Exakt nach docs/UPLOAD_SCHEMA.md §Tabellen

CREATE TABLE IF NOT EXISTS uploads (
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
    artifact_path    TEXT,                            -- NULL wenn kein Output, sonst Filesystem-Pfad
    artifact_mime    VARCHAR(100),
    error            TEXT,
    duration_ms      INT
);

CREATE INDEX IF NOT EXISTS idx_uploads_status ON uploads(status);
CREATE INDEX IF NOT EXISTS idx_uploads_operation ON uploads(operation);
CREATE INDEX IF NOT EXISTS idx_uploads_uploaded_at ON uploads(uploaded_at DESC);

CREATE TABLE IF NOT EXISTS upload_files (
    upload_id        VARCHAR(26) PRIMARY KEY REFERENCES uploads(upload_id) ON DELETE CASCADE,
    storage_kind     VARCHAR(20) NOT NULL,            -- 'bytea' (< 5MB) | 'filesystem' (>= 5MB)
    content          BYTEA,                            -- nur wenn storage_kind='bytea'
    filesystem_path  TEXT                              -- nur wenn storage_kind='filesystem'
);
