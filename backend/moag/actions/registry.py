"""
Aktionen-Registry fuer MOAG.

Jede Aktion wird mit @register(meta=Action(...)) dekoriert.
Die ACTION_REGISTRY ist das zentrale Dict: action_id -> ActionDefinition.

Import-Seiteneffekt: Alle Aktions-Module muessen einmal importiert werden
(passiert via moag/actions/__init__.py), damit die @register-Dekoratoren
laufen und die Registry befuellt wird.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Awaitable, Callable

from moag.schemas import Action, ActionTriggerResponse

logger = logging.getLogger("moag.actions.registry")


@dataclass
class ActionDefinition:
    """Bundelt statisches Metadaten-Objekt + Handler-Funktion."""
    meta: Action
    handler: Callable[[dict], Awaitable[ActionTriggerResponse]]


# Zentrales Registry-Dict (befuellt via @register-Dekorator zur Importzeit)
ACTION_REGISTRY: dict[str, ActionDefinition] = {}


def register(meta: Action):
    """Dekorator: registriert eine async Handler-Funktion in ACTION_REGISTRY.

    Verwendung:
        @register(meta=Action(action_id="oberon.smoke", ...))
        async def handle_oberon_smoke(body: dict) -> ActionTriggerResponse:
            ...
    """
    def decorator(handler: Callable[[dict], Awaitable[ActionTriggerResponse]]):
        if meta.action_id in ACTION_REGISTRY:
            logger.warning(
                "Aktion '%s' wird ueberschrieben (doppelte Registrierung)",
                meta.action_id,
            )
        ACTION_REGISTRY[meta.action_id] = ActionDefinition(meta=meta, handler=handler)
        logger.debug("Aktion registriert: %s (implemented=%s)", meta.action_id, meta.implemented)
        return handler
    return decorator
