"""
MOAG — Mother of All GUIs.

Zentrales Browser-Cockpit fuer die Sebald-Helper-Suite:
Oberon + OctoBoss + SonOfSETI + OCRexpert + NasDominator +
qnapbackup + Custos + Panopticor.

Hard-Fork aus OCRexpert-GUI (ocrexpert-gui:0.7.1), Phase 1.
"""
from __future__ import annotations

__version__ = "0.1.0"

# Bewusst KEINE FastAPI-Imports auf Modul-Ebene — Library-Charakter bleibt.
__all__ = ["__version__"]
