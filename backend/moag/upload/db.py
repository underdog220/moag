"""
Upload-Hub — DB-Provisioning, Connection-Pool, Schema-Migration.

Priorität:
  1. ENV MOAG_DB_URL gesetzt → direkt nutzen (lokale Entwicklung)
  2. Cache-Datei ~/.moag/db.json (MOAG_DB_CACHE_PATH) vorhanden → Creds lesen
  3. Oberon DB-Broker POST /api/v2/database/provision → Creds holen + cachen
  4. Fallback: SQLite unter ~/.moag/uploads.db (kein Oberon erreichbar)

PostgreSQL-Zugriff via psycopg (async). Pool via psycopg-pool wenn verfügbar.
SQLite-Fallback via aiosqlite oder synchron via sqlite3 (aiosqlite optional).
"""
from __future__ import annotations

import json
import logging
import os
import sqlite3
import stat
from pathlib import Path
from typing import Any

logger = logging.getLogger("moag.upload.db")

# Dateigröße-Schwelle für BYTEA vs. Filesystem-Storage (5 MB)
BYTEA_THRESHOLD = 5 * 1024 * 1024

# ENV-Schlüssel
ENV_DB_URL = "MOAG_DB_URL"
ENV_DB_CACHE_PATH = "MOAG_DB_CACHE_PATH"
ENV_OBERON_BASE_URL = "MOAG_OBERON_BASE_URL"
ENV_OBERON_TOKEN = "MOAG_OBERON_TOKEN"

# Globaler Connection-Pool (wird in ensure_pool() gesetzt)
_pool: Any = None
# Globaler SQLite-Fallback-Pfad (wird in _init_sqlite gesetzt)
_sqlite_path: Path | None = None
# True wenn wir im SQLite-Fallback-Modus laufen
_using_sqlite: bool = False


# ── Hilfsfunktionen ───────────────────────────────────────────────────────────


def _default_cache_path() -> Path:
    raw = os.environ.get(ENV_DB_CACHE_PATH, "")
    if raw:
        return Path(raw)
    # Im Container: /data/moag/db.json falls /data beschreibbar
    data_path = Path("/data/moag/db.json")
    if data_path.parent.exists():
        return data_path
    return Path.home() / ".moag" / "db.json"


def _default_sqlite_path() -> Path:
    raw = os.environ.get(ENV_DB_CACHE_PATH, "")
    if raw:
        return Path(raw).parent / "uploads.db"
    data_path = Path("/data/moag/uploads.db")
    if data_path.parent.exists():
        return data_path
    return Path.home() / ".moag" / "uploads.db"


def _read_cache() -> dict[str, str] | None:
    """Liest gecachte DB-Credentials. Gibt None zurück wenn kein Cache."""
    p = _default_cache_path()
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception as exc:
        logger.warning("DB-Cache unlesbar (%s): %s", p, exc)
        return None


def _write_cache(creds: dict[str, str]) -> None:
    """Schreibt DB-Credentials in Cache-Datei (chmod 600)."""
    p = _default_cache_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(creds, indent=2), encoding="utf-8")
    try:
        p.chmod(0o600)
    except Exception:
        pass  # Windows kennt chmod nicht — ignorieren


def _jdbc_to_psycopg(jdbc_url: str) -> str:
    """Konvertiert jdbcUrl → psycopg-kompatible URL.

    Beispiel:
      jdbc:postgresql://192.168.200.169:5432/oberon_moag
      →  postgresql://192.168.200.169:5432/oberon_moag
    """
    if jdbc_url.startswith("jdbc:"):
        return jdbc_url[len("jdbc:"):]
    return jdbc_url


async def provision_db() -> str | None:
    """Ruft Oberon DB-Broker auf und cached die Credentials.

    Gibt die psycopg-Connection-URL zurück, oder None bei Fehler.
    """
    oberon_url = os.environ.get(ENV_OBERON_BASE_URL, "http://192.168.200.169:17900")
    token = os.environ.get(ENV_OBERON_TOKEN, "")
    endpoint = f"{oberon_url.rstrip('/')}/api/v2/database/provision"
    headers: dict[str, str] = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    try:
        import httpx
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                endpoint,
                json={"appName": "moag"},
                headers=headers,
            )
        if resp.status_code == 200:
            data = resp.json()
            jdbc = data.get("jdbcUrl", "")
            user = data.get("username", "")
            pw = data.get("password", "")
            if not jdbc:
                logger.error("Oberon DB-Broker: leere jdbcUrl in Antwort: %s", data)
                return None
            conn_url = f"postgresql://{user}:{pw}@{jdbc.split('://')[-1]}" if user else _jdbc_to_psycopg(jdbc)
            creds = {"jdbcUrl": jdbc, "username": user, "password": pw, "conn_url": conn_url}
            _write_cache(creds)
            logger.info("DB-Provisioning erfolgreich: %s", jdbc)
            return conn_url
        else:
            logger.error("Oberon DB-Broker HTTP %s: %s", resp.status_code, resp.text[:200])
            return None
    except Exception as exc:
        logger.warning("Oberon DB-Broker nicht erreichbar: %s", exc)
        return None


