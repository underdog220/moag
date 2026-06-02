"""Tests fuer _enrich_node_hardware im OctoBoss-Proxy.

Der /api/v1/octoboss/nodes-Proxy reicht die OctoBoss-Antwort durch und reichert
den hardware-Block mit hardware_direct an (echte GPU/CPU-Lasten), damit das
Frontend (Nodes.tsx liest hw.gpu_load_percent + hw.hardware_source) die echten
Werte zeigt statt der null-Heartbeat-Werte.
"""
from __future__ import annotations

from moag.routes_octoboss import _enrich_node_hardware


def test_hardware_direct_gewinnt_ueber_heartbeat():
    node = {
        "hardware": {
            "gpu_name": "RTX 2060 SUPER",
            "cpu_model": "AMD Ryzen",
            "gpu_load_percent": None,  # Heartbeat-Bug: null
            "cpu_load_percent": None,
        },
        "hardware_direct": {
            "gpu_load_percent": 5.0,
            "cpu_load_percent": 22.1,
            "gpu_source": "nvidia-smi",
        },
        "hardware_direct_at": "2026-06-02T10:00:00Z",
    }
    out = _enrich_node_hardware(node)
    hw = out["hardware"]
    # echte Lasten aus hardware_direct
    assert hw["gpu_load_percent"] == 5.0
    assert hw["cpu_load_percent"] == 22.1
    # gpu_name/cpu_model bleiben aus hardware (hardware_direct hat sie nicht)
    assert hw["gpu_name"] == "RTX 2060 SUPER"
    assert hw["cpu_model"] == "AMD Ryzen"
    # Quell-Flag + Zeitstempel fuer den Frontend-Tooltip
    assert hw["hardware_source"] == "direct"
    assert hw["hardware_at"] == "2026-06-02T10:00:00Z"


def test_fallback_auf_heartbeat_wenn_kein_hardware_direct():
    node = {"hardware": {"gpu_load_percent": 3.0}, "hardware_direct": None}
    out = _enrich_node_hardware(node)
    assert out["hardware"]["gpu_load_percent"] == 3.0
    assert out["hardware"]["hardware_source"] == "heartbeat"


def test_amd_node_gpu_load_bleibt_null_kein_fehler():
    # WhiteStar-Fall: hardware_direct hat cpu_load aber gpu_load=None (AMD, kein nvidia-smi)
    node = {
        "hardware": {"gpu_name": "RX 7900 XTX", "cpu_load_percent": None},
        "hardware_direct": {"cpu_load_percent": 7.2, "gpu_load_percent": None, "gpu_source": "none"},
        "hardware_direct_at": "2026-06-02T10:00:00Z",
    }
    out = _enrich_node_hardware(node)
    assert out["hardware"]["cpu_load_percent"] == 7.2
    assert out["hardware"]["gpu_load_percent"] is None  # korrekt n/a, kein Fehler
    assert out["hardware"]["hardware_source"] == "direct"


def test_kein_dict_unveraendert():
    assert _enrich_node_hardware(None) is None
    assert _enrich_node_hardware("x") == "x"
