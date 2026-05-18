"""Manifest-Health-Handler fuer MOAG.

Validiert Hub-Manifests (Bootstrapper + Core) via Live-Hub-API.
Daten-Quellen-Strategie: Option A (Live-Hub-API), kein SSH.

Checks pro Manifest:
  schema            — Pflichtfelder + Typen
  cross-ref         — default_version in versions{}
  node-overrides    — Werte sind Strings, nicht Objects (heute-morgen-Bug!)
  exe-files         — EXE-Existenz via Hub-API (binaries.available)
  sha-match         — SHA256-Konsistenz (Hub liefert SHA aus Manifest)
  live-consistency  — Hub-API == Manifest-default_version

Keine Schema-Klassen aus OctoBoss importiert — MOAG ist eigenstaendiges
Paket. Validierungs-Logik ist konsistent mit:
  C:\\code\\OctoBoss\\scripts\\manifest-validator.py
  C:\\code\\OctoBoss\\src\\octoboss\\bootstrapper_distribution\\manifest.py
  C:\\code\\OctoBoss\\src\\octoboss\\core_distribution\\manifest.py
"""

from __future__ import annotations

import logging
import re
import time
from datetime import datetime, timezone
from typing import Any

import httpx

from moag.pipeline_hooks import plog

logger = logging.getLogger("moag.manifest_health")

# -------------------------------------------------------------------
# Konstanten
# -------------------------------------------------------------------

# SHA256: genau 64 Hex-Zeichen
_SHA256_RE = re.compile(r"^[0-9a-fA-F]{64}$")

# UUID fuer node_overrides-Keys
_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)

# Versions-Format: 0.X.Y[-suffix]
_VERSION_RE = re.compile(r"^0\.\d+\.\d+(-[a-zA-Z0-9][a-zA-Z0-9._-]*)?$")

# Cache-TTL in Sekunden — Hub cacht Manifest 30s, daher kein Sinn haeufiger zu pollen
_LIVE_HUB_CACHE_TTL_S = 35


# -------------------------------------------------------------------
# Ergebnis-Datenklassen
# -------------------------------------------------------------------

def _mk_check(
    check_id: str,
    label: str,
    status: str,
    detail: str = "",
    hint: str = "",
    example: str = "",
    schema_ref: str = "",
    value_actual: Any = None,
    value_expected: Any = None,
) -> dict:
    """Erstellt einen einzelnen Check-Eintrag."""
    return {
        "id": check_id,
        "label": label,
        "status": status,          # "green" | "yellow" | "red"
        "detail": detail,
        "hint": hint,
        "example": example,
        "schema_ref": schema_ref,
        "value_actual": value_actual,
        "value_expected": value_expected,
    }


def _overall(checks: list[dict]) -> str:
    """Berechnet Gesamt-Status aus Check-Liste."""
    statuses = {c["status"] for c in checks}
    if "red" in statuses:
        return "red"
    if "yellow" in statuses:
        return "yellow"
    return "green"


# -------------------------------------------------------------------
# Schema-Validierung (konsistent mit manifest-validator.py)
# -------------------------------------------------------------------

