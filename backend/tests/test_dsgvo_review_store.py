"""Unit-Tests fuer den MOAG-lokalen DSGVO-Verdikt-Store."""
from __future__ import annotations

import pytest

from moag.dsgvo_review_store import DsgvoReviewStore


@pytest.fixture
def store(tmp_path):
    s = DsgvoReviewStore(tmp_path / "review.db")
    yield s
    s.close()


def test_set_and_get(store):
    rec = store.set_verdict("s1", "geprueft", reviewer="roman", note="sieht gut aus")
    assert rec["verdict"] == "geprueft"
    assert rec["reviewed_at"]
    got = store.get("s1")
    assert got["verdict"] == "geprueft"
    assert got["reviewer"] == "roman"


def test_set_overwrites(store):
    store.set_verdict("s1", "geprueft")
    store.set_verdict("s1", "beanstandet", note="PII durchgerutscht")
    got = store.get("s1")
    assert got["verdict"] == "beanstandet"
    assert got["note"] == "PII durchgerutscht"


def test_invalid_verdict_raises(store):
    with pytest.raises(ValueError):
        store.set_verdict("s1", "halbgar")


def test_clear(store):
    store.set_verdict("s1", "geprueft")
    assert store.clear("s1") is True
    assert store.get("s1") is None
    assert store.clear("s1") is False  # zweites Mal nichts mehr da


def test_all_verdicts_filter(store):
    store.set_verdict("s1", "geprueft")
    store.set_verdict("s2", "beanstandet")
    store.set_verdict("s3", "geprueft")
    alle = store.all_verdicts()
    assert set(alle.keys()) == {"s1", "s2", "s3"}
    teil = store.all_verdicts(["s1", "s3", "unbekannt"])
    assert set(teil.keys()) == {"s1", "s3"}
    assert store.all_verdicts([]) == {}
