"""Pydantic-Schemas fuer die Oberon Cockpit-API.

5 REST-Endpoints unter /api/v2/admin/cockpit/* (seit oberon-dbdd2d0, 2026-05-16).
Diese Schemas sind vorbereitende Vertraege — Konsumenten-Code und UI-Integration
kommen im separaten Cockpit-Sprint.

Quellen (in Reihenfolge):
  1. Oberon/oberon/src/main/kotlin/com/devloop/oberon/routing/AdminCockpitRoutes.kt
     (direkt aus der Implementierung abgeleitet — alle Felder verifiziert)
  2. requests/open/2026-05-16-oberon-cockpit-api-und-phase-h-live.md

Auth: Bearer-Token (Header X-DevLoop-Token oder Authorization: Bearer ...).
Schema: snake_case JSON.

Alle Models verwenden ConfigDict(extra="allow"), damit neue Felder die Oberon
in zukuenftigen Versionen hinzufuegt, nicht zu ValidationErrors fuehren
(defensives Konsumenten-Pattern).
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field


# ──────────────────────────────────────────────────────────────────────
# Gemeinsame Hilfstypen
# ──────────────────────────────────────────────────────────────────────

# Status-Enum fuer Provider-Health.
# Quelle: AdminCockpitRoutes.kt Z. 98 (isConfigured → "healthy"/"down")
# Live-Probe 2026-05-16 nacht gegen oberon-dbdd2d0 (NAS) zeigte nur "healthy".
# "degraded" und "down" sind Code-seitig moeglich (Spec-Mapping), aber im
# aktuellen Live-Stand nicht gesehen. Type bleibt offen (str) statt Literal,
# damit kuenftige Oberon-Erweiterungen nicht brechen.
ProviderStatus = str

# Status-Enum fuer Smoke-Checks.
# Quelle: AdminCockpitRoutes.kt Z. 686-693 (enum SmokeStatus { PASS, WARN, FAIL })
SmokeStatus = str  # Literal["PASS", "WARN", "FAIL"]

# Verdict-Enum fuer Smoke-Summary.
SmokeVerdict = str  # Literal["PASS", "WARN", "FAIL"]

# group_by-Werte fuer /cost.
# Quelle: AdminCockpitRoutes.kt Z. 264
CostGroupBy = str  # Literal["client", "model", "day", "provider"]


# ──────────────────────────────────────────────────────────────────────
# GET /api/v2/admin/cockpit/providers
# Response: JSON-Array von ProviderEntry-Objekten.
# Quelle: AdminCockpitRoutes.kt Z. 83-123
# ──────────────────────────────────────────────────────────────────────

class ProviderProfileMap(BaseModel):
    """Modell-Matrix eines Providers (je ModelProfile-Name ein Modell-String oder null).

    Die Profile-Namen entsprechen den Enum-Eintraegen von ModelProfile auf Oberon-Seite.
    Beispiel: {"STANDARD": "claude-3-5-haiku-20241022", "MINI": null, "HEAVY": "claude-opus-4-7"}

    Live-Probe 2026-05-16 nacht (oberon-dbdd2d0): 5 Profile aktiv —
    STANDARD, MINI, HEAVY, VISION, EXTRACTION. `extra="allow"` deckt
    kuenftige Erweiterungen ab.
    """

    model_config = ConfigDict(extra="allow")

    # Live-bestaetigte Profile (alle optional, Provider kann Teilmenge unterstuetzen).
    STANDARD: str | None = None  # noqa: N815
    MINI: str | None = None  # noqa: N815
    HEAVY: str | None = None  # noqa: N815
    VISION: str | None = None  # noqa: N815
    EXTRACTION: str | None = None  # noqa: N815


class ProviderEntry(BaseModel):
    """Ein einzelner LLM-Provider in der Cockpit-Provider-Liste.

    Quelle: AdminCockpitRoutes.kt Z. 103-119
    """

    model_config = ConfigDict(extra="allow")

    id: str = Field(description="Eindeutige Provider-ID, z.B. 'anthropic', 'local', 'openai'")
    name: str = Field(description="Lesbarer Anzeigename, z.B. 'Anthropic', 'Local (OctoBoss)'")
    type: str = Field(description="Provider-Typ: 'anthropic', 'ollama' oder 'openai-like'")
    # Quelle Z. 98: if provider.isConfigured → "healthy" else "down"
    status: ProviderStatus = Field(description="Health-Status: 'healthy', 'degraded' oder 'down'")
    base_url: str | None = Field(default=None, description="Aktive Base-URL des Providers")
    api_key_hint: str | None = Field(
        default=None,
        description="Maskierter API-Key-Hinweis, z.B. 'sk-ant-ap...3A9F'",
    )
    # Latenz-Aggregation aus llm_usage (letzte 24h oder letzte 100 Calls)
    # Null wenn keine Messwerte vorhanden.
    latency_p50_ms: float | None = Field(default=None, description="Medianlatenz in ms (letzte 24h/100 Calls)")
    latency_p95_ms: float | None = Field(default=None, description="P95-Latenz in ms (letzte 24h/100 Calls)")
    # Quelle Z. 112: immer JSONObject.NULL — Preis-Daten noch nicht implementiert.
    cost_per_1m_tokens_usd: Decimal | None = Field(
        default=None,
        description="Preis pro 1M Tokens in USD (noch nicht implementiert, immer null)",
    )
    # ISO-8601-Timestamp des letzten Latenz-Checks; null wenn keine Messungen vorhanden.
    last_check: datetime | None = Field(default=None, description="Timestamp des letzten Latenz-Checks (ISO-8601)")
    is_default: bool = Field(default=False, description="True wenn dieser Provider der Default-Provider ist")
    profiles: ProviderProfileMap | None = Field(
        default=None,
        description="Modell-Matrix: welches konkrete Modell je Profil (STANDARD, MINI, HEAVY, VISION) genutzt wird",
    )


class ProvidersResponse(BaseModel):
    """Wrapper fuer GET /api/v2/admin/cockpit/providers.

    Oberon liefert ein JSON-Array (kein Wrapper-Objekt). Dieser Wrapper
    ermoeglicht typsichere Verarbeitung in OCRexpert.

    Verwendung:
        raw_list = response.json()  # list[dict]
        result = ProvidersResponse.model_validate({"providers": raw_list})
        # ODER direkt:
        entries = [ProviderEntry.model_validate(e) for e in raw_list]
    """

    model_config = ConfigDict(extra="allow")

    providers: list[ProviderEntry] = Field(default_factory=list)


# ──────────────────────────────────────────────────────────────────────
# GET /api/v2/admin/cockpit/calls?since=ISO8601&limit=N&clientId=X&providerId=X
# Cursor-basierter Paginierter Recent-Calls-Stream.
# Quelle: AdminCockpitRoutes.kt Z. 126-225
# ──────────────────────────────────────────────────────────────────────

class CallEntry(BaseModel):
    """Ein einzelner LLM-Call-Eintrag aus llm_usage.

    Quelle: AdminCockpitRoutes.kt Z. 196-212
    """

    model_config = ConfigDict(extra="allow")

    id: int | str = Field(description="Interne ID (SQLite auto-increment oder UUID)")
    ts: datetime = Field(description="Timestamp des Calls (ISO-8601, UTC)")
    client_id: str | None = Field(default=None, description="Client-ID des Aufrufers (z.B. 'ocrexpert')")
    profile: str | None = Field(default=None, description="Genutztes Profil (z.B. 'STANDARD', 'HEAVY')")
    model: str | None = Field(default=None, description="Genutztes Modell (z.B. 'claude-3-5-haiku-20241022')")
    provider: str | None = Field(default=None, description="Provider-ID (z.B. 'anthropic')")
    prompt_tokens: int | None = Field(default=None, description="Anzahl Prompt-Tokens")
    completion_tokens: int | None = Field(default=None, description="Anzahl Completion-Tokens")
    total_tokens: int | None = Field(default=None, description="Gesamt-Tokens (prompt + completion)")
    duration_ms: int | None = Field(default=None, description="Call-Dauer in ms")
    # Quelle Z. 208-209: pii_found/pii_anonymized sind immer null —
    # kein Join-Key zwischen llm_usage (SQLite) und dsgvo_audit_log (JSONL).
    pii_found: bool | None = Field(
        default=None,
        description="PII erkannt? Immer null (kein Join zwischen llm_usage und dsgvo_audit_log)",
    )
    pii_anonymized: bool | None = Field(
        default=None,
        description="PII anonymisiert? Immer null (kein Join zwischen llm_usage und dsgvo_audit_log)",
    )
    status: str | None = Field(default="ok", description="Call-Status ('ok' oder Fehlercode)")
    error: str | None = Field(default=None, description="Fehlermeldung bei status != 'ok'")


class CallsResponse(BaseModel):
    """Response fuer GET /api/v2/admin/cockpit/calls.

    Cursor-Pagination: next_since ist der Timestamp des aeltesten Eintrags
    der aktuellen Seite. Naechste Anfrage mit ?since=<next_since>.

    Quelle: AdminCockpitRoutes.kt Z. 215-224
    """

    model_config = ConfigDict(extra="allow")

    calls: list[CallEntry] = Field(default_factory=list)
    # null wenn keine weitere Seite vorhanden.
    next_since: datetime | None = Field(
        default=None,
        description="Cursor fuer naechste Seite (Timestamp des aeltesten Eintrags dieser Seite)",
    )
    limit: int = Field(description="Angefragtes Limit")
    returned: int = Field(description="Tatsaechlich zurueckgegebene Anzahl Eintraege")


# ──────────────────────────────────────────────────────────────────────
# GET /api/v2/admin/cockpit/cost?from=ISO8601&to=ISO8601&group_by=client|model|day|provider
# Aggregierte Kostendaten.
# Quelle: AdminCockpitRoutes.kt Z. 227-331, CostGroup-Datenklasse Z. 757-764
# ──────────────────────────────────────────────────────────────────────

class CostGroup(BaseModel):
    """Eine einzelne Aggregations-Gruppe in der Kostenauswertung.

    Das `key`-Feld haelt den Wert der Gruppierung:
    - group_by=client    → key="ocrexpert"
    - group_by=model     → key="claude-3-5-haiku-20241022"
    - group_by=day       → key="2026-05-14"
    - group_by=provider  → key="anthropic"

    Quelle: AdminCockpitRoutes.kt Z. 758-764 (costGroupToJson)
    """

    model_config = ConfigDict(extra="allow")

    key: str = Field(description="Gruppierungs-Key (client-ID, Modell-Name, Datum oder Provider-ID)")
    calls: int = Field(description="Anzahl Calls in dieser Gruppe")
    total_tokens: int = Field(description="Gesamt-Tokens in dieser Gruppe")
    prompt_tokens: int = Field(description="Prompt-Tokens in dieser Gruppe")
    completion_tokens: int = Field(description="Completion-Tokens in dieser Gruppe")
    # Quelle Z. 237: kann 0.0 sein wenn Modell nicht in PRICES-Tabelle bekannt.
    total_cost_usd: Decimal = Field(description="Gesamtkosten in USD (0.0 wenn Modell-Preis unbekannt)")


class CostTotal(BaseModel):
    """Gesamt-Aggregat ueber alle Gruppen in der Kostenauswertung.

    Quelle: AdminCockpitRoutes.kt Z. 315-321
    """

    model_config = ConfigDict(extra="allow")

    calls: int = Field(description="Gesamt-Anzahl Calls im Zeitraum")
    total_tokens: int = Field(description="Gesamt-Tokens im Zeitraum")
    prompt_tokens: int = Field(description="Gesamt-Prompt-Tokens im Zeitraum")
    completion_tokens: int = Field(description="Gesamt-Completion-Tokens im Zeitraum")
    total_cost_usd: Decimal = Field(description="Gesamtkosten in USD im Zeitraum")


class CostResponse(BaseModel):
    """Response fuer GET /api/v2/admin/cockpit/cost.

    Quelle: AdminCockpitRoutes.kt Z. 323-330
    """

    model_config = ConfigDict(extra="allow")

    # ISO-8601-Timestamps der angeforderten Periode (von Oberon normalisiert).
    # Oberon liefert immer UTC-Timestamps (Instant.toString()), also "2026-05-07T00:00:00Z".
    from_: datetime = Field(alias="from", description="Anfang des Abfragezeitraums (UTC, ISO-8601)")
    to: datetime = Field(description="Ende des Abfragezeitraums (UTC, ISO-8601)")
    group_by: CostGroupBy = Field(description="Verwendete Gruppierung: 'client', 'model', 'day' oder 'provider'")
    groups: list[CostGroup] = Field(default_factory=list)
    total: CostTotal = Field(description="Gesamt-Aggregat ueber alle Gruppen")

    model_config = ConfigDict(extra="allow", populate_by_name=True)


# ──────────────────────────────────────────────────────────────────────
# GET /api/v2/admin/cockpit/audit?since=ISO8601&limit=N&pii_type=X&client_id=Y
# DSGVO-Audit-Event-Stream.
# Quelle: AdminCockpitRoutes.kt Z. 333-495
# ──────────────────────────────────────────────────────────────────────

class AuditFilters(BaseModel):
    """Echo der angewendeten Filter in der Audit-Response.

    Quelle: AdminCockpitRoutes.kt Z. 483-485
    """

    model_config = ConfigDict(extra="allow")

    pii_type: str | None = Field(default=None, description="Aktiver PII-Type-Filter")
    client_id: str | None = Field(default=None, description="Aktiver Client-ID-Filter")


class AuditEvent(BaseModel):
    """Ein einzelner DSGVO-Audit-Event.

    Event-Typen (aus JSONL-Tagesdateien):
    - "dsgvo_proxy"       — regulaerer DSGVO-Proxy-Call (auch aelteres Format ohne eventType-Feld)
    - "transcribe"        — Transkriptions-Request
    - "visual_redaction"  — Bild-Redaktions-Request

    Quelle: AdminCockpitRoutes.kt Z. 450-479
    """

    model_config = ConfigDict(extra="allow")

    ts: datetime = Field(description="Timestamp des Events (ISO-8601, UTC)")
    audit_id: str = Field(description="UUID des Audit-Eintrags")
    client_id: str | None = Field(default=None, description="Client-ID des Aufrufers")
    # Quelle Z. 459: altes Format hat kein eventType-Feld → "dsgvo_proxy"
    event_type: str = Field(
        default="dsgvo_proxy",
        description="Event-Typ: 'dsgvo_proxy', 'transcribe' oder 'visual_redaction'",
    )
    pii_types: list[str] = Field(default_factory=list, description="Erkannte PII-Typen (z.B. ['IBAN', 'NAME'])")
    anonymized: bool = Field(default=False, description="True wenn PII anonymisiert wurde")
    # Quelle Z. 467: nur bei dsgvo_proxy vorhanden; transcribe/visual_redaction haben kein routing_decision.
    routing_decision: str | None = Field(
        default=None,
        description="Routing-Entscheidung (nur dsgvo_proxy): z.B. 'PROXY', 'BLOCK'",
    )
    # Quelle Z. 470-475: processingDurationMs (dsgvo_proxy/visual) oder durationMs (transcribe)
    duration_ms: int = Field(default=0, description="Verarbeitungsdauer in ms")
    # Quelle Z. 477: vorhanden bei dsgvo_proxy und visual_redaction.
    domain: str | None = Field(default=None, description="Fachdomaene (z.B. 'DOCUMENTS') — nur dsgvo_proxy und visual")


class AuditResponse(BaseModel):
    """Response fuer GET /api/v2/admin/cockpit/audit.

    Cursor-Pagination: next_since ist der ts des aeltesten Eintrags dieser Seite.
    Wenn DSGVO-Modul deaktiviert: events=[], next_since=null, returned=0.

    Quelle: AdminCockpitRoutes.kt Z. 487-494
    """

    model_config = ConfigDict(extra="allow")

    events: list[AuditEvent] = Field(default_factory=list)
    next_since: datetime | None = Field(
        default=None,
        description="Cursor fuer naechste Seite (ts des aeltesten Events dieser Seite)",
    )
    limit: int = Field(description="Angefragtes Limit (zwischen 1 und 500)")
    returned: int = Field(description="Tatsaechlich zurueckgegebene Anzahl Events")
    filters: AuditFilters = Field(default_factory=AuditFilters, description="Echo der angewendeten Filter")


# ──────────────────────────────────────────────────────────────────────
# GET /api/v2/admin/cockpit/smoke
# Live-Health-Snapshot mit 6 Sub-Checks (alle parallel, max 3s Timeout).
# Quelle: AdminCockpitRoutes.kt Z. 497-678
# ──────────────────────────────────────────────────────────────────────

class SmokeCheck(BaseModel):
    """Ergebnis eines einzelnen Smoke-Sub-Checks.

    Bekannte check-Namen (Quelle: AdminCockpitRoutes.kt Z. 543-633):
    - "dsgvo-status"    — DSGVO-Modul aktiv + FastPiiScanner Selbsttest
    - "pii-detect"      — FastPiiScanner erkennt Test-IBAN
    - "ner-extract"     — NER-Scanner verfuegbar (WARN wenn NER_MODE=OFF)
    - "octoboss-local"  — local-Provider registriert und konfiguriert
    - "oberon-postgres" — DB-Connection SELECT 1
    - "local-llm-hub"   — HTTP-Ping an OBERON_LOCAL_LLM_URL/v1/models

    Quelle: AdminCockpitRoutes.kt Z. 655-664
    """

    model_config = ConfigDict(extra="allow")

    name: str = Field(description="Name des Sub-Checks (z.B. 'dsgvo-status', 'pii-detect')")
    # Quelle Z. 686: enum SmokeStatus { PASS, WARN, FAIL }
    status: SmokeStatus = Field(description="Ergebnis: 'PASS', 'WARN' oder 'FAIL'")
    last_run: datetime = Field(description="Zeitpunkt des Checks (ISO-8601, UTC) — live pro Request")
    latency_ms: int = Field(description="Messdauer des Sub-Checks in ms")
    error: str | None = Field(default=None, description="Fehlermeldung bei WARN oder FAIL (null bei PASS)")


class SmokeSummary(BaseModel):
    """Zusammenfassung aller Sub-Checks im Smoke-Response.

    Verdict-Logik (Quelle: AdminCockpitRoutes.kt Z. 649-653):
    - FAIL wenn mindestens 1 Sub-Check FAIL
    - WARN wenn mindestens 1 Sub-Check WARN (und kein FAIL)
    - PASS wenn alle PASS

    Quelle: AdminCockpitRoutes.kt Z. 666-672
    """

    model_config = ConfigDict(extra="allow")

    pass_: Annotated[int, Field(alias="pass")] = Field(
        default=0,
        description="Anzahl bestandener Sub-Checks",
    )
    warn: int = Field(default=0, description="Anzahl Sub-Checks mit WARN")
    fail: int = Field(default=0, description="Anzahl gescheiterter Sub-Checks")
    total: int = Field(description="Gesamtanzahl Sub-Checks (erwartet: 6)")
    verdict: SmokeVerdict = Field(description="Gesamt-Verdict: 'PASS', 'WARN' oder 'FAIL'")

    model_config = ConfigDict(extra="allow", populate_by_name=True)


class SmokeResponse(BaseModel):
    """Response fuer GET /api/v2/admin/cockpit/smoke.

    Alle 6 Sub-Checks werden live und parallel beim API-Aufruf gemessen
    (kein Pre-Push-Cache — aktueller Zustand, nicht letzter Smoke-Zeitpunkt).

    Quelle: AdminCockpitRoutes.kt Z. 673-677
    """

    model_config = ConfigDict(extra="allow")

    suites: list[SmokeCheck] = Field(default_factory=list, description="Ergebnisse aller Sub-Checks")
    summary: SmokeSummary = Field(description="Aggregiertes Verdict ueber alle Sub-Checks")


# ──────────────────────────────────────────────────────────────────────
# Oeffentliche Re-Exports (fuer from ocrexpert.oberon.cockpit_schemas import ...)
# ──────────────────────────────────────────────────────────────────────

__all__ = [
    # Providers
    "ProviderEntry",
    "ProviderProfileMap",
    "ProvidersResponse",
    # Calls
    "CallEntry",
    "CallsResponse",
    # Cost
    "CostGroup",
    "CostTotal",
    "CostResponse",
    # Audit
    "AuditEvent",
    "AuditFilters",
    "AuditResponse",
    # Smoke
    "SmokeCheck",
    "SmokeSummary",
    "SmokeResponse",
]