def _validate_bootstrapper_schema(raw: dict) -> list[dict]:
    """Schema-Validierung Bootstrapper-Manifest.

    Prueft:
      A1 default_version vorhanden + String
      A2 versions vorhanden + Objekt
      A3 Versions-Eintraege: url, sha256, size (NICHT size_bytes!)
      A4 node_overrides-Werte sind Strings (heute-morgen-Bug!)
      B  Cross-Reference: default_version in versions{}
      B2 node_overrides-Werte in versions{}
    """
    checks: list[dict] = []

    # A1: default_version
    default_version = raw.get("default_version", "")
    if not default_version or not isinstance(default_version, str):
        checks.append(_mk_check(
            "schema-default-version",
            "default_version vorhanden",
            "red",
            detail=f"Feld 'default_version' fehlt oder leer (Typ: {type(default_version).__name__})",
            hint="default_version muss ein nicht-leerer String sein.",
            schema_ref="bootstrapper_distribution/manifest.py:146-150",
        ))
        default_version = None
    else:
        checks.append(_mk_check(
            "schema-default-version",
            "default_version vorhanden",
            "green",
            detail=f"default_version = \"{default_version}\"",
        ))

    # A2: versions
    raw_versions = raw.get("versions")
    if raw_versions is None or not isinstance(raw_versions, dict):
        checks.append(_mk_check(
            "schema-versions",
            "versions{} vorhanden",
            "red",
            detail=f"Feld 'versions' fehlt oder kein Objekt (Typ: {type(raw_versions).__name__})",
            schema_ref="bootstrapper_distribution/manifest.py:152-156",
        ))
        raw_versions = {}
    else:
        checks.append(_mk_check(
            "schema-versions",
            "versions{} vorhanden",
            "green",
            detail=f"{len(raw_versions)} Version(en) eingetragen",
        ))

    # A3: Versions-Eintraege
    version_errors: list[str] = []
    for ver, info in (raw_versions or {}).items():
        if not isinstance(info, dict):
            version_errors.append(f"versions['{ver}'] ist kein Objekt")
            continue
        # url (Pflicht im Bootstrapper-Manifest)
        url = info.get("url", "")
        if not url or not isinstance(url, str):
            version_errors.append(f"versions['{ver}'].url fehlt")
        # sha256
        sha = info.get("sha256", "")
        if not sha or not isinstance(sha, str):
            version_errors.append(f"versions['{ver}'].sha256 fehlt")
        elif not _SHA256_RE.match(sha):
            version_errors.append(f"versions['{ver}'].sha256 ist kein gueltiger SHA256")
        # size (NICHT size_bytes — Bootstrapper-Konvention!)
        size = info.get("size")
        if size is None:
            version_errors.append(
                f"versions['{ver}'].size fehlt — Feld heisst 'size', NICHT 'size_bytes'!"
            )
        elif not isinstance(size, int) or size <= 0:
            version_errors.append(f"versions['{ver}'].size muss positive Ganzzahl sein")

    if version_errors:
        checks.append(_mk_check(
            "schema-version-entries",
            "Versions-Eintraege (url/sha256/size)",
            "red",
            detail="\n".join(version_errors),
            hint="Jeder Eintrag braucht url, sha256 (64 Hex), size (Integer Bytes).",
            schema_ref="bootstrapper_distribution/manifest.py:49-51",
        ))
    else:
        checks.append(_mk_check(
            "schema-version-entries",
            "Versions-Eintraege (url/sha256/size)",
            "green",
            detail=f"Alle {len(raw_versions)} Eintraege haben url/sha256/size",
        ))

    # A4: node_overrides-Werte MUESSEN Strings sein
    raw_overrides = raw.get("node_overrides", {})
    if not isinstance(raw_overrides, dict):
        checks.append(_mk_check(
            "node-overrides-types",
            "node_overrides-Werte sind Strings",
            "red",
            detail=f"node_overrides ist kein Objekt: {type(raw_overrides).__name__}",
            schema_ref="bootstrapper_distribution/manifest.py:175-182",
        ))
        raw_overrides = {}
    else:
        override_errors: list[str] = []
        for key, val in raw_overrides.items():
            if not isinstance(val, str):
                override_errors.append(
                    f"node_overrides[\"{key}\"] = {type(val).__name__}  "
                    f"(erwartet: str, ist: {repr(val)[:60]})"
                )
        if override_errors:
            checks.append(_mk_check(
                "node-overrides-types",
                "node_overrides-Werte sind Strings",
                "red",
                detail="\n".join(override_errors),
                hint=(
                    "node_overrides-Werte muessen NUR Version-Strings sein, "
                    "KEINE Objects. URL/SHA werden aus versions{} aufgeloest."
                ),
                example='"<uuid>": "0.3.9-rc5.10b"',
                schema_ref="bootstrapper_distribution/manifest.py:180-182",
            ))
        else:
            n = len(raw_overrides)
            checks.append(_mk_check(
                "node-overrides-types",
                "node_overrides-Werte sind Strings",
                "green",
                detail=f"{n} Override(s), alle Strings",
            ))

    # B: Cross-Reference
    if default_version and raw_versions:
        if default_version not in raw_versions:
            ver_list = ", ".join(sorted(raw_versions.keys()))
            checks.append(_mk_check(
                "cross-ref",
                "default_version in versions{}",
                "red",
                detail=f"default_version=\"{default_version}\" nicht in versions{{}}",
                hint=f"Vorhandene Versionen: {ver_list}",
                example=(
                    f'"{default_version}": {{'
                    f'"url": "http://192.168.200.71:18765/seti/distribute/download/bootstrapper", '
                    f'"sha256": "<64-hex>", "size": 0}}'
                ),
                schema_ref="bootstrapper_distribution/manifest.py:184-188",
                value_actual=default_version,
                value_expected=f"einer von: {ver_list}",
            ))
        else:
            checks.append(_mk_check(
                "cross-ref",
                "default_version in versions{}",
                "green",
                detail=f"\"{default_version}\" ist in versions{{}} vorhanden",
            ))

        # B2: node_overrides-Versionen in versions{}
        if isinstance(raw_overrides, dict):
            orphan_overrides = [
                f"node_overrides[\"{k}\"]=\"{v}\""
                for k, v in raw_overrides.items()
                if isinstance(v, str) and v not in raw_versions
            ]
            if orphan_overrides:
                checks.append(_mk_check(
                    "cross-ref-overrides",
                    "node_overrides-Versionen in versions{}",
                    "red",
                    detail="\n".join(orphan_overrides) + " — nicht in versions{} gefunden",
                    schema_ref="bootstrapper_distribution/manifest.py:180-182",
                ))
            else:
                checks.append(_mk_check(
                    "cross-ref-overrides",
                    "node_overrides-Versionen in versions{}",
                    "green",
                    detail="Alle Override-Versionen in versions{} vorhanden",
                ))

    return checks


