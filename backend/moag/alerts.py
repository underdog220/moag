"""
MOAG Alert-Center — leitet aktive Alerts aus den SystemStatus-Objekten ab.

Severity:
  critical = System nicht ok (down / Adapter-Fehler)
  warning  = erreichbar aber degradiert (ok=True, score < WARNING_SCORE_THRESHOLD)
  (ok=True und score >= Schwelle => kein Alert)

Alert-Key: stabiler, kompakter Hash aus (system_id, severity, summary). Aendert
sich severity oder summary, ist es ein NEUER Alert — ein bestehendes Acknowledge
erlischt damit bewusst (der quittierte Zustand ist nicht mehr derselbe).
"""
from __future__ import annotations

import hashlib
from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from moag.aggregator import SYSTEM_INFO
from moag.schemas import SystemStatus

# Ab diesem Score gilt ein erreichbares System als gesund (kein Warning-Alert).
WARNING_SCORE_THRESHOLD = 50

Severity = Literal["critical", "warning"]

_SEVERITY_RANK = {"critical": 0, "warning": 1}


class Alert(BaseModel):
    """Ein einzelner aktiver Alert fuer das Alert-Center."""
    key: str
    system_id: str
    system_name: str
    group: str
    severity: Severity
    summary: str
    error: str | None = None
    score: int
    fetched_at: datetime
    acknowledged: bool = False
    acknowledged_at: datetime | None = None


def alert_key(system_id: str, severity: str, summary: str) -> str:
    """Stabiler 16-stelliger Hash, der einen konkreten Alert-Zustand identifiziert."""
    raw = f"{system_id}|{severity}|{summary}"
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]


def derive_alerts(statuses: list[SystemStatus]) -> list[Alert]:
    """Leitet Alerts (critical + warning) aus den SystemStatus ab.

    Reihenfolge: critical vor warning, innerhalb nach Score aufsteigend
    (schlimmster zuerst). Gesunde Systeme (ok + score >= Schwelle) liefern
    keinen Alert. Acknowledged-Flag wird hier NICHT gesetzt — das macht der
    Endpoint anhand des AlertAckStore.
    """
    alerts: list[Alert] = []
    for s in statuses:
        if s.ok and s.score >= WARNING_SCORE_THRESHOLD:
            continue
        severity: Severity = "critical" if not s.ok else "warning"
        name, group = SYSTEM_INFO.get(s.system_id, (s.system_id, "Unbekannt"))
        alerts.append(Alert(
            key=alert_key(s.system_id, severity, s.summary),
            system_id=s.system_id,
            system_name=name,
            group=group,
            severity=severity,
            summary=s.summary,
            error=s.error,
            score=s.score,
            fetched_at=s.fetched_at,
        ))
    alerts.sort(key=lambda a: (_SEVERITY_RANK[a.severity], a.score))
    return alerts
