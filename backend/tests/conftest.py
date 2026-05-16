"""
Gemeinsame pytest-Fixtures fuer die MOAG-Tests.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Iterator

import pytest

from moag.events import EventBus
from moag.hub_client import HubClient
from moag.job_store import JobStore
from moag.settings_store import SettingsStore


@pytest.fixture
def tmp_settings_path(tmp_path: Path) -> Path:
    return tmp_path / "moag_settings.json"


@pytest.fixture
def tmp_jobs_db(tmp_path: Path) -> Path:
    return tmp_path / "jobs.db"


@pytest.fixture
def tmp_upload_dir(tmp_path: Path) -> Path:
    d = tmp_path / "uploads"
    d.mkdir(exist_ok=True)
    return d


@pytest.fixture
def settings_store(tmp_settings_path: Path) -> Iterator[SettingsStore]:
    # ENV-Variablen ausblenden, damit die Defaults stabil sind
    keep_env = {}
    for k in list(os.environ):
        if k.startswith("MOAG_") or k.startswith("OCTOBOSS_"):
            keep_env[k] = os.environ.pop(k)
    try:
        store = SettingsStore(tmp_settings_path)
        yield store
    finally:
        # ENV restaurieren
        for k, v in keep_env.items():
            os.environ[k] = v


@pytest.fixture
def job_store(tmp_jobs_db: Path) -> Iterator[JobStore]:
    store = JobStore(tmp_jobs_db)
    try:
        yield store
    finally:
        store.close()


@pytest.fixture
def event_bus() -> EventBus:
    return EventBus()


@pytest.fixture
def hub_client(event_bus: EventBus) -> HubClient:
    return HubClient(event_bus=event_bus, timeout=0.5, poll_interval=60.0)
