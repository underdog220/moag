"""
Tests fuer JobStore — CRUD + Filter + Pagination.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from moag.job_store import JobStore


def test_create_and_get(job_store: JobStore):
    j = job_store.create("ocr-aaa", "demo.pdf", file_path="/tmp/demo.pdf", page_total=3)
    assert j.job_id == "ocr-aaa"
    assert j.status == "pending"
    assert j.page_total == 3
    fetched = job_store.get("ocr-aaa")
    assert fetched is not None
    assert fetched.filename == "demo.pdf"


def test_get_missing_returns_none(job_store: JobStore):
    assert job_store.get("does-not-exist") is None


def test_mark_running_progress_done(job_store: JobStore):
    job_store.create("ocr-1", "a.pdf", page_total=4)
    j = job_store.mark_running("ocr-1")
    assert j is not None and j.status == "running"

    j = job_store.mark_progress("ocr-1", page_done=2)
    assert j.progress_pct == 50
    assert j.page_done == 2

    j = job_store.mark_done(
        "ocr-1",
        doctype="Rechnung",
        doctype_confidence=0.9,
        consensus_score=0.95,
        engines_used=["tesseract", "easyocr"],
    )
    assert j.status == "done"
    assert j.progress_pct == 100
    assert j.doctype == "Rechnung"
    assert j.engines_used == ["tesseract", "easyocr"]


def test_mark_failed(job_store: JobStore):
    job_store.create("ocr-fail", "bad.pdf")
    j = job_store.mark_failed("ocr-fail", "PDF malformed")
    assert j.status == "failed"
    assert "malformed" in (j.error or "")


def test_list_filter_by_status(job_store: JobStore):
    job_store.create("ocr-a", "a.pdf")
    job_store.mark_done("ocr-a", doctype="Rechnung")
    job_store.create("ocr-b", "b.pdf")
    job_store.mark_failed("ocr-b", "x")
    job_store.create("ocr-c", "c.pdf")

    rows, total, filtered = job_store.list(status="done")
    assert {r.job_id for r in rows} == {"ocr-a"}
    assert total == 3
    assert filtered == 1


def test_list_filter_by_doctype(job_store: JobStore):
    job_store.create("ocr-a", "a.pdf")
    job_store.mark_done("ocr-a", doctype="Rechnung")
    job_store.create("ocr-b", "b.pdf")
    job_store.mark_done("ocr-b", doctype="Mietvertrag")
    rows, total, filtered = job_store.list(doctype="Mietvertrag")
    assert [r.job_id for r in rows] == ["ocr-b"]
    assert filtered == 1


def test_list_pagination(job_store: JobStore):
    for i in range(15):
        job_store.create(f"ocr-{i:02d}", f"file_{i}.pdf")
    rows, _, _ = job_store.list(limit=5, offset=0)
    assert len(rows) == 5
    rows2, _, _ = job_store.list(limit=5, offset=5)
    assert len(rows2) == 5
    # Keine Ueberlappung
    assert {r.job_id for r in rows}.isdisjoint({r.job_id for r in rows2})


def test_list_filter_by_since(job_store: JobStore):
    job_store.create("ocr-old", "old.pdf")
    # Manueller Trick: alten started_at setzen
    with job_store._lock:
        job_store._conn.execute(
            "UPDATE jobs SET started_at = ? WHERE job_id = ?",
            ("2020-01-01T00:00:00.000000Z", "ocr-old"),
        )
    job_store.create("ocr-new", "new.pdf")
    since = datetime.now(timezone.utc) - timedelta(hours=1)
    rows, _, filtered = job_store.list(since=since)
    assert filtered == 1
    assert rows[0].job_id == "ocr-new"


def test_delete(job_store: JobStore):
    job_store.create("ocr-x", "x.pdf")
    assert job_store.delete("ocr-x") is True
    assert job_store.delete("ocr-x") is False
    assert job_store.get("ocr-x") is None


def test_engines_used_persisted_as_json(job_store: JobStore):
    job_store.create("ocr-e", "e.pdf")
    job_store.mark_done("ocr-e", engines_used=["tess", "easy", "paddle"])
    j = job_store.get("ocr-e")
    assert j.engines_used == ["tess", "easy", "paddle"]


def test_update_unknown_field_ignored(job_store: JobStore):
    job_store.create("ocr-u", "u.pdf")
    j = job_store.update("ocr-u", filename="renamed.pdf", invented_field="x")
    assert j.filename == "renamed.pdf"


def test_progress_with_explicit_total(job_store: JobStore):
    job_store.create("ocr-t", "t.pdf")
    j = job_store.mark_progress("ocr-t", page_done=3, page_total=10)
    assert j.page_total == 10
    assert j.progress_pct == 30
