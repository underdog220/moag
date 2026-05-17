"""
MOAG Actions-Package — Registry-Befuellung durch Import aller Aktionsmodule.

Beim Import dieses Pakets werden alle @register-Dekoratoren ausgefuehrt
und ACTION_REGISTRY ist vollstaendig befuellt.

Neue echte Aktionen: neues Modul anlegen + hier importieren.
Neue Stubs: in stubs.py eintragen.
"""
# Reihenfolge: echte Aktionen zuerst, dann Stubs (uebersichtlicher in Registry-Dump)
from moag.actions import oberon_smoke          # noqa: F401
from moag.actions import ocrexpert_health      # noqa: F401
from moag.actions import octoboss_cluster_status  # noqa: F401
from moag.actions import stubs                 # noqa: F401

from moag.actions.registry import ACTION_REGISTRY  # noqa: F401 — Re-Export fuer Tests

__all__ = ["ACTION_REGISTRY"]
