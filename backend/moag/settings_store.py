"""
Settings-Persistenz fuer MOAG.

Pfad: ~/.moag/settings.json (User-Scope, nicht im Repo)
Format: UTF-8 OHNE BOM

ENV-Override-Reihenfolge:
  defaults < settings.json < ENV-Variablen

Listener-Pattern:
  Beim POST /api/settings wird in_memory aktualisiert + atomic write +
  alle registrierten Listener werden aufgerufen.
"""
from __future__ import annotations

import json
import logging
import os
import threading
from pathlib import Path
from typing import Any, Callable

from .models import HubConfig, Settings, SettingsResponse, SettingsUpdate

logger = logging.getLogger("moag.settings_store")


def _default_settings_dict() -> dict[str, Any]:
    """Default-Konfiguration fuer MOAG."""
    return {
        "hubs": [
            {"id": "vdr",      "name": "VDR-Production", "url": "http://192.168.200.71:18765"},
            {"id": "nas",      "name": "NAS-Legacy",     "url": "http://192.168.200.169:8765"},
        ],
        "default_hub_id": "vdr",
        "cluster_enabled": True,
        "voting_engines": ["tesseract", "easyocr", "paddleocr", "surya"],
        "voting_strategy": "consensus",
        "fallback_to_local": True,
        "pipeline_log_enabled": True,
        "oberon_base_url": "http://192.168.200.169:17900",
        "ocrexpert_base_url": "http://192.168.200.71:17810",
        "nasdominator_base_url": "http://192.168.200.169:9090",
        "custos_base_url": "http://192.168.200.71:17890",
        "panopticor_base_url": "http://127.0.0.1:8787",
    }


def default_settings_path() -> Path:
    """~/.moag/settings.json — kann via ENV MOAG_SETTINGS_PATH ueberschrieben werden."""
    raw = os.environ.get("MOAG_SETTINGS_PATH", "").strip()
    if raw:
        return Path(raw).expanduser().resolve()
    return Path.home() / ".moag" / "settings.json"