def _validate_core_schema(raw: dict) -> list[dict]:
    """Schema-Validierung Core-Manifest.

    Konsistent mit core_distribution/manifest.py.
    Unterschied zu Bootstrapper: size_bytes (nicht size), kein url-Feld.
    """
    checks: list[dict] = []

    # A1: default_version
    default_version = raw.get("default_version", "")
    if not default_version or not isinstance(default_version, str):
        checks.append(_mk_check(
            "schema-default-version",
            "default_version vorhanden",
            "red",
            detail=f"Feld 'default_version' fehlt oder leer (Typ: {type(default_version).__name__})",
            hint="default_version muss ein nicht-leerer String sein.",
            schema_ref="core_distribution/manifest.py:154-158",
        ))
        default_version = None
    else:
        checks.append(_mk_check(
            "schema-default-version",
            "default_version vorhanden",
            "green",
            detail=f"default_version = \"{default_version}\"",
        ))

    # A2: versions
    raw_versions = raw.get("versions")
    if raw_versions is None or not isinstance(raw_versions, dict):
        checks.append(_mk_check(
            "schema-versions",
            "versions{} vorhanden",
            "red",
            detail=f"Feld 'versions' fehlt oder kein Objekt (Typ: {type(raw_versions).__name__})",
            schema_ref="core_distribution/manifest.py:160-162",
        ))
        raw_versions = {}
    else:
        checks.append(_mk_check(
            "schema-versions",
            "versions{} vorhanden",
            "green",
            detail=f"{len(raw_versions)} Version(en) eingetragen",
        ))

    # A3: Versions-Eintraege (Core: sha256 + size_bytes, kein url)
    version_errors: list[str] = []
    for ver, info in (raw_versions or {}).items():
        if not isinstance(info, dict):
            version_errors.append(f"versions['{ver}'] ist kein Objekt")
            continue
        sha = info.get("sha256", "")
        if not sha or not isinstance(sha, str):
            version_errors.append(f"versions['{ver}'].sha256 fehlt")
        elif not _SHA256_RE.match(sha):
            version_errors.append(f"versions['{ver}'].sha256 ist kein gueltiger SHA256")
        # size_bytes (NICHT size — Core-Konvention!)
        size_bytes = info.get("size_bytes")
        if size_bytes is None:
            version_errors.append(
                f"versions['{ver}'].size_bytes fehlt — Feld heisst 'size_bytes', "
                f"NICHT 'size'! (Bootstrapper nutzt 'size', Core nutzt 'size_bytes')"
            )
        elif not isinstance(size_bytes, int) or size_bytes <= 0:
            version_errors.append(f"versions['{ver}'].size_bytes muss positive Ganzzahl sein")

    if version_errors:
        checks.append(_mk_check(
            "schema-version-entries",
            "Versions-Eintraege (sha256/size_bytes)",
            "red",
            detail="\n".join(version_errors),
            hint="Jeder Eintrag braucht sha256 (64 Hex) und size_bytes (Integer Bytes).",
            schema_ref="core_distribution/manifest.py:35-37",
        ))
    else:
        checks.append(_mk_check(
            "schema-version-entries",
            "Versions-Eintraege (sha256/size_bytes)",
            "green",
            detail=f"Alle {len(raw_versions)} Eintraege haben sha256/size_bytes",
        ))

    # A4: node_overrides-Werte sind Strings
    raw_overrides = raw.get("node_overrides", {})
    if not isinstance(raw_overrides, dict):
        checks.append(_mk_check(
            "node-overrides-types",
            "node_overrides-Werte sind Strings",
            "red",
            detail=f"node_overrides ist kein Objekt: {type(raw_overrides).__name__}",
            schema_ref="core_distribution/manifest.py:181-186",
        ))
        raw_overrides = {}
    else:
        override_errors_core: list[str] = []
        for key, val in raw_overrides.items():
            if not isinstance(val, str):
                override_errors_core.append(
                    f"node_overrides[\"{key}\"] = {type(val).__name__}  "
                    f"(erwartet: str, ist: {repr(val)[:60]})"
                )
        if override_errors_core:
            checks.append(_mk_check(
                "node-overrides-types",
                "node_overrides-Werte sind Strings",
                "red",
                detail="\n".join(override_errors_core),
                hint="node_overrides-Werte muessen NUR Version-Strings sein, keine Objects.",
                example='"<uuid>": "0.3.9-rc5.10b"',
                schema_ref="core_distribution/manifest.py:184-186",
            ))
        else:
            n = len(raw_overrides)
            checks.append(_mk_check(
                "node-overrides-types",
                "node_overrides-Werte sind Strings",
                "green",
                detail=f"{n} Override(s), alle Strings",
            ))

    # B: Cross-Reference
    if default_version and raw_versions:
        if default_version not in raw_versions:
            ver_list = ", ".join(sorted(raw_versions.keys()))
            checks.append(_mk_check(
                "cross-ref",
                "default_version in versions{}",
                "red",
                detail=f"default_version=\"{default_version}\" nicht in versions{{}}",
                hint=f"Vorhandene Versionen: {ver_list}",
                example=(
                    f'"{default_version}": {{'
                    f'"sha256": "<64-hex>", "size_bytes": 0, '
                    f'"released": "2026-05-18T12:00:00Z"}}'
                ),
                schema_ref="core_distribution/manifest.py:184-188",
                value_actual=default_version,
                value_expected=f"einer von: {ver_list}",
            ))
        else:
            checks.append(_mk_check(
                "cross-ref",
                "default_version in versions{}",
                "green",
                detail=f"\"{default_version}\" ist in versions{{}} vorhanden",
            ))

        if isinstance(raw_overrides, dict):
            orphan_overrides_core = [
                f"node_overrides[\"{k}\"]=\"{v}\""
                for k, v in raw_overrides.items()
                if isinstance(v, str) and v not in raw_versions
            ]
            if orphan_overrides_core:
                checks.append(_mk_check(
                    "cross-ref-overrides",
                    "node_overrides-Versionen in versions{}",
                    "red",
                    detail="\n".join(orphan_overrides_core),
                    schema_ref="core_distribution/manifest.py:184-186",
                ))
            else:
                checks.append(_mk_check(
                    "cross-ref-overrides",
                    "node_overrides-Versionen in versions{}",
                    "green",
                    detail="Alle Override-Versionen in versions{} vorhanden",
                ))

    return checks


