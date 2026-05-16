"""
MOAG-Aggregator — berechnet Gruppen-Scores und Gesamt-Score aus den 8 SystemStatus-Objekten.

Gruppen:
  KI-Backbone (Gewicht 50%): oberon, octoboss, sonofseti, ocrexpert
  Infra (Gewicht 30%):       nasdominator, qnapbackup
  Compliance+Test (20%):     custos, panopticor

Gesamt-Score = 0.5 * KI + 0.3 * Infra + 0.2 * Compliance
"""
from __future__ import annotations

from datetime import datetime, timezone

from moag.schemas import SystemStatus

# Gruppen-Definitionen
_GROUPS: dict[str, list[str]] = {
    "ki_backbone":       ["oberon", "octoboss", "sonofseti", "ocrexpert"],
    "infra":             ["nasdominator", "qnapbackup"],
    "compliance_test":   ["custos", "panopticor"],
}

# Gewichtung fuer Gesamt-Score
_GROUP_WEIGHTS: dict[str, float] = {
    "ki_backbone":     0.5,
    "infra":           0.3,
    "compliance_test": 0.2,
}

# Lesbare Namen fuer Gruppen
_GROUP_LABELS: dict[str, str] = {
    "ki_backbone":     "KI-Backbone",
    "infra":           "Infrastruktur",
    "compliance_test": "Compliance & Test",
}

# Anzeige-Metadaten pro System fuer das Frontend (id, name, group-Label).
# Wird vom /api/v1/overview-Handler beim Augmentieren des Response benutzt,
# damit das Frontend nicht selbst mappen muss.
SYSTEM_INFO: dict[str, tuple[str, str]] = {
    "oberon":       ("Oberon",       "KI-Backbone"),
    "octoboss":     ("OctoBoss",     "KI-Backbone"),
    "sonofseti":    ("SonOfSETI",    "KI-Backbone"),
    "ocrexpert":    ("OCRexpert",    "KI-Backbone"),
    "nasdominator": ("NasDominator", "Infrastruktur"),
    "qnapbackup":   ("qnapbackup",   "Infrastruktur"),
    "custos":       ("Custos",       "Compliance & Test"),
    "panopticor":   ("Panopticor",   "Compliance & Test"),
}


def _group_score(statuses: list[SystemStatus], system_ids: list[str]) -> int:
    """Berechnet den durchschnittlichen Score einer Gruppe.

    Systeme die nicht in `statuses` vorhanden sind, zaehlen als score=0.
    """
    by_id = {s.system_id: s for s in statuses}
    scores = [by_id[sid].score if sid in by_id else 0 for sid in system_ids]
    if not scores:
        return 0
    return int(sum(scores) / len(scores))


def compute_health(statuses: list[SystemStatus]) -> dict:
    """Berechnet Gruppen-Scores + Gesamt-Score aus den SystemStatus-Objekten.

    Rueckgabe-Format:
    {
        "groups": {
            "ki_backbone":     {"label": "KI-Backbone", "score": 85, "systems": ["oberon", ...]},
            "infra":           {...},
            "compliance_test": {...},
        },
        "overall_score": 72,
        "computed_at": "<ISO>",
    }
    """
    groups_result: dict[str, dict] = {}
    for group_id, system_ids in _GROUPS.items():
        score = _group_score(statuses, system_ids)
        groups_result[group_id] = {
            "label": _GROUP_LABELS[group_id],
            "score": score,
            "systems": system_ids,
        }

    # Gewichteter Gesamt-Score
    overall = sum(
        groups_result[gid]["score"] * _GROUP_WEIGHTS[gid]
        for gid in _GROUPS
    )
    overall_score = int(round(overall))

    return {
        "groups": groups_result,
        "overall_score": overall_score,
        "computed_at": datetime.now(timezone.utc).isoformat(),
    }
