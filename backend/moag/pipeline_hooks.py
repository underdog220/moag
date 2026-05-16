"""
Pipeline-Hook-Bruecke fuer MOAG.

In OCRexpert-GUI wurde hier die In-Process-Pipeline-Anbindung
(ocrexpert.pipeline_events) verdrahtet. In MOAG entfaellt das:
OCRexpert wird per HTTP angesprochen (siehe adapters/ocrexpert.py).

Diese Datei bleibt als Stub fuer:
- new_job_id()    — erzeugt MOAG-Job-IDs
- PipelineLog     — abschaltbares Diagnose-Logging (MOAG_PIPELINE_LOG_ENABLED)
"""
from __future__ import annotations

import logging
import os
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger("moag.pipeline_hooks")


def new_job_id() -> str:
    """Erzeugt eine MOAG-Job-ID im Format moag-<8-hex>."""
    return f"moag-{uuid.uuid4().hex[:8]}"


# ── Pipeline-Log (abschaltbar via MOAG_PIPELINE_LOG_ENABLED) ─────────────────


class _PipelineLog:
    """Abschaltbares Diagnose-Logging fuer Pipelines und Adapter-Calls.

    Aktivierung: ENV MOAG_PIPELINE_LOG_ENABLED=true
    """

    def __init__(self) -> None:
        self._enabled: bool = False
        self._entries: list[dict[str, Any]] = []
        self._max_entries = 500

    @property
    def enabled(self) -> bool:
        return self._enabled or os.environ.get("MOAG_PIPELINE_LOG_ENABLED", "").lower() in (
            "1", "true", "yes", "ja"
        )

    @enabled.setter
    def enabled(self, value: bool) -> None:
        self._enabled = value

    def log(self, level: str, tag: str, message: str, payload: Any = None) -> None:
        """Generisches Log-Interface (Panopticor-kompatibel)."""
        if not self.enabled:
            return
        entry = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "pipeline": tag,
            "step": "log",
            "level": level,
            "message": message,
            "payload": str(payload)[:200] if payload is not None else None,
            "ok": True,
        }
        self._entries.append(entry)
        if len(self._entries) > self._max_entries:
            del self._entries[: len(self._entries) - self._max_entries]
        logger.debug("[PipelineLog][%s] %s: %s", level, tag, message)

    def step(
        self,
        pipeline: str,
        step: str,
        input: Any = None,
        output: Any = None,
        dauer_ms: int = 0,
        ok: bool = True,
    ) -> None:
        if not self.enabled:
            return
        entry = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "pipeline": pipeline,
            "step": step,
            "input_summary": str(input)[:200] if input is not None else None,
            "output_summary": str(output)[:200] if output is not None else None,
            "dauer_ms": dauer_ms,
            "ok": ok,
        }
        self._entries.append(entry)
        if len(self._entries) > self._max_entries:
            # FIFO-Eviction
            del self._entries[: len(self._entries) - self._max_entries]
        logger.debug("[PipelineLog] %s.%s %s (%dms)", pipeline, step, "OK" if ok else "FAIL", dauer_ms)

    def llm_call(
        self,
        model: str,
        prompt_tokens: int = 0,
        response_tokens: int = 0,
        dauer_ms: int = 0,
        error: str | None = None,
    ) -> None:
        if not self.enabled:
            return
        entry = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "pipeline": "llm",
            "step": "call",
            "model": model,
            "prompt_tokens": prompt_tokens,
            "response_tokens": response_tokens,
            "dauer_ms": dauer_ms,
            "ok": error is None,
            "error": error,
        }
        self._entries.append(entry)
        if len(self._entries) > self._max_entries:
            del self._entries[: len(self._entries) - self._max_entries]

    def as_text(self, n: int = 50) -> str:
        """Gibt die letzten n Eintraege als Klartext zurueck (KI-freundlich)."""
        entries = self._entries[-n:]
        lines = []
        for e in entries:
            ok_str = "OK" if e.get("ok", True) else "FAIL"
            lines.append(
                f"[{e.get('ts', '?')}] {e.get('pipeline', '?')}.{e.get('step', '?')} "
                f"{ok_str} {e.get('dauer_ms', 0)}ms"
            )
            if e.get("error"):
                lines.append(f"  ERROR: {e['error']}")
        return "\n".join(lines)

    def clear(self) -> None:
        self._entries.clear()

    def get_entries(self) -> list[dict[str, Any]]:
        return list(self._entries)


# Singleton fuer die gesamte MOAG-Instanz
plog = _PipelineLog()


# ── TODO Phase 1.5: Pipeline-Hook-Anbindung via EventBus ─────────────────────
# In OCRexpert-GUI wurden hier Pipeline-Events (job_started, job_progress,
# job_done, job_failed) aus ocrexpert.pipeline_events in den EventBus
# weitergeleitet. In MOAG entfaellt das vollstaendig — OCRexpert wird per
# HTTP angesprochen und liefert Job-Status via /api/jobs.
# Falls MOAG mal ein eigenes Job-System braucht, hier ansetzen.

def install_pipeline_hooks(*args: Any, **kwargs: Any) -> None:
    """Stub — keine In-Process-Pipeline in MOAG."""
    logger.debug("install_pipeline_hooks: kein In-Process-Hook in MOAG (HTTP-Adapter)")


def uninstall_pipeline_hooks() -> None:
    """Stub — keine In-Process-Pipeline in MOAG."""
    pass
