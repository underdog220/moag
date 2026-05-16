"""
Tests fuer pipeline_hooks (MOAG-Version).

MOAG hat keine In-Process-Pipeline, daher nur:
  - new_job_id() Format-Test
  - plog Singleton vorhanden und aufrufbar
  - install_pipeline_hooks / uninstall_pipeline_hooks als Stubs aufrufbar
"""
from __future__ import annotations

import pytest

from moag.pipeline_hooks import (
    install_pipeline_hooks,
    new_job_id,
    plog,
    uninstall_pipeline_hooks,
)
from moag.events import EventBus
from moag.job_store import JobStore


def test_new_job_id_format():
    """moag-Job-IDs haben Format 'moag-<8 hex-Zeichen>'."""
    jid = new_job_id()
    assert jid.startswith("moag-")
    assert len(jid) == len("moag-") + 8
    # Nur hex-Zeichen nach dem Praefix
    hex_part = jid[len("moag-"):]
    assert all(c in "0123456789abcdef" for c in hex_part)


def test_new_job_id_unique():
    """Jede ID ist eindeutig."""
    ids = {new_job_id() for _ in range(100)}
    assert len(ids) == 100


def test_plog_singleton_exists():
    """plog ist ein Singleton und hat log-Methode."""
    assert plog is not None
    assert hasattr(plog, "log")
    assert hasattr(plog, "enabled")


def test_plog_log_does_not_raise():
    """plog.log() soll keinen Fehler werfen."""
    plog.log("INFO", "test", "Smoke-Test fuer plog")


def test_install_uninstall_no_crash(job_store: JobStore):
    """Stubs sollen aufrufbar sein ohne Fehler."""
    bus = EventBus()
    # install sollte ohne Exception durchlaufen
    install_pipeline_hooks(bus, job_store)
    # uninstall ebenso
    uninstall_pipeline_hooks()


def test_install_twice_no_crash(job_store: JobStore):
    """Zweifaches install darf nicht crashen."""
    bus = EventBus()
    install_pipeline_hooks(bus, job_store)
    install_pipeline_hooks(bus, job_store)
    uninstall_pipeline_hooks()
