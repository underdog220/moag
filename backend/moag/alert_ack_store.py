"""
SQLite-Store fuer Alert-Acknowledgements (MOAG Alert-Center).

Pfad: ~/.moag/alerts.db (User-Scope) bzw. ENV MOAG_ALERTS_DB.

Schema (alert_acks):
  alert_key        TEXT PRIMARY KEY   (stabiler Hash aus system_id|severity|summary)
  system_id        TEXT
  severity         TEXT
  summary          TEXT
  acknowledged_at  TEXT (ISO-8601)
  acknowledged_by  TEXT NULL

Acknowledge ist zustandsgebunden: aendert sich der Alert (anderer key, weil
Severity oder Summary wechselt), greift das alte Ack nicht mehr. prune() raeumt
Acks fuer nicht mehr aktive Alerts auf, damit die Tabelle nicht unbegrenzt waechst.
"""
from __future__ import annotations

import logging
import os
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

logger = logging.getLogger("moag.alert_ack_store")


def default_ack_db_path() -> Path:
    raw = os.environ.get("MOAG_ALERTS_DB", "").strip()
    if raw:
        return Path(raw).expanduser().resolve()
    return Path.home() / ".moag" / "alerts.db"


_SCHEMA = """
CREATE TABLE IF NOT EXISTS alert_acks (
    alert_key        TEXT PRIMARY KEY,
    system_id        TEXT NOT NULL,
    severity         TEXT NOT NULL,
    summary          TEXT NOT NULL,
    acknowledged_at  TEXT NOT NULL,
    acknowledged_by  TEXT
);
"""


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def _from_iso(v: str | None) -> datetime | None:
    if not v:
        return None
    try:
        return datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except ValueError:
        return None


class AlertAckStore:
    """SQLite-Persistenz fuer quittierte Alerts. Thread-safe."""

    def __init__(self, path: Path | None = None):
        self._path = path or default_ack_db_path()
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

    def ack(self, alert_key: str, system_id: str, severity: str,
            summary: str, by: str | None = None) -> None:
        """Quittiert einen Alert (idempotent — re-ack ueberschreibt Zeitstempel)."""
        with self._lock:
            self._conn.execute(
                """INSERT INTO alert_acks
                   (alert_key, system_id, severity, summary, acknowledged_at, acknowledged_by)
                   VALUES (?, ?, ?, ?, ?, ?)
                   ON CONFLICT(alert_key) DO UPDATE SET
                     acknowledged_at = excluded.acknowledged_at,
                     acknowledged_by = excluded.acknowledged_by""",
                (alert_key, system_id, severity, summary, _now_iso(), by),
            )

    def unack(self, alert_key: str) -> bool:
        """Hebt eine Quittierung auf. True wenn es einen Eintrag gab."""
        with self._lock:
            cur = self._conn.execute(
                "DELETE FROM alert_acks WHERE alert_key = ?", (alert_key,)
            )
            return cur.rowcount > 0

    def acked_at(self, alert_keys: Iterable[str]) -> dict[str, datetime]:
        """Liefert {alert_key: acknowledged_at} fuer die quittierten unter den gefragten Keys."""
        keys = list(alert_keys)
        if not keys:
            return {}
        placeholders = ",".join("?" for _ in keys)
        with self._lock:
            rows = self._conn.execute(
                f"SELECT alert_key, acknowledged_at FROM alert_acks WHERE alert_key IN ({placeholders})",
                keys,
            ).fetchall()
        out: dict[str, datetime] = {}
        for r in rows:
            ts = _from_iso(r["acknowledged_at"])
            if ts is not None:
                out[r["alert_key"]] = ts
        return out

    def prune(self, active_keys: Iterable[str]) -> int:
        """Loescht Acks, deren Alert nicht mehr aktiv ist. Liefert Anzahl geloeschter Zeilen."""
        active = set(active_keys)
        with self._lock:
            existing = [r["alert_key"] for r in
                        self._conn.execute("SELECT alert_key FROM alert_acks").fetchall()]
            stale = [k for k in existing if k not in active]
            if not stale:
                return 0
            placeholders = ",".join("?" for _ in stale)
            self._conn.execute(
                f"DELETE FROM alert_acks WHERE alert_key IN ({placeholders})", stale
            )
            return len(stale)
