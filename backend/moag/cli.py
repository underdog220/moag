"""
CLI-Einstiegspunkt fuer MOAG Backend.

Standalone-Aufruf:
    python -m moag.cli [--port 17900] [--bind 0.0.0.0]

Oder als Modul-Direktstart:
    python -m moag [--port 17900]
"""
from __future__ import annotations

import argparse
import logging
import os
import sys

logger = logging.getLogger("moag.cli")


def register(parser: argparse.ArgumentParser) -> None:
    """Argumente fuer 'moag' definieren."""
    parser.add_argument(
        "--port", type=int,
        default=int(os.environ.get("MOAG_PORT", "17900")),
        help="HTTP-Port (Default 17900, ENV MOAG_PORT)",
    )
    parser.add_argument(
        "--bind", default=os.environ.get("MOAG_BIND", "0.0.0.0"),
        help="Bind-Adresse (Default 0.0.0.0 fuer LAN-Listen, ENV MOAG_BIND)",
    )
    parser.add_argument(
        "--hub", default=None,
        help="Default-Hub-Override (URL); ueberschreibt Settings nur fuer diese Session",
    )
    parser.add_argument(
        "--no-pipeline", action="store_true",
        help="Read-Only-Modus: Upload deaktiviert, Pipeline-Hooks bleiben aus",
    )
    parser.add_argument(
        "--dev", action="store_true",
        help="Development-Logging + Mock-Daten",
    )
    parser.add_argument(
        "--log-level", default="info",
        choices=["debug", "info", "warning", "error"],
    )


def run(args: argparse.Namespace) -> int:
    """Startet uvicorn mit der MOAG-FastAPI-App."""
    # Lazy imports — nur wenn das Subcommand wirklich aufgerufen wird.
    import uvicorn
    from .api import create_app
    from .events import EventBus
    from .hub_client import HubClient
    from .job_store import JobStore, default_db_path
    from .settings_store import SettingsStore, default_settings_path

    log_level = "DEBUG" if args.dev else args.log_level.upper()
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s %(levelname)-7s %(name)s %(message)s",
    )

    settings_store = SettingsStore(default_settings_path())

    # CLI-Override fuer Default-Hub
    if args.hub:
        from .models import HubConfig, SettingsUpdate
        s = settings_store.get()
        existing = next((h for h in s.hubs if h.url == args.hub), None)
        if existing:
            settings_store.set_default_hub(existing.id)
        else:
            new_hub = HubConfig(id="cli-override", name="CLI-Override", url=args.hub)
            new_hubs = [new_hub] + list(s.hubs)
            settings_store.update(SettingsUpdate(hubs=new_hubs, default_hub_id="cli-override"))

    job_store = JobStore(default_db_path())
    event_bus = EventBus()
    hub_client = HubClient(event_bus=event_bus)

    app = create_app(
        settings_store=settings_store,
        job_store=job_store,
        event_bus=event_bus,
        hub_client=hub_client,
        enable_pipeline=not args.no_pipeline,
    )

    print(f"MOAG Backend startet auf http://{args.bind}:{args.port}")
    print(f"  Settings: {settings_store.path}")
    print(f"  Jobs-DB:  {job_store.path}")
    print(f"  Pipeline: {'AN' if not args.no_pipeline else 'AUS (--no-pipeline)'}")

    uvicorn.run(
        app,
        host=args.bind,
        port=args.port,
        log_level=args.log_level,
    )
    return 0


def main(argv: list[str] | None = None) -> int:
    """Standalone-Einstieg fuer Tests / direkte Aufrufe."""
    parser = argparse.ArgumentParser(
        prog="moag",
        description="MOAG — Mother of All GUIs Backend",
    )
    register(parser)
    args = parser.parse_args(argv)
    return run(args)


if __name__ == "__main__":
    sys.exit(main())
