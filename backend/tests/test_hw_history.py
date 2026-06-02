"""Tests für den timestamp-getriebenen Hardware-Lasthistorie-Store.

Kernverhalten: Dedup nach echtem Messzeitpunkt (nicht nach Poll-Takt),
Retention nach Zeit (nicht Anzahl), keine Wall-Clock-Fakes ohne Timestamp.
"""
from __future__ import annotations

from moag.hw_history import HwHistoryStore


def _hw(at, gpu=10.0, cpu=20.0, ram=30.0, vram=8.0):
    return {
        "hardware_at": at,
        "gpu_load_percent": gpu,
        "cpu_load_percent": cpu,
        "ram_free_gb": ram,
        "vram_free_gb": vram,
    }


def test_record_speichert_neuen_messpunkt():
    s = HwHistoryStore()
    assert s.record("n1", _hw("2026-06-02T10:00:00Z")) is True
    series = s.series("n1")
    assert len(series) == 1
    assert series[0]["gpu"] == 10.0
    assert series[0]["at"] == "2026-06-02T10:00:00Z"


def test_dedup_gleicher_timestamp_wird_verworfen():
    # MOAG pollt mehrfach, aber hardware_at hat sich nicht geändert → ein Punkt.
    s = HwHistoryStore()
    assert s.record("n1", _hw("2026-06-02T10:00:00Z", gpu=10.0)) is True
    assert s.record("n1", _hw("2026-06-02T10:00:00Z", gpu=99.0)) is False
    assert s.record("n1", _hw("2026-06-02T10:00:00Z", gpu=50.0)) is False
    series = s.series("n1")
    assert len(series) == 1
    assert series[0]["gpu"] == 10.0  # erster Wert bleibt, keine Überschreibung


def test_variable_abstaende_werden_als_eigene_punkte_gespeichert():
    # Heartbeat-Szenario: unregelmäßige Abstände, jeder neue Timestamp zählt.
    s = HwHistoryStore()
    s.record("n1", _hw("2026-06-02T10:00:00Z"))
    s.record("n1", _hw("2026-06-02T10:00:03Z"))  # +3s
    s.record("n1", _hw("2026-06-02T10:00:30Z"))  # +27s
    series = s.series("n1")
    assert [p["at"] for p in series] == [
        "2026-06-02T10:00:00Z",
        "2026-06-02T10:00:03Z",
        "2026-06-02T10:00:30Z",
    ]


def test_ohne_timestamp_kein_punkt():
    s = HwHistoryStore()
    assert s.record("n1", _hw(None)) is False
    assert s.record("n1", {"gpu_load_percent": 5.0}) is False  # gar kein hardware_at
    assert s.series("n1") == []


def test_retention_altert_nach_zeit_relativ_zum_neuesten():
    # Fenster 100s: alles älter als (neuester - 100s) fliegt raus.
    s = HwHistoryStore(retention_s=100)
    s.record("n1", _hw("2026-06-02T10:00:00Z"))
    s.record("n1", _hw("2026-06-02T10:00:50Z"))
    s.record("n1", _hw("2026-06-02T10:03:00Z"))  # neuester; 10:00:00 ist nun 180s alt → raus
    series = s.series("n1")
    ats = [p["at"] for p in series]
    assert "2026-06-02T10:00:00Z" not in ats
    assert "2026-06-02T10:03:00Z" in ats


def test_since_s_schneidet_relativ_zum_neuesten():
    s = HwHistoryStore()
    s.record("n1", _hw("2026-06-02T10:00:00Z"))
    s.record("n1", _hw("2026-06-02T10:05:00Z"))
    s.record("n1", _hw("2026-06-02T10:10:00Z"))
    recent = s.series("n1", since_s=120)  # nur letzte 2min vor neuestem
    assert [p["at"] for p in recent] == ["2026-06-02T10:10:00Z"]


def test_none_lasten_bleiben_none():
    # AMD/WhiteStar: gpu_load fehlt → None, kein Fake.
    s = HwHistoryStore()
    s.record("n1", _hw("2026-06-02T10:00:00Z", gpu=None, vram=None))
    p = s.series("n1")[0]
    assert p["gpu"] is None
    assert p["vram_free_gb"] is None
    assert p["cpu"] == 20.0


def test_getrennte_nodes():
    s = HwHistoryStore()
    s.record("n1", _hw("2026-06-02T10:00:00Z", gpu=11.0))
    s.record("n2", _hw("2026-06-02T10:00:00Z", gpu=22.0))
    assert s.series("n1")[0]["gpu"] == 11.0
    assert s.series("n2")[0]["gpu"] == 22.0
    assert set(s.node_ids()) == {"n1", "n2"}
