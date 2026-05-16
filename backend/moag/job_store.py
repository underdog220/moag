"""
SQLite-Job-Store fuer MOAG.

Pfad: ~/.moag/jobs.db (User-Scope, kein Repo)

Schema (jobs):
  job_id           TEXT PRIMARY KEY
  filename         TEXT
  status           TEXT  ('pending' | 'running' | 'done' | 'failed')
  progress_pct     INTEGER
  page_total       INTEGER
  page_done        INTEGER
  started_at       TEXT  (ISO-8601)
  finished_at      TEXT NULL
  doctype          TEXT NULL
  doctype_confidence REAL NULL
  pii_count        INTEGER NULL
  consensus_score  REAL NULL
  engines_used     TEXT  (JSON-Array)
  nodes_used       TEXT  (JSON-Array)
  error            TEXT NULL
  file_path        TEXT NULL
  output_path      TEXT NULL
  result_json      TEXT NULL
"""
from __future__ import annotations

import json
import logging
import os
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from .models import JobStatus

logger = logging.getLogger("moag.job_store")


def default_db_path() -> Path:
    raw = os.environ.get("MOAG_JOBS_DB", "").strip()
    if raw:
        return Path(raw).expanduser().resolve()
    return Path.home() / ".moag" / "jobs.db"


_SCHEMA = """
CREATE TABLE IF NOT EXISTS jobs (
    job_id            TEXT PRIMARY KEY,
    filename          TEXT NOT NULL,
    status            TEXT NOT NULL,
    progress_pct      INTEGER DEFAULT 0,
    page_total        INTEGER DEFAULT 0,
    page_done         INTEGER DEFAULT 0,
    started_at        TEXT NOT NULL,
    finished_at       TEXT,
    doctype           TEXT,
    doctype_confidence REAL,
    pii_count         INTEGER,
    consensus_score   REAL,
    engines_used      TEXT DEFAULT '[]',
    nodes_used        TEXT DEFAULT '[]',
    error             TEXT,
    file_path         TEXT,
    output_path       TEXT,
    result_json       TEXT
);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_started ON jobs(started_at);
CREATE INDEX IF NOT EXISTS idx_jobs_doctype ON jobs(doctype);
"""


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def _to_iso(v: Any) -> Optional[str]:
    if v is None:
        return None
    if isinstance(v, datetime):
        if v.tzinfo is None:
            v = v.replace(tzinfo=timezone.utc)
        return v.strftime("%Y-%m-%dT%H:%M:%S.%fZ")
    return str(v)


def _from_iso(v: Any) -> Optional[datetime]:
    if not v:
        return None
    if isinstance(v, datetime):
        return v
    try:
        return datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except ValueError:
        return None