async def _resolve_conn_url() -> str | None:
    """Ermittelt die PostgreSQL-Connection-URL (ENV → Cache → Broker)."""
    # 1. ENV-Override
    env_url = os.environ.get(ENV_DB_URL, "")
    if env_url:
        logger.debug("Nutze DB-URL aus ENV %s", ENV_DB_URL)
        return env_url

    # 2. Cache
    cached = _read_cache()
    if cached and cached.get("conn_url"):
        logger.debug("Nutze gecachte DB-Credentials")
        return cached["conn_url"]

    # 3. Oberon Broker
    return await provision_db()


_schema_ensured: bool = False


async def ensure_pool() -> None:
    """Initialisiert den globalen Connection-Pool (einmalig beim Startup).

    Fällt auf SQLite zurück wenn PostgreSQL nicht erreichbar.
    Ruft ensure_schema() automatisch auf (idempotent).
    """
    global _pool, _using_sqlite, _sqlite_path, _schema_ensured

    if _pool is not None or _using_sqlite:
        if not _schema_ensured:
            await ensure_schema()
        return  # Bereits initialisiert

    conn_url = await _resolve_conn_url()

    if conn_url:
        try:
            from psycopg_pool import AsyncConnectionPool  # type: ignore[import]
            from psycopg.rows import dict_row  # type: ignore[import]
            _pool = AsyncConnectionPool(
                conninfo=conn_url,
                min_size=1,
                max_size=5,
                open=False,
                kwargs={"row_factory": dict_row},
            )
            await _pool.open(wait=True, timeout=8.0)
            logger.info("PostgreSQL-Pool initialisiert")
            await ensure_schema()
            _schema_ensured = True
            return
        except ImportError:
            logger.warning(
                "psycopg-pool nicht installiert — versuche psycopg direkt"
            )
        except Exception as exc:
            logger.warning("PostgreSQL-Pool-Fehler: %s — SQLite-Fallback", exc)

        # psycopg ohne Pool
        try:
            import psycopg  # type: ignore[import]
            # Speichere conn_url für get_conn()
            _pool = {"_conn_url": conn_url, "_type": "psycopg_simple"}
            logger.info("PostgreSQL ohne Pool (psycopg_simple)")
            await ensure_schema()
            _schema_ensured = True
            return
        except ImportError:
            logger.warning("psycopg nicht installiert — SQLite-Fallback")
        except Exception as exc:
            logger.warning("psycopg-Verbindung fehlgeschlagen: %s — SQLite-Fallback", exc)

    # SQLite-Fallback
    _using_sqlite = True
    _sqlite_path = _default_sqlite_path()
    _sqlite_path.parent.mkdir(parents=True, exist_ok=True)
    logger.warning(
        "SQLite-Fallback aktiv: %s (PostgreSQL/Oberon nicht erreichbar)",
        _sqlite_path,
    )

    # Schema automatisch nach Pool-Init sicherstellen
    await ensure_schema()
    _schema_ensured = True


class AsyncSQLiteConn:
    """Minimaler async-kompatibler Wrapper um sqlite3.Connection.

    Wird als Fallback genutzt wenn psycopg nicht verfügbar ist.
    Alle Operationen sind synchron — in asyncio-Kontext ausreichend für V1-Lasten.
    """

    def __init__(self, conn: sqlite3.Connection):
        self._conn = conn

    async def execute(self, sql: str, params: tuple = ()) -> sqlite3.Cursor:
        return self._conn.execute(sql, params)

    async def fetchone(self, sql: str, params: tuple = ()) -> sqlite3.Row | None:
        return self._conn.execute(sql, params).fetchone()

    async def fetchall(self, sql: str, params: tuple = ()) -> list[sqlite3.Row]:
        return self._conn.execute(sql, params).fetchall()

    async def commit(self) -> None:
        self._conn.commit()

    async def close(self) -> None:
        self._conn.close()

    async def __aenter__(self) -> "AsyncSQLiteConn":
        return self

    async def __aexit__(self, *exc: object) -> None:
        self._conn.commit()
        self._conn.close()