def _atomic_write_json(path: Path, data: dict[str, Any]) -> None:
    """Atomic write: erst temp, dann os.replace. Immer UTF-8 OHNE BOM."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    payload = json.dumps(data, ensure_ascii=False, indent=2)
    tmp.write_text(payload, encoding="utf-8")
    os.replace(tmp, path)


def _read_json(path: Path) -> dict[str, Any]:
    """Liest JSON; toleriert UTF-8-BOM falls Datei manuell editiert wurde."""
    raw = path.read_bytes()
    if raw.startswith(b"\xef\xbb\xbf"):
        raw = raw[3:]
    text = raw.decode("utf-8")
    return json.loads(text)


def _apply_env_overrides(d: dict[str, Any]) -> dict[str, Any]:
    """Wendet MOAG_*-ENV-Variablen-Overrides auf das Settings-Dict an."""
    out = dict(d)
    env_pairs = {
        "MOAG_DEFAULT_HUB_ID":   "default_hub_id",
        "MOAG_API_TOKEN":        "api_token",
        "MOAG_VOTING_STRATEGY":  "voting_strategy",
        "MOAG_OBERON_BASE_URL":  "oberon_base_url",
        "MOAG_OBERON_TOKEN":     "oberon_token",
        "MOAG_OCREXPERT_BASE_URL": "ocrexpert_base_url",
        "MOAG_SONOFSETI_TOKEN":  "sonofseti_token",
        "MOAG_NASDOMINATOR_BASE_URL": "nasdominator_base_url",
        "MOAG_NASDOMINATOR_USER":     "nasdominator_user",
        "MOAG_NASDOMINATOR_PASSWORD": "nasdominator_password",
        "MOAG_CUSTOS_BASE_URL":  "custos_base_url",
        "MOAG_PANOPTICOR_BASE_URL": "panopticor_base_url",
    }
    for env_key, settings_key in env_pairs.items():
        v = os.environ.get(env_key, "").strip()
        if v:
            out[settings_key] = v

    bool_pairs = {
        "MOAG_CLUSTER_ENABLED":      "cluster_enabled",
        "MOAG_FALLBACK_TO_LOCAL":    "fallback_to_local",
        "MOAG_PIPELINE_LOG_ENABLED": "pipeline_log_enabled",
    }
    for env_key, settings_key in bool_pairs.items():
        v = os.environ.get(env_key, "").strip().lower()
        if v in ("1", "true", "yes", "ja"):
            out[settings_key] = True
        elif v in ("0", "false", "no", "nein"):
            out[settings_key] = False

    return out


class SettingsStore:
    """
    In-Memory-Cache + Datei-Persistenz mit Listener-Pattern.

    Threading: alle Operationen sind thread-safe (RLock).
    """

    def __init__(self, path: Path | None = None):
        self._path = path or default_settings_path()
        self._lock = threading.RLock()
        self._listeners: list[Callable[[Settings], None]] = []
        self._settings: Settings = self._load()

    def _load(self) -> Settings:
        merged = _default_settings_dict()
        if self._path.exists():
            try:
                file_data = _read_json(self._path)
                if isinstance(file_data, dict):
                    merged.update(file_data)
            except Exception as e:
                logger.warning("settings.json unlesbar (%s) — nutze Defaults", e)
        merged = _apply_env_overrides(merged)
        return Settings(**merged)

    def reload(self) -> Settings:
        with self._lock:
            self._settings = self._load()
            self._notify(self._settings)
            return self._settings

    def save(self) -> None:
        with self._lock:
            data = self._settings.model_dump(mode="json")
            _atomic_write_json(self._path, data)

    @property
    def path(self) -> Path:
        return self._path

    def get(self) -> Settings:
        with self._lock:
            return self._settings.model_copy(deep=True)

    def get_response(self) -> SettingsResponse:
        with self._lock:
            base = self._settings.model_dump()
            # Passwort-Maskierung: in der API-Response nur Platzhalter ausgeben
            if base.get("nasdominator_password"):
                base["nasdominator_password"] = "***"
            return SettingsResponse(
                **base,
                active_env={
                    k: os.environ[k]
                    for k in (
                        "MOAG_DEFAULT_HUB_ID",
                        "MOAG_API_TOKEN",
                        "MOAG_CLUSTER_ENABLED",
                        "MOAG_PIPELINE_LOG_ENABLED",
                        "MOAG_OBERON_BASE_URL",
                        "MOAG_OBERON_TOKEN",
                        "MOAG_OCREXPERT_BASE_URL",
                    )
                    if k in os.environ
                },
                settings_path=str(self._path),
            )

    def update(self, patch: SettingsUpdate) -> Settings:
        with self._lock:
            current = self._settings.model_dump()
            patch_data = patch.model_dump(exclude_unset=True, exclude_none=False)
            for k, v in patch_data.items():
                if v is not None:
                    current[k] = v
            self._settings = Settings(**current)
            try:
                self.save()
            except Exception as e:
                logger.error("Settings-Persistenz fehlgeschlagen: %s", e)
                raise
            self._notify(self._settings)
            return self._settings.model_copy(deep=True)

    def replace_hubs(self, hubs: list[HubConfig]) -> Settings:
        return self.update(SettingsUpdate(hubs=hubs))

    def set_default_hub(self, hub_id: str) -> Settings:
        with self._lock:
            ids = {h.id for h in self._settings.hubs}
            if hub_id not in ids:
                raise KeyError(f"Hub-ID '{hub_id}' nicht in Settings (bekannt: {sorted(ids)})")
        return self.update(SettingsUpdate(default_hub_id=hub_id))

    def add_listener(self, fn: Callable[[Settings], None]) -> None:
        with self._lock:
            if fn not in self._listeners:
                self._listeners.append(fn)

    def remove_listener(self, fn: Callable[[Settings], None]) -> None:
        with self._lock:
            if fn in self._listeners:
                self._listeners.remove(fn)

    def _notify(self, settings: Settings) -> None:
        with self._lock:
            snapshot = list(self._listeners)
        for fn in snapshot:
            try:
                fn(settings.model_copy(deep=True))
            except Exception as e:  # pragma: no cover
                logger.warning("Settings-Listener failed: %s", e)