# -------------------------------------------------------------------
# Live-Hub-Checks via Hub-API
# -------------------------------------------------------------------

async def _check_bootstrapper_live(
    hub_base: str,
    raw_manifest: dict | None,
    client: httpx.AsyncClient,
    t0: float,
) -> list[dict]:
    """Prueft Bootstrapper-Manifest via GET /seti/distribute/info."""
    checks: list[dict] = []
    info_url = f"{hub_base}/seti/distribute/info"

    try:
        resp = await client.get(info_url)
        dauer_ms = int((time.monotonic() - t0) * 1000)
        plog.step(
            "manifest.health",
            "bootstrapper.live",
            input={"url": info_url},
            output={"status": resp.status_code},
            dauer_ms=dauer_ms,
            ok=resp.is_success,
        )

        if not resp.is_success:
            checks.append(_mk_check(
                "live-consistency",
                "Live-Hub-Konsistenz",
                "red",
                detail=f"Hub {info_url} antwortete HTTP {resp.status_code}",
                hint="Hub laeuft? Netzwerk OK?",
            ))
            return checks

        data = resp.json()

        # EXE-Files-Check: binaries.bootstrapper.available
        binaries = data.get("binaries", {})
        boot_bin = binaries.get("bootstrapper", {})
        if isinstance(boot_bin, dict):
            if boot_bin.get("available"):
                checks.append(_mk_check(
                    "exe-files",
                    "Bootstrapper-EXE verfuegbar",
                    "green",
                    detail=(
                        f"Bootstrapper-EXE: {boot_bin.get('size', boot_bin.get('size_bytes', '?'))} Bytes, "
                        f"SHA: {str(boot_bin.get('sha256', ''))[:16]}..."
                        if boot_bin.get("sha256") else
                        f"Bootstrapper-EXE: {boot_bin.get('version', '?')} (URL-Manifest)"
                    ),
                ))
            else:
                checks.append(_mk_check(
                    "exe-files",
                    "Bootstrapper-EXE verfuegbar",
                    "red",
                    detail="Hub meldet bootstrapper.available=false",
                    hint=(
                        "EXE liegt unter dist/sonofseti-bootstrapper.exe im OctoBoss-Repo. "
                        "Nach Rebuild: docker restart octoboss."
                    ),
                ))
        else:
            checks.append(_mk_check(
                "exe-files",
                "Bootstrapper-EXE verfuegbar",
                "yellow",
                detail="Hub liefert keine binaries.bootstrapper-Daten",
            ))

        # SHA-Match: wenn Hub sha256 liefert UND Manifest sha256 vorhanden
        hub_sha = boot_bin.get("sha256", "") if isinstance(boot_bin, dict) else ""
        if hub_sha and raw_manifest:
            default_ver = raw_manifest.get("default_version", "")
            versions = raw_manifest.get("versions", {})
            if default_ver and default_ver in versions:
                manifest_sha = versions[default_ver].get("sha256", "")
                if manifest_sha:
                    if hub_sha.lower() == manifest_sha.lower():
                        checks.append(_mk_check(
                            "sha-match",
                            "SHA256-Match (Hub vs. Manifest)",
                            "green",
                            detail=f"SHA stimmt ueberein: {hub_sha[:16]}...",
                        ))
                    else:
                        checks.append(_mk_check(
                            "sha-match",
                            "SHA256-Match (Hub vs. Manifest)",
                            "red",
                            detail=(
                                f"SHA-Abweichung:\n"
                                f"  Hub:      {hub_sha[:32]}...\n"
                                f"  Manifest: {manifest_sha[:32]}..."
                            ),
                            hint="EXE-Datei und Manifest stimmen nicht ueberein.",
                            value_actual=hub_sha[:16] + "...",
                            value_expected=manifest_sha[:16] + "...",
                        ))

        # Live-Konsistenz: Hub bootstrapper_version == Manifest default_version
        live_version = data.get("bootstrapper_version")
        if live_version is None:
            checks.append(_mk_check(
                "live-consistency",
                "Live-Hub-Konsistenz (bootstrapper_version)",
                "yellow",
                detail="Hub liefert bootstrapper_version=null — Manifest nicht geladen?",
                hint="docker restart octoboss oder Hub-Logs pruefen. Cache-TTL: 30s.",
            ))
        elif raw_manifest:
            default_ver = raw_manifest.get("default_version", "")
            if default_ver and live_version == default_ver:
                checks.append(_mk_check(
                    "live-consistency",
                    "Live-Hub-Konsistenz (bootstrapper_version)",
                    "green",
                    detail=f"Hub und Manifest stimmen ueberein: \"{live_version}\"",
                ))
            elif default_ver:
                checks.append(_mk_check(
                    "live-consistency",
                    "Live-Hub-Konsistenz (bootstrapper_version)",
                    "red",
                    detail=(
                        f"Versions-Abweichung:\n"
                        f"  Manifest default_version: \"{default_ver}\"\n"
                        f"  Live Hub bootstrapper_version: \"{live_version}\""
                    ),
                    hint="Cache-TTL ~30s — wenn Manifest gerade geaendert: 35s warten. Sonst: docker restart octoboss.",
                    value_actual=live_version,
                    value_expected=default_ver,
                ))
        else:
            # Kein lokales Manifest bekannt — nur Hub-Wert zeigen
            checks.append(_mk_check(
                "live-consistency",
                "Live-Hub-Konsistenz (bootstrapper_version)",
                "yellow",
                detail=f"Hub meldet bootstrapper_version=\"{live_version}\" (kein lokales Manifest zum Vergleich)",
            ))

    except httpx.TimeoutException:
        checks.append(_mk_check(
            "live-consistency",
            "Live-Hub-Konsistenz",
            "red",
            detail=f"Timeout beim Abrufen von {info_url}",
            hint="Hub laeuft? VPN/Netzwerk OK?",
        ))
    except (httpx.ConnectError, httpx.HTTPError) as exc:
        checks.append(_mk_check(
            "live-consistency",
            "Live-Hub-Konsistenz",
            "red",
            detail=f"Hub nicht erreichbar: {exc}",
        ))

    return checks


