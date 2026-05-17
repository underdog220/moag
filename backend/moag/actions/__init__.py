"""
MOAG Actions-Package -- Registry-Befuellung durch Import aller Aktionsmodule.

Beim Import dieses Pakets werden alle @register-Dekoratoren ausgefuehrt
und ACTION_REGISTRY ist vollstaendig befuellt.

Neue echte Aktionen: neues Modul anlegen + hier importieren.
Neue Stubs: in stubs.py eintragen.
"""
# Reihenfolge: Stubs zuerst, dann echte Aktionen (echte ueberschreiben Stubs)
from moag.actions import stubs                               # noqa: F401
from moag.actions import oberon_smoke          # noqa: F401
from moag.actions import oberon_llm_test       # noqa: F401
from moag.actions import oberon_dsgvo_check    # noqa: F401
from moag.actions import ocrexpert_health      # noqa: F401
from moag.actions import octoboss_cluster_status  # noqa: F401
from moag.actions import octoboss_bench_start    # noqa: F401  -- echte Aktion, ueberschreibt Stub
from moag.actions import octoboss_ollama_pull    # noqa: F401  -- echte Aktion, ueberschreibt Stub
from moag.actions import ocrexpert_shadow_batch              # noqa: F401
from moag.actions import nasdominator_services_refresh       # noqa: F401
from moag.actions import custos_rules_run                    # noqa: F401

from moag.actions.registry import ACTION_REGISTRY  # noqa: F401 -- Re-Export fuer Tests

__all__ = ["ACTION_REGISTRY"]
