"""
Tests fuer SettingsStore — atomic write, BOM-frei, Listener, Defaults.
(Hub-Migration-Funktionen _migrate_hub_labels stammen aus OCRexpert und
 sind in MOAG-settings_store.py nicht migriert — kein Test dafuer.)
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

from moag.models import HubConfig, SettingsUpdate
from moag.settings_store import SettingsStore


def test_default_settings_loaded(settings_store: SettingsStore):
    s = settings_store.get()
    assert len(s.hubs) >= 1
    assert s.default_hub_id is not None
    assert len(s.voting_engines) >= 1


def test_persistence_round_trip(settings_store: SettingsStore, tmp_settings_path: Path):
    # Ersten Hub-ID aus den Defaults holen
    s = settings_store.get()
    second_hub = s.hubs[1].id if len(s.hubs) > 1 else s.hubs[0].id
    settings_store.update(SettingsUpdate(default_hub_id=second_hub))
    assert tmp_settings_path.exists()
    # Erneut laden
    store2 = SettingsStore(tmp_settings_path)
    assert store2.get().default_hub_id == second_hub


def test_no_bom_on_write(settings_store: SettingsStore, tmp_settings_path: Path):
    """UTF-8 darf KEINE BOM enthalten — sonst crasht Core-Python (Roman-Memo)."""
    settings_store.update(SettingsUpdate(voting_strategy="best"))
    raw = tmp_settings_path.read_bytes()
    assert not raw.startswith(b"\xef\xbb\xbf"), "Settings-Datei wurde mit BOM geschrieben"
    # Trotzdem valide JSON
    data = json.loads(raw.decode("utf-8"))
    assert data["voting_strategy"] == "best"


def test_listener_called_on_update(settings_store: SettingsStore):
    received = []
    settings_store.add_listener(lambda s: received.append(s.voting_strategy))
    settings_store.update(SettingsUpdate(voting_strategy="best"))
    assert received == ["best"]


def test_listener_remove(settings_store: SettingsStore):
    received = []

    def fn(s):
        received.append(s.voting_strategy)

    settings_store.add_listener(fn)
    settings_store.remove_listener(fn)
    settings_store.update(SettingsUpdate(voting_strategy="best"))
    assert received == []


def test_set_default_hub_unknown_raises(settings_store: SettingsStore):
    with pytest.raises(KeyError):
        settings_store.set_default_hub("does-not-exist")


def test_replace_hubs(settings_store: SettingsStore):
    new_hubs = [
        HubConfig(id="a", name="A", url="http://a"),
        HubConfig(id="b", name="B", url="http://b"),
    ]
    settings_store.replace_hubs(new_hubs)
    hubs = settings_store.get().hubs
    assert [h.id for h in hubs] == ["a", "b"]


def test_env_override(tmp_settings_path: Path, monkeypatch):
    monkeypatch.setenv("MOAG_DEFAULT_HUB_ID", "nas-test")
    monkeypatch.setenv("MOAG_FALLBACK_TO_LOCAL", "false")
    store = SettingsStore(tmp_settings_path)
    s = store.get()
    assert s.default_hub_id == "nas-test"
    assert s.fallback_to_local is False


def test_bom_in_existing_file_tolerated(tmp_settings_path: Path):
    """Wenn ein User die Datei mit Notepad mit BOM speichert, soll der Store das tolerieren."""
    payload = json.dumps({"default_hub_id": "vdr", "hubs": []}, ensure_ascii=False)
    tmp_settings_path.write_bytes(b"\xef\xbb\xbf" + payload.encode("utf-8"))
    store = SettingsStore(tmp_settings_path)
    assert store.get().default_hub_id == "vdr"


def test_get_response_has_settings_path(settings_store: SettingsStore):
    resp = settings_store.get_response()
    assert resp.settings_path
    assert resp.settings_path.endswith(".json")


def test_atomic_write_no_partial_on_error(settings_store: SettingsStore, tmp_settings_path: Path, monkeypatch):
    """Wenn os.replace fehlschlaegt, darf die Original-Datei nicht beschaedigt sein."""
    settings_store.update(SettingsUpdate(voting_strategy="consensus"))
    original = tmp_settings_path.read_bytes()
    import os as _os

    def boom(*a, **kw):
        raise OSError("simulated failure")

    monkeypatch.setattr(_os, "replace", boom)
    with pytest.raises(OSError):
        settings_store.update(SettingsUpdate(voting_strategy="best"))
    # Datei darf nicht angefasst sein
    assert tmp_settings_path.read_bytes() == original


def test_doctype_gewichte_persistenz(settings_store: SettingsStore, monkeypatch):
    """Slider speichert beide Gewichte."""
    monkeypatch.delenv("MOAG_DOCTYPE_TEXT_GEWICHT", raising=False)
    monkeypatch.delenv("MOAG_DOCTYPE_LAYOUT_GEWICHT", raising=False)

    res = settings_store.update(SettingsUpdate(
        doctype_text_gewicht=0.85,
        doctype_layout_gewicht=0.15,
    ))
    assert res.doctype_text_gewicht == 0.85
    assert res.doctype_layout_gewicht == 0.15


def test_doctype_gewichte_default(settings_store: SettingsStore):
    """Defaults aus Pydantic — 0.7 / 0.3."""
    s = settings_store.get()
    assert s.doctype_text_gewicht == 0.7
    assert s.doctype_layout_gewicht == 0.3
