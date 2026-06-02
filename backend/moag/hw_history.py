"""
Hardware-Lasthistorie pro Node — timestamp-getriebener In-Memory-Ring-Buffer.

Zweck: GPU/CPU/RAM/VRAM-Verlauf für Sparklines (Tooltip) und das größere
Chart auf der Node-Detail-Seite.

Design-Prinzip (wichtig — heartbeat-ready):
  KEINE Annahme über feste Sample-Abstände. Jeder Datenpunkt trägt seinen
  echten Messzeitpunkt (`hardware_at`, heute = hardware_direct_at, später die
  Heartbeat-Zeit). Dedup erfolgt über genau diesen Timestamp — derselbe
  Messpunkt wird nie doppelt gespeichert, egal wie oft `record()` aufgerufen
  wird. Heute pollt MOAG in festem Takt; sobald wir auf (lastabhängig variabel
  getaktete) Heartbeats umstellen, bleibt dieser Store unverändert korrekt,
  weil er rein timestamp-getrieben dedupt und nach Zeit (nicht Anzahl) altert.

Retention nach Zeit (Default 2h), in-memory — überlebt keinen Container-Neustart
(Persistenz ist als eigene Phase vorgesehen, nicht auf dem Funktionspfad).
"""
from __future__ import annotations

import threading
from collections import deque
from datetime import datetime, timezone
from typing import Any, Optional

# Retention-Fenster pro Node (Sekunden). Buffer altert nach ZEIT, nicht Anzahl.
DEFAULT_RETENTION_S = 7200  # 2h
# Harte Obergrenze pro Node gegen Speicher-Leck bei Heartbeat-Bursts.
DEFAULT_MAX_PER_NODE = 5000


def _parse_iso(value: Any) -> Optional[float]:
    """ISO-8601-Timestamp → Epoch-Sekunden (float), sonst None."""
    if not isinstance(value, str) or not value:
        return None
    txt = value.strip()
    if txt.endswith("Z"):
        txt = txt[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(txt)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.timestamp()


def _num(value: Any) -> Optional[float]:
    """Skalar → float oder None (kein Fake-Wert für fehlende Telemetrie)."""
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    return None


class HwHistoryStore:
    """Ring-Buffer der Hardware-Lasten pro Node, timestamp-getrieben."""

    def __init__(
        self,
        retention_s: int = DEFAULT_RETENTION_S,
        max_per_node: int = DEFAULT_MAX_PER_NODE,
    ) -> None:
        self._retention_s = retention_s
        self._max = max_per_node
        self._data: dict[str, deque[dict[str, Any]]] = {}
        self._last_at: dict[str, str] = {}
        self._lock = threading.Lock()

    def record(self, node_id: str, hardware: dict[str, Any]) -> bool:
        """Hängt einen Sample an, falls er einen NEUEN Messzeitpunkt trägt.

        `hardware` ist der angereicherte hardware-Block (enthält hardware_at +
        die effektiven Lasten). Rückgabe: True wenn ein neuer Punkt gespeichert
        wurde, False bei Dedup/fehlendem Timestamp.
        """
        if not node_id or not isinstance(hardware, dict):
            return False
        at = hardware.get("hardware_at")
        ts = _parse_iso(at)
        if ts is None:
            # Ohne echten Messzeitpunkt KEIN Punkt — wir faken keine Wall-Clock,
            # sonst entstünde eine Pseudo-Zeitachse die bei Heartbeat bricht.
            return False
        with self._lock:
            if self._last_at.get(node_id) == at:
                return False  # exakt derselbe Messpunkt → Dedup
            dq = self._data.setdefault(node_id, deque(maxlen=self._max))
            dq.append(
                {
                    "at": at,
                    "ts": ts,
                    "gpu": _num(hardware.get("gpu_load_percent")),
                    "cpu": _num(hardware.get("cpu_load_percent")),
                    "ram_free_gb": _num(hardware.get("ram_free_gb")),
                    "vram_free_gb": _num(hardware.get("vram_free_gb")),
                }
            )
            self._last_at[node_id] = at
            self._evict(dq, ts)
        return True

    def _evict(self, dq: deque[dict[str, Any]], newest_ts: float) -> None:
        """Verwirft Samples älter als retention_s — relativ zum NEUESTEN Punkt
        (nicht zur Wall-Clock, robust gegen Clock-Skew/Pausen)."""
        cutoff = newest_ts - self._retention_s
        while dq and dq[0]["ts"] < cutoff:
            dq.popleft()

    def series(self, node_id: str, since_s: Optional[int] = None) -> list[dict[str, Any]]:
        """Sample-Liste (chronologisch) ohne interne Felder. `since_s` schneidet
        relativ zum neuesten Punkt zu."""
        with self._lock:
            dq = self._data.get(node_id)
            items = list(dq) if dq else []
        if since_s is not None and items:
            cutoff = items[-1]["ts"] - since_s
            items = [s for s in items if s["ts"] >= cutoff]
        return [
            {
                "at": s["at"],
                "gpu": s["gpu"],
                "cpu": s["cpu"],
                "ram_free_gb": s["ram_free_gb"],
                "vram_free_gb": s["vram_free_gb"],
            }
            for s in items
        ]

    def node_ids(self) -> list[str]:
        with self._lock:
            return list(self._data.keys())


# Modul-Singleton — geteilt zwischen Aufnahme-Poller (api.py) und Endpoint
# (routes_octoboss.py).
HW_HISTORY = HwHistoryStore()