async def _check_core_live(
    hub_base: str,
    raw_manifest: dict | None,
    client: httpx.AsyncClient,
    t0: float,
) -> list[dict]:
    """Prueft Core-Manifest via GET /api/v1/seti/core/desired."""
    checks: list[dict] = []
    # Null-UUID als Sentinel — kein echter Node, prueft default_version
    desired_url = f"{hub_base}/api/v1/seti/core/desired?node_id=00000000-0000-0000-0000-000000000000"

    try:
        resp = await client.get(desired_url)
        dauer_ms = int((time.monotonic() - t0) * 1000)
        plog.step(
            "manifest.health",
            "core.live",
            input={"url": desired_url},
            output={"status": resp.status_code},
            dauer_ms=dauer_ms,
            ok=resp.is_success,
        )

        if not resp.is_success:
            # 404 kann bedeuten: Endpoint nicht existiert (aeltere Hub-Version)
            checks.append(_mk_check(
                "live-consistency",
                "Live-Hub-Konsistenz (Core)",
                "yellow",
                detail=f"Hub {desired_url} antwortete HTTP {resp.status_code}",
                hint="Hub unterstuetzt /api/v1/seti/core/desired? (Endpoint ab rc5.x).",
            ))
            return checks

        data = resp.json()

        # EXE-Files: via binaries oder core-spezifische Felder
        version_live = data.get("version")
        url_live = data.get("url") or data.get("download_url")

        if version_live:
            checks.append(_mk_check(
                "exe-files",
                "Core-EXE verfuegbar (Hub-Desired)",
                "green",
                detail=(
                    f"Hub liefert desired_version=\"{version_live}\""
                    + (f", URL: {url_live}" if url_live else "")
                ),
            ))
        else:
            checks.append(_mk_check(
                "exe-files",
                "Core-EXE verfuegbar (Hub-Desired)",
                "yellow",
                detail=f"Hub-Response hat kein 'version'-Feld: {str(data)[:120]}",
                hint="Hub-Endpoint /api/v1/seti/core/desired liefert unbekanntes Format.",
            ))

        # SHA-Match (wenn Hub sha256 liefert)
        hub_sha = data.get("sha256", "")
        if hub_sha and raw_manifest and version_live:
            versions = raw_manifest.get("versions", {})
            if version_live in versions:
                manifest_sha = versions[version_live].get("sha256", "")
                if manifest_sha:
                    if hub_sha.lower() == manifest_sha.lower():
                        checks.append(_mk_check(
                            "sha-match",
                            "SHA256-Match (Hub vs. Manifest)",
                            "green",
                            detail=f"SHA stimmt ueberein fuer Version \"{version_live}\": {hub_sha[:16]}...",
                        ))
                    else:
                        checks.append(_mk_check(
                            "sha-match",
                            "SHA256-Match (Hub vs. Manifest)",
                            "red",
                            detail=(
                                f"SHA-Abweichung fuer Version \"{version_live}\":\n"
                                f"  Hub:      {hub_sha[:32]}...\n"
                                f"  Manifest: {manifest_sha[:32]}..."
                            ),
                        ))

        # Live-Konsistenz
        if raw_manifest:
            default_ver = raw_manifest.get("default_version", "")
            if default_ver and version_live:
                if version_live == default_ver:
                    checks.append(_mk_check(
                        "live-consistency",
                        "Live-Hub-Konsistenz (desired_version)",
                        "green",
                        detail=f"Hub und Manifest stimmen ueberein: \"{version_live}\"",
                    ))
                else:
                    checks.append(_mk_check(
                        "live-consistency",
                        "Live-Hub-Konsistenz (desired_version)",
                        "red",
                        detail=(
                            f"Versions-Abweichung:\n"
                            f"  Manifest default_version: \"{default_ver}\"\n"
                            f"  Hub desired_version: \"{version_live}\""
                        ),
                        hint="Cache-TTL ~30s — wenn Manifest gerade geaendert: 35s warten.",
                        value_actual=version_live,
                        value_expected=default_ver,
                    ))
            elif version_live:
                checks.append(_mk_check(
                    "live-consistency",
                    "Live-Hub-Konsistenz (desired_version)",
                    "yellow",
                    detail=f"Hub meldet version=\"{version_live}\" (kein lokales Manifest zum Vergleich)",
                ))
        else:
            if version_live:
                checks.append(_mk_check(
                    "live-consistency",
                    "Live-Hub-Konsistenz (desired_version)",
                    "yellow",
                    detail=f"Hub meldet version=\"{version_live}\" (kein lokales Manifest bekannt)",
                ))

    except httpx.TimeoutException:
        checks.append(_mk_check(
            "live-consistency",
            "Live-Hub-Konsistenz (Core)",
            "red",
            detail=f"Timeout beim Abrufen von {desired_url}",
            hint="Hub laeuft? VPN/Netzwerk OK?",
        ))
    except (httpx.ConnectError, httpx.HTTPError) as exc:
        checks.append(_mk_check(
            "live-consistency",
            "Live-Hub-Konsistenz (Core)",
            "red",
            detail=f"Hub nicht erreichbar: {exc}",
        ))

    return checks


