"""
MOAG — Mother of All GUIs.

Zentrales Browser-Cockpit fuer die Sebald-Helper-Suite:
Oberon + OctoBoss + SonOfSETI + OCRexpert + NasDominator +
qnapbackup + Custos + Panopticor.

Hard-Fork aus OCRexpert-GUI (ocrexpert-gui:0.7.1), Phase 1.
"""
from __future__ import annotations

try:
    from importlib.metadata import version as _metadata_version, PackageNotFoundError
    __version__: str = _metadata_version("moag")
except Exception:
    # Fallback wenn Paket nicht installiert ist (z.B. roher Checkout ohne pip install)
    __version__ = "0.0.0-dev"

# Bewusst KEINE FastAPI-Imports auf Modul-Ebene — Library-Charakter bleibt.
__all__ = ["__version__"]