class JobStore:
    """
    SQLite-Persistenz fuer Job-History. Thread-safe.
    """

    def __init__(self, path: Path | None = None):
        self._path = path or default_db_path()
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(self._path, check_same_thread=False, isolation_level=None)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA synchronous=NORMAL")
        self._conn.executescript(_SCHEMA)

    @property
    def path(self) -> Path:
        return self._path

    def close(self) -> None:
        with self._lock:
            try:
                self._conn.close()
            except Exception:  # pragma: no cover
                pass

    def create(
        self,
        job_id: str,
        filename: str,
        file_path: str | None = None,
        page_total: int = 0,
    ) -> JobStatus:
        now = _now_iso()
        with self._lock:
            self._conn.execute(
                """INSERT INTO jobs
                   (job_id, filename, status, progress_pct, page_total, page_done,
                    started_at, file_path)
                   VALUES (?, ?, 'pending', 0, ?, 0, ?, ?)""",
                (job_id, filename, page_total, now, file_path),
            )
        return self.get(job_id)  # type: ignore[return-value]

    def update(self, job_id: str, **fields: Any) -> Optional[JobStatus]:
        """Generisches Update — nur bekannte Spalten werden uebernommen."""
        if not fields:
            return self.get(job_id)
        allowed = {
            "filename", "status", "progress_pct", "page_total", "page_done",
            "finished_at", "doctype", "doctype_confidence", "pii_count",
            "consensus_score", "engines_used", "nodes_used", "error",
            "file_path", "output_path", "result_json",
        }
        sets: list[str] = []
        params: list[Any] = []
        for k, v in fields.items():
            if k not in allowed:
                continue
            if k in ("engines_used", "nodes_used") and isinstance(v, list):
                v = json.dumps(v, ensure_ascii=False)
            elif k == "finished_at":
                v = _to_iso(v)
            sets.append(f"{k} = ?")
            params.append(v)
        if not sets:
            return self.get(job_id)
        params.append(job_id)
        with self._lock:
            self._conn.execute(
                f"UPDATE jobs SET {', '.join(sets)} WHERE job_id = ?",
                params,
            )
        return self.get(job_id)

    def mark_running(self, job_id: str, page_total: int | None = None) -> Optional[JobStatus]:
        fields: dict[str, Any] = {"status": "running"}
        if page_total is not None:
            fields["page_total"] = page_total
        return self.update(job_id, **fields)

    def mark_progress(
        self,
        job_id: str,
        page_done: int,
        page_total: int | None = None,
    ) -> Optional[JobStatus]:
        pct = 0
        total = page_total
        with self._lock:
            row = self._conn.execute(
                "SELECT page_total FROM jobs WHERE job_id = ?", (job_id,)
            ).fetchone()
            if row is not None:
                total = page_total if page_total is not None else row["page_total"]
        if total and total > 0:
            pct = int((page_done / total) * 100)
        fields: dict[str, Any] = {
            "status": "running",
            "page_done": page_done,
            "progress_pct": min(100, max(0, pct)),
        }
        if page_total is not None:
            fields["page_total"] = page_total
        return self.update(job_id, **fields)

    def mark_done(
        self,
        job_id: str,
        *,
        doctype: str | None = None,
        doctype_confidence: float | None = None,
        pii_count: int | None = None,
        consensus_score: float | None = None,
        engines_used: list[str] | None = None,
        nodes_used: list[str] | None = None,
        output_path: str | None = None,
        result_json: str | None = None,
    ) -> Optional[JobStatus]:
        return self.update(
            job_id,
            status="done",
            progress_pct=100,
            finished_at=_now_iso(),
            doctype=doctype,
            doctype_confidence=doctype_confidence,
            pii_count=pii_count,
            consensus_score=consensus_score,
            engines_used=engines_used or [],
            nodes_used=nodes_used or [],
            output_path=output_path,
            result_json=result_json,
        )

    def mark_failed(self, job_id: str, error: str) -> Optional[JobStatus]:
        return self.update(
            job_id,
            status="failed",
            finished_at=_now_iso(),
            error=error[:1000],
        )

    def get(self, job_id: str) -> Optional[JobStatus]:
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM jobs WHERE job_id = ?", (job_id,)
            ).fetchone()
        if row is None:
            return None
        return self._row_to_model(row)

    def list(
        self,
        *,
        status: str | None = None,
        doctype: str | None = None,
        since: datetime | None = None,
        until: datetime | None = None,
        limit: int = 100,
        offset: int = 0,
        order: str = "started_at DESC",
    ) -> tuple[list[JobStatus], int, int]:
        """
        Listet Jobs mit Filter. Liefert (rows, total, filtered).
        """
        clauses: list[str] = []
        params: list[Any] = []
        if status:
            clauses.append("status = ?")
            params.append(status)
        if doctype:
            clauses.append("doctype = ?")
            params.append(doctype)
        if since is not None:
            clauses.append("started_at >= ?")
            params.append(_to_iso(since))
        if until is not None:
            clauses.append("started_at <= ?")
            params.append(_to_iso(until))
        where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
        order_safe = "started_at DESC"
        if order in ("started_at DESC", "started_at ASC", "finished_at DESC", "finished_at ASC"):
            order_safe = order
        sql = f"SELECT * FROM jobs {where} ORDER BY {order_safe} LIMIT ? OFFSET ?"
        with self._lock:
            total = self._conn.execute("SELECT COUNT(*) FROM jobs").fetchone()[0]
            count_sql = f"SELECT COUNT(*) FROM jobs {where}"
            filtered = self._conn.execute(count_sql, params).fetchone()[0]
            rows = self._conn.execute(sql, [*params, limit, offset]).fetchall()
        return [self._row_to_model(r) for r in rows], int(total), int(filtered)

    def delete(self, job_id: str) -> bool:
        with self._lock:
            cur = self._conn.execute("DELETE FROM jobs WHERE job_id = ?", (job_id,))
            return cur.rowcount > 0

    @staticmethod
    def _row_to_model(row: sqlite3.Row) -> JobStatus:
        engines_used = []
        nodes_used = []
        try:
            engines_used = json.loads(row["engines_used"] or "[]")
        except Exception:
            pass
        try:
            nodes_used = json.loads(row["nodes_used"] or "[]")
        except Exception:
            pass
        return JobStatus(
            job_id=row["job_id"],
            filename=row["filename"],
            status=row["status"],
            progress_pct=int(row["progress_pct"] or 0),
            page_total=int(row["page_total"] or 0),
            page_done=int(row["page_done"] or 0),
            started_at=_from_iso(row["started_at"]) or datetime.now(timezone.utc),
            finished_at=_from_iso(row["finished_at"]),
            doctype=row["doctype"],
            doctype_confidence=row["doctype_confidence"],
            pii_count=row["pii_count"],
            consensus_score=row["consensus_score"],
            engines_used=engines_used,
            nodes_used=nodes_used,
            error=row["error"],
            file_path=row["file_path"],
            output_path=row["output_path"],
        )