async def get_conn() -> Any:
    """Liefert eine async-kompatible DB-Connection.

    Gibt AsyncSQLiteConn zurück wenn im SQLite-Fallback-Modus.
    Gibt eine psycopg AsyncConnection zurück wenn PostgreSQL verfügbar.
    """
    global _pool, _using_sqlite, _sqlite_path

    if _using_sqlite:
        if _sqlite_path is None:
            raise RuntimeError("SQLite-Fallback aktiv aber kein Pfad gesetzt")
        conn = sqlite3.connect(str(_sqlite_path))
        conn.row_factory = sqlite3.Row
        return AsyncSQLiteConn(conn)

    if _pool is None:
        await ensure_pool()

    if _using_sqlite:
        return await get_conn()

    if isinstance(_pool, dict) and _pool.get("_type") == "psycopg_simple":
        import psycopg  # type: ignore[import]
        from psycopg.rows import dict_row
        return await psycopg.AsyncConnection.connect(
            _pool["_conn_url"], row_factory=dict_row
        )

    # psycopg_pool: row_factory ist bereits via Pool-kwargs={"row_factory": dict_row} gesetzt
    return _pool.connection()


def _schema_sql_postgres() -> str:
    """Liest schema.sql (PostgreSQL-Syntax)."""
    sql_path = Path(__file__).resolve().parent / "schema.sql"
    return sql_path.read_text(encoding="utf-8")


def _schema_sql_sqlite() -> str:
    """SQLite-kompatibles Schema — JSONB→TEXT, TIMESTAMPTZ→DATETIME, BYTEA→BLOB."""
    return """
CREATE TABLE IF NOT EXISTS uploads (
    upload_id        VARCHAR(26) PRIMARY KEY,
    operation        VARCHAR(40) NOT NULL,
    filename         VARCHAR(500) NOT NULL,
    mime             VARCHAR(100),
    size_bytes       INTEGER NOT NULL,
    uploaded_at      DATETIME NOT NULL DEFAULT (datetime('now')),
    completed_at     DATETIME,
    status           VARCHAR(20) NOT NULL DEFAULT 'queued',
    params           TEXT NOT NULL DEFAULT '{}',
    result_summary   TEXT,
    result_payload   TEXT,
    artifact_path    TEXT,
    artifact_mime    VARCHAR(100),
    error            TEXT,
    duration_ms      INTEGER
);

CREATE INDEX IF NOT EXISTS idx_uploads_status ON uploads(status);
CREATE INDEX IF NOT EXISTS idx_uploads_operation ON uploads(operation);
CREATE INDEX IF NOT EXISTS idx_uploads_uploaded_at ON uploads(uploaded_at DESC);

CREATE TABLE IF NOT EXISTS upload_files (
    upload_id        VARCHAR(26) PRIMARY KEY REFERENCES uploads(upload_id) ON DELETE CASCADE,
    storage_kind     VARCHAR(20) NOT NULL,
    content          BLOB,
    filesystem_path  TEXT
);
"""


async def ensure_schema() -> None:
    """Führt das Schema-Script beim Startup aus (idempotent)."""
    if _using_sqlite:
        if _sqlite_path is None:
            raise RuntimeError("SQLite-Fallback aktiv aber kein Pfad gesetzt")
        conn = sqlite3.connect(str(_sqlite_path))
        conn.row_factory = sqlite3.Row
        try:
            conn.executescript(_schema_sql_sqlite())
            conn.commit()
            logger.info("SQLite-Schema sichergestellt: %s", _sqlite_path)
        finally:
            conn.close()
        return

    # PostgreSQL
    try:
        if isinstance(_pool, dict) and _pool.get("_type") == "psycopg_simple":
            import psycopg  # type: ignore[import]
            async with await psycopg.AsyncConnection.connect(_pool["_conn_url"]) as conn:
                await conn.execute(_schema_sql_postgres())
                await conn.commit()
        else:
            async with _pool.connection() as conn:
                await conn.execute(_schema_sql_postgres())
                await conn.commit()
        logger.info("PostgreSQL-Schema sichergestellt")
    except Exception as exc:
        logger.error("Schema-Migration fehlgeschlagen: %s", exc)
        raise
