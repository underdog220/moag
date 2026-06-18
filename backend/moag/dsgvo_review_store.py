"""
SQLite-Store fuer DSGVO-Revisions-Verdikte (MOAG-lokal).

Haelt pro Document-Store-Session (Oberon `/api/v2/dsgvo/documents`) den
menschlichen Revisions-Status: `geprueft` oder `beanstandet`, mit Pruefer,
Notiz und Zeitpunkt.

MOAG-lokal als Zwischenloesung: das Verdikt soll spaeter in Oberons
DSGVO-Compliance-Record wandern (Oberon-CR
`2026-06-18-moag-dsgvo-revision-verdikt-retention.md`). Solange das nicht
umgesetzt ist, lebt das Verdikt hier.

Pfad: ~/.moag/review.db (User-Scope) bzw. ENV MOAG_REVIEW_DB.

Schema (dsgvo_review):
  session_id   TEXT PRIMARY KEY  (Document-Store-Session-ID)
  verdict      TEXT              ("geprueft" | "beanstandet")
  reviewer     TEXT NULL
  note         TEXT NULL
  reviewed_at  TEXT (ISO-8601)
"""
from __future__ import annotations

import logging
import os
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

logger = logging.getLogger("moag.dsgvo_review_store")

# Erlaubte Verdikt-Werte (alles andere = ungueltig). "offen" loescht den Eintrag.
VALID_VERDICTS = {"geprueft", "beanstandet"}


def default_review_db_path() -> Path:
    raw = os.environ.get("MOAG_REVIEW_DB", "").strip()
    if raw:
        return Path(raw).expanduser().resolve()
    return Path.home() / ".moag" / "review.db"


_SCHEMA = """
CREATE TABLE IF NOT EXISTS dsgvo_review (
    session_id   TEXT PRIMARY KEY,
    verdict      TEXT NOT NULL,
    reviewer     TEXT,
    note         TEXT,
    reviewed_at  TEXT NOT NULL
);
"""


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


class DsgvoReviewStore:
    """SQLite-Persistenz fuer Revisions-Verdikte. Thread-safe."""

    def __init__(self, path: Path | None = None):
        self._path = path or default_review_db_path()
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

    def set_verdict(
        self, session_id: str, verdict: str, reviewer: str | None = None,
        note: str | None = None,
    ) -> dict:
        """Setzt das Verdikt (idempotent — re-set ueberschreibt). Gibt den Datensatz zurueck.

        Wirft ValueError bei unbekanntem Verdikt.
        """
        if verdict not in VALID_VERDICTS:
            raise ValueError(f"Ungueltiges Verdikt: {verdict!r} (erlaubt: {sorted(VALID_VERDICTS)})")
        ts = _now_iso()
        with self._lock:
            self._conn.execute(
                """INSERT INTO dsgvo_review (session_id, verdict, reviewer, note, reviewed_at)
                   VALUES (?, ?, ?, ?, ?)
                   ON CONFLICT(session_id) DO UPDATE SET
                     verdict = excluded.verdict,
                     reviewer = excluded.reviewer,
                     note = excluded.note,
                     reviewed_at = excluded.reviewed_at""",
                (session_id, verdict, reviewer, note, ts),
            )
        return {
            "session_id": session_id, "verdict": verdict,
            "reviewer": reviewer, "note": note, "reviewed_at": ts,
        }

    def clear(self, session_id: str) -> bool:
        """Setzt eine Session wieder auf 'offen' (loescht den Verdikt-Eintrag).

        True wenn es einen Eintrag gab.
        """
        with self._lock:
            cur = self._conn.execute(
                "DELETE FROM dsgvo_review WHERE session_id = ?", (session_id,)
            )
            return cur.rowcount > 0

    def get(self, session_id: str) -> dict | None:
        """Verdikt einer einzelnen Session oder None."""
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM dsgvo_review WHERE session_id = ?", (session_id,)
            ).fetchone()
        return dict(row) if row else None

    def all_verdicts(self, session_ids: Iterable[str] | None = None) -> dict[str, dict]:
        """Liefert {session_id: {verdict, reviewer, note, reviewed_at}}.

        Ohne Filter: alle gespeicherten Verdikte (der Store ist klein — nur
        bereits revidierte Sessions). Mit session_ids: nur die gefragten.
        """
        with self._lock:
            if session_ids is None:
                rows = self._conn.execute("SELECT * FROM dsgvo_review").fetchall()
            else:
                ids = list(session_ids)
                if not ids:
                    return {}
                placeholders = ",".join("?" for _ in ids)
                rows = self._conn.execute(
                    f"SELECT * FROM dsgvo_review WHERE session_id IN ({placeholders})", ids
                ).fetchall()
        out: dict[str, dict] = {}
        for r in rows:
            d = dict(r)
            out[d["session_id"]] = {
                "verdict": d["verdict"], "reviewer": d["reviewer"],
                "note": d["note"], "reviewed_at": d["reviewed_at"],
            }
        return out
