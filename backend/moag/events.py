"""
In-Memory-EventBus + WebSocket-Bridge fuer MOAG.

Konzept:
  - Sync-publish() schiebt das Event in einen asyncio.Queue pro Subscriber
  - WebSocket-Endpoint registriert/deregistriert sich als Subscriber und
    pumpt die Events an den Client
  - Der EventBus ist Loop-aware: publish() funktioniert von SYNC-Code
    (z.B. Pipeline-Hook) aus, indem er per call_soon_threadsafe in den
    Loop springt.

Event-Typen:
  hub_status_changed, node_health_changed,
  job_started, job_progress, job_engine_done, job_done, job_failed,
  edge_log, settings_changed
"""
from __future__ import annotations

import asyncio
import logging
import threading
from collections import deque
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger("moag.events")

# Maximale Queue-Tiefe pro Subscriber.
_MAX_QUEUE = 500

# Backlog der letzten Events (fuer spaet kommende WebSocket-Subscribers).
_BACKLOG_SIZE = 200


class EventBus:
    """
    Async-Event-Bus mit Sync-Bridge.

    publish_threadsafe(...) wird vom synchronen Pipeline-Hook gerufen und
    plant die Zustellung im asyncio-Loop ein. Subscriber bekommen Events
    via subscribe() -> eigene asyncio.Queue.
    """

    def __init__(self, loop: asyncio.AbstractEventLoop | None = None,
                 max_queue: int = _MAX_QUEUE,
                 backlog_size: int = _BACKLOG_SIZE):
        self._loop = loop
        self._lock = threading.RLock()
        self._subscribers: list[asyncio.Queue] = []
        self._max_queue = max_queue
        # Backlog (Ringpuffer) — wird auch ohne Subscriber gefuellt, damit
        # ein WebSocket-Reconnect die letzten N Events nachholen kann.
        self._backlog: deque[dict[str, Any]] = deque(maxlen=backlog_size)

    # ── Loop-Setup ──

    def attach_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        """Verknuepft den Bus mit einem laufenden Event-Loop."""
        with self._lock:
            self._loop = loop

    @property
    def loop(self) -> asyncio.AbstractEventLoop | None:
        return self._loop

    # ── Subscribe / Unsubscribe ──

    def subscribe(self, replay_backlog: bool = True) -> asyncio.Queue:
        """Liefert eine eigene Queue fuer einen WebSocket-Subscriber.

        replay_backlog=True (Default): die letzten _BACKLOG_SIZE Events
        werden initial in die Queue geschrieben — der Frontend-Client
        sieht sofort den aktuellen Zustand.
        """
        q: asyncio.Queue = asyncio.Queue(maxsize=self._max_queue)
        with self._lock:
            self._subscribers.append(q)
            if replay_backlog:
                for ev in self._backlog:
                    try:
                        q.put_nowait(ev)
                    except asyncio.QueueFull:
                        break
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        with self._lock:
            try:
                self._subscribers.remove(q)
            except ValueError:
                pass

    def subscriber_count(self) -> int:
        with self._lock:
            return len(self._subscribers)

    # ── Publish ──

    def _enqueue(self, event: dict[str, Any]) -> None:
        """Im Loop-Thread: Event in alle Queues legen + Backlog updaten."""
        with self._lock:
            self._backlog.append(event)
            subs = list(self._subscribers)
        for q in subs:
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                # Aelteste rauswerfen, neueste rein — Pipeline darf nie blockieren
                try:
                    q.get_nowait()
                    q.put_nowait(event)
                except Exception:  # pragma: no cover
                    pass

    def publish(self, event_type: str, **payload: Any) -> None:
        """
        Publish aus async-Code (Loop-Thread).
        """
        event: dict[str, Any] = {
            "type": event_type,
            "ts": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ"),
        }
        event.update(payload)
        self._enqueue(event)

    def publish_threadsafe(self, event_type: str, **payload: Any) -> None:
        """
        Publish aus SYNC-Code. Faellt auf direkten enqueue zurueck,
        wenn kein Loop angehaengt — das passiert in Tests.
        """
        event: dict[str, Any] = {
            "type": event_type,
            "ts": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ"),
        }
        event.update(payload)
        loop = self._loop
        if loop is None or loop.is_closed():
            self._enqueue(event)
            return
        try:
            loop.call_soon_threadsafe(self._enqueue, event)
        except RuntimeError:
            self._enqueue(event)

    # ── Backlog ──

    def backlog(self) -> list[dict[str, Any]]:
        with self._lock:
            return list(self._backlog)

    def clear_backlog(self) -> None:
        with self._lock:
            self._backlog.clear()