# -------------------------------------------------------------------
# Haupt-Handler
# -------------------------------------------------------------------

async def get_manifest_health(
    hub_base_url: str,
    target: str = "both",
) -> dict:
    """Fuehrt alle Manifest-Health-Checks durch und gibt strukturiertes JSON zurueck.

    Args:
        hub_base_url: Hub-URL (z.B. http://192.168.200.71:18765)
        target:       "bootstrapper" | "core" | "both" (Default: "both")

    Daten-Quellen-Strategie:
      Option A: Live-Hub-API fuer alle Checks.
      Bootstrapper-Manifest: GET /seti/distribute/info
      Core-Manifest:         GET /api/v1/seti/core/desired

    Kein SSH, kein direkter Filesystem-Zugriff.
    """
    t0 = time.monotonic()
    hub_base = hub_base_url.rstrip("/")
    now = datetime.now(timezone.utc).isoformat()
    fetched_at = now

    results: dict[str, Any] = {}

    async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:

        # --- Bootstrapper ---
        if target in ("bootstrapper", "both"):
            b_checks: list[dict] = []

            # Manifest-Rohdaten vom Hub holen (fuer Schema-Validierung)
            raw_b: dict | None = None
            raw_b_pseudo: dict | None = None
            try:
                info_url = f"{hub_base}/seti/distribute/info"
                resp = await client.get(info_url)
                if resp.is_success:
                    raw_b = resp.json()
                    # /seti/distribute/info liefert NICHT das Manifest-File direkt,
                    # sondern aufgeloeste Felder. Wir bauen ein pseudo-raw-Manifest
                    # aus den Top-Level-Feldern um Schema-Validierung zu ermoeglichen.
                    #
                    # Hinweis: Schema-Validierung ist EINGESCHRAENKT da wir das echte
                    # bootstrapper-manifest.json nicht sehen (Option A Limitation).
                    # Wir validieren was der Hub preisgibt.
                    bootstrapper_version = raw_b.get("bootstrapper_version")
                    if bootstrapper_version:
                        # Pseudomanifest fuer Cross-Ref-Check
                        binaries = raw_b.get("binaries", {})
                        boot_bin = binaries.get("bootstrapper", {})
                        pseudo_entry: dict = {
                            "sha256": boot_bin.get("sha256", ""),
                            "size": boot_bin.get("size_bytes", boot_bin.get("size", 0)),
                            "url": boot_bin.get("url", f"{hub_base}/seti/distribute/download/bootstrapper"),
                        }
                        raw_b_pseudo: dict = {
                            "default_version": bootstrapper_version,
                            "versions": {bootstrapper_version: pseudo_entry},
                            "node_overrides": {},
                        }
                    else:
                        raw_b_pseudo = None
            except Exception as exc:
                logger.debug("Bootstrapper-Manifest-Rohdaten nicht abrufbar: %s", exc)
                raw_b = None
                raw_b_pseudo = None

            # Schema-Validierung (auf Pseudo-Manifest basierend auf Hub-Daten)
            if raw_b_pseudo:
                b_checks.extend(_validate_bootstrapper_schema(raw_b_pseudo))
            else:
                b_checks.append(_mk_check(
                    "schema",
                    "Manifest-Daten vom Hub",
                    "yellow",
                    detail="Hub liefert bootstrapper_version=null — Manifest moeglicherweise nicht geladen.",
                    hint="docker restart octoboss oder bootstrapper-manifest.json pruefen.",
                ))

            # Live-Checks
            live_b = await _check_bootstrapper_live(hub_base, raw_b_pseudo, client, t0)
            b_checks.extend(live_b)

            # Duplikate entfernen (gleiche check-id)
            seen_ids: set[str] = set()
            deduped_b: list[dict] = []
            for c in b_checks:
                if c["id"] not in seen_ids:
                    seen_ids.add(c["id"])
                    deduped_b.append(c)

            errors_b = [c for c in deduped_b if c["status"] == "red"]
            warnings_b = [c for c in deduped_b if c["status"] == "yellow"]

            results["bootstrapper"] = {
                "status": _overall(deduped_b),
                "checks": deduped_b,
                "errors": [c["detail"] for c in errors_b],
                "warnings": [c["detail"] for c in warnings_b],
                "hints": list({
                    c["hint"]
                    for c in deduped_b
                    if c.get("hint") and c["status"] in ("red", "yellow")
                }),
                "hub_url": hub_base,
                "data_source": "option-a-live-hub-api",
                "manifest_endpoint": f"{hub_base}/seti/distribute/info",
            }

        # --- Core ---
        if target in ("core", "both"):
            c_checks: list[dict] = []

            # Manifest-Rohdaten vom Hub: /api/v1/seti/core/desired
            raw_c: dict | None = None
            raw_c_pseudo: dict | None = None  # bereits initialisiert, sicherheitshalber nochmal
            try:
                desired_url = f"{hub_base}/api/v1/seti/core/desired?node_id=00000000-0000-0000-0000-000000000000"
                resp_c = await client.get(desired_url)
                if resp_c.is_success:
                    raw_c = resp_c.json()
                    core_version = raw_c.get("version")
                    if core_version:
                        pseudo_core_entry: dict = {
                            "sha256": raw_c.get("sha256", ""),
                            "size_bytes": raw_c.get("size_bytes", 0),
                            "released": raw_c.get("released", ""),
                        }
                        raw_c_pseudo = {
                            "default_version": core_version,
                            "versions": {core_version: pseudo_core_entry},
                            "node_overrides": {},
                        }
            except Exception as exc:
                logger.debug("Core-Manifest-Rohdaten nicht abrufbar: %s", exc)
                raw_c = None
                raw_c_pseudo = None

            # Schema-Validierung
            if raw_c_pseudo:
                c_checks.extend(_validate_core_schema(raw_c_pseudo))
            else:
                c_checks.append(_mk_check(
                    "schema",
                    "Manifest-Daten vom Hub",
                    "yellow",
                    detail="Hub liefert keine Core-Version — /api/v1/seti/core/desired nicht erreichbar?",
                    hint="Endpoint ab rc5.x. Aeltere Hub-Version? Oder Manifest.json nicht vorhanden.",
                ))

            # Live-Checks
            live_c = await _check_core_live(hub_base, raw_c_pseudo, client, t0)
            c_checks.extend(live_c)

            # Duplikate entfernen
            seen_ids_c: set[str] = set()
            deduped_c: list[dict] = []
            for c in c_checks:
                if c["id"] not in seen_ids_c:
                    seen_ids_c.add(c["id"])
                    deduped_c.append(c)

            errors_c = [c for c in deduped_c if c["status"] == "red"]
            warnings_c = [c for c in deduped_c if c["status"] == "yellow"]

            results["core"] = {
                "status": _overall(deduped_c),
                "checks": deduped_c,
                "errors": [c["detail"] for c in errors_c],
                "warnings": [c["detail"] for c in warnings_c],
                "hints": list({
                    c["hint"]
                    for c in deduped_c
                    if c.get("hint") and c["status"] in ("red", "yellow")
                }),
                "hub_url": hub_base,
                "data_source": "option-a-live-hub-api",
                "manifest_endpoint": f"{hub_base}/api/v1/seti/core/desired",
            }

    # Summary
    all_statuses = [v["status"] for v in results.values()]
    overall = "red" if "red" in all_statuses else ("yellow" if "yellow" in all_statuses else "green")

    total_errors = sum(len(v.get("errors", [])) for v in results.values())
    total_warnings = sum(len(v.get("warnings", [])) for v in results.values())

    return {
        "manifests": results,
        "summary": {
            "overall_status": overall,
            "errors_count": total_errors,
            "warnings_count": total_warnings,
            "hub_url": hub_base,
            "data_source_note": (
                "Option A (Live-Hub-API): Schema-Validierung basiert auf vom Hub "
                "aufgeloesten Feldern, nicht auf rohem Manifest-File. "
                "node_overrides-Drift wird nur erkannt wenn Hub ihn exponiert."
            ),
            "cache_ttl_note": (
                "Hub-Cache-TTL: 30s. Kurz nach Manifest-Edit koennte "
                "live-consistency gelb sein — in 35s nochmal pruefen."
            ),
        },
        "fetched_at": fetched_at,
    }
