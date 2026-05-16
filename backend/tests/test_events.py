"""
Tests fuer EventBus.
(Nur moag.events — keine ocrexpert.pipeline_events Bridge in MOAG)
"""
from __future__ import annotations

import asyncio
import threading

import pytest

from moag.events import EventBus


def test_publish_to_backlog():
    bus = EventBus()
    bus.publish("test", value=1)
    bus.publish("test", value=2)
    backlog = bus.backlog()
    assert len(backlog) == 2
    assert backlog[0]["type"] == "test"
    assert backlog[1]["value"] == 2


@pytest.mark.asyncio
async def test_subscribe_replays_backlog():
    bus = EventBus()
    bus.publish("hub_status_changed", hub_id="vdr", status="ok")
    q = bus.subscribe(replay_backlog=True)
    ev = await asyncio.wait_for(q.get(), timeout=1.0)
    assert ev["type"] == "hub_status_changed"
    assert ev["hub_id"] == "vdr"


@pytest.mark.asyncio
async def test_subscribe_receives_new_events():
    bus = EventBus()
    bus.attach_loop(asyncio.get_running_loop())
    q = bus.subscribe(replay_backlog=False)
    bus.publish("job_started", job_id="ocr-x", filename="a.pdf")
    ev = await asyncio.wait_for(q.get(), timeout=1.0)
    assert ev["job_id"] == "ocr-x"


@pytest.mark.asyncio
async def test_publish_threadsafe_from_thread():
    """Sync-Code muss Events ueber call_soon_threadsafe schicken."""
    bus = EventBus()
    bus.attach_loop(asyncio.get_running_loop())
    q = bus.subscribe(replay_backlog=False)

    def worker():
        bus.publish_threadsafe("job_done", job_id="moag-tsafe", consensus_score=0.9)

    threading.Thread(target=worker).start()
    ev = await asyncio.wait_for(q.get(), timeout=1.0)
    assert ev["type"] == "job_done"
    assert ev["job_id"] == "moag-tsafe"


@pytest.mark.asyncio
async def test_subscribe_unsubscribe():
    bus = EventBus()
    bus.attach_loop(asyncio.get_running_loop())
    q = bus.subscribe(replay_backlog=False)
    assert bus.subscriber_count() == 1
    bus.unsubscribe(q)
    assert bus.subscriber_count() == 0


def test_clear_backlog():
    bus = EventBus()
    bus.publish("a")
    bus.publish("b")
    assert len(bus.backlog()) == 2
    bus.clear_backlog()
    assert bus.backlog() == []


@pytest.mark.asyncio
async def test_queue_overflow_drops_oldest():
    bus = EventBus(max_queue=3)
    bus.attach_loop(asyncio.get_running_loop())
    q = bus.subscribe(replay_backlog=False)
    # 5 Events, Queue-Tiefe nur 3 — die aeltesten werden verdraengt
    for i in range(5):
        bus.publish("e", n=i)
    received = []
    while not q.empty():
        received.append((await q.get())["n"])
    # Es sollen 3 Events ankommen, die juengsten zu sehen
    assert len(received) == 3
    # Juengste ist drin
    assert 4 in received
