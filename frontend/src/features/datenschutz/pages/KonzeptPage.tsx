// KonzeptPage — Datenschutzkonzept-Anzeige (Kern A laut CR 2026-06-25).
// Zeigt: Prosa (gerendertes Markdown), Quellen-Links mit Verfuegbarkeitsstatus,
// Problem-Flags mit Severity-Badge, Versionsliste, Scope-Disclaimer-Box.
// Button "Jetzt neu generieren" mit Confirm-Dialog (LLM-Kosten).
// ADR-004: Jeder Button/Zahl/Status-Symbol hat <Tooltip>.
// PageBadge: pg:datenschutz.konzept

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import { Tooltip } from "../../../components/Tooltip";
import { PageBadge } from "../../../components/PageBadge";
import type {
  DatenschutzKonzept,
  DatenschutzStubResponse,
  DatenschutzKonzeptVersion,
  DatenschutzSource,
  DatenschutzProblem,
  DatenschutzClaim,
} from "../../../lib/types";

// ── Hilfsfunktionen ──────────────────────────────────────────────────────────

function isStub(data: unknown): data is DatenschutzStubResponse {
  return typeof data === "object" && data !== null && "stub" in data && (data as DatenschutzStubResponse).stub === true;
}

function formatTs(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("de-DE", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function relativeTs(iso: string | null | undefined): string {
  if (!iso) return "unbekannt";
  try {
    const diffMs = Date.now() - new Date(iso).getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "gerade eben";
    if (diffMin < 60) return `vor ${diffMin} Min.`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `vor ${diffH} Std.`;
    return `vor ${Math.floor(diffH / 24)} Tagen`;
  } catch {
    return iso ?? "—";
  }
}

// ── Severity-Badge ───────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, string> = {
    critical: "bg-red-900/60 text-red-300 border-red-700",
    warning:  "bg-amber-900/60 text-amber-300 border-amber-700",
    info:     "bg-blue-900/60 text-blue-300 border-blue-700",
  };
  const cls = map[severity] ?? "bg-fg-subtle/20 text-fg-muted border-white/10";
  const label: Record<string, string> = {
    critical: "Kritisch",
    warning:  "Warnung",
    info:     "Info",
  };
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xxs font-semibold uppercase ${cls}`}>
      {label[severity] ?? severity}
    </span>
  );
}

// ── Claim-Status-Badge ────────────────────────────────────────────────────────

function ClaimBadge({ status }: { status: "ok" | "problem" | string }) {
  return status === "ok" ? (
    <span className="inline-block w-2 h-2 rounded-full bg-green-500 flex-shrink-0" title="Verifiziert" />
  ) : (
    <span className="inline-block w-2 h-2 rounded-full bg-red-500 flex-shrink-0" title="Problem" />
  );
}

// ── Quellen-Tabelle ───────────────────────────────────────────────────────────

function SourceTable({ sources }: { sources: DatenschutzSource[] }) {
  if (sources.length === 0) {
    return <p className="text-xs text-fg-muted">Keine Quellen angegeben.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-white/10 text-fg-muted text-left">
            <th className="py-1.5 pr-4 font-medium">Quelle</th>
            <th className="py-1.5 pr-4 font-medium">Typ</th>
            <th className="py-1.5 pr-4 font-medium">Status</th>
            <th className="py-1.5 font-medium">Zuletzt geprüft</th>
          </tr>
        </thead>
        <tbody>
          {sources.map((src) => (
            <tr key={src.id} className="border-b border-white/5 hover:bg-bg-elevated/30">
              <td className="py-1.5 pr-4">
                <Tooltip
                  title={src.title}
                  source={src.url}
                  updatedAt={src.last_checked ? relativeTs(src.last_checked) : undefined}
                >
                  <a
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:underline break-all"
                  >
                    {src.title}
                  </a>
                </Tooltip>
                {src.check_note && (
                  <p className="text-fg-muted text-xxs mt-0.5">{src.check_note}</p>
                )}
              </td>
              <td className="py-1.5 pr-4 text-fg-muted font-mono">{src.type}</td>
              <td className="py-1.5 pr-4">
                <Tooltip
                  title={src.available ? "Quelle war beim letzten Check erreichbar" : "Quelle war beim letzten Check NICHT erreichbar"}
                  source="/api/v1/oberon/datenschutz-konzept"
                  updatedAt={src.last_checked ? relativeTs(src.last_checked) : undefined}
                >
                  <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xxs font-semibold ${
                    src.available
                      ? "bg-green-900/40 text-green-300"
                      : "bg-red-900/40 text-red-300"
                  }`}>
                    <span className={`inline-block w-1.5 h-1.5 rounded-full ${src.available ? "bg-green-400" : "bg-red-400"}`} />
                    {src.available ? "Verfügbar" : "Nicht erreichbar"}
                  </span>
                </Tooltip>
              </td>
              <td className="py-1.5 text-fg-muted">
                {src.last_checked ? formatTs(src.last_checked) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Problem-Liste ─────────────────────────────────────────────────────────────

function ProblemList({ problems }: { problems: DatenschutzProblem[] }) {
  if (problems.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded border border-green-700/40 bg-green-900/20 px-3 py-2 text-xs text-green-300">
        <span className="text-base">✓</span>
        Keine bekannten Probleme in dieser Version.
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {problems.map((p) => (
        <li key={p.id} className="rounded border border-white/10 bg-bg-elevated/50 p-3">
          <div className="flex items-start gap-2">
            <Tooltip
              title={`Schwere: ${p.severity}. Problem-ID: ${p.id}. Vorhanden seit Version ${p.since_version ?? "unbekannt"}.`}
              source="/api/v1/oberon/datenschutz-konzept"
            >
              <SeverityBadge severity={p.severity} />
            </Tooltip>
            <span className="text-xs text-fg leading-relaxed">{p.statement}</span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-xxs text-fg-muted">
            <span className="font-mono">{p.id}</span>
            {p.since_version != null && (
              <span>· seit Version {p.since_version}</span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

// ── Claims-Liste ─────────────────────────────────────────────────────────────

function ClaimsList({ claims }: { claims: DatenschutzClaim[] }) {
  if (claims.length === 0) {
    return <p className="text-xs text-fg-muted">Keine Claims vorhanden.</p>;
  }
  return (
    <ul className="space-y-1.5">
      {claims.map((c, i) => (
        <li key={i} className="flex items-start gap-2 text-xs">
          <Tooltip
            title={c.status === "ok" ? "Claim verifiziert" : "Claim konnte nicht verifiziert werden"}
            source={c.source_ref}
          >
            <span className="mt-0.5">
              <ClaimBadge status={c.status} />
            </span>
          </Tooltip>
          <span className={c.status === "ok" ? "text-fg" : "text-red-300"}>
            {c.statement}
          </span>
          <span className="ml-auto font-mono text-xxs text-fg-subtle shrink-0">{c.source_ref}</span>
        </li>
      ))}
    </ul>
  );
}

// ── Versionsliste ─────────────────────────────────────────────────────────────

function VersionList({
  versions,
  onSelect,
  selectedId,
}: {
  versions: DatenschutzKonzeptVersion[];
  onSelect: (id: string) => void;
  selectedId: string | null;
}) {
  if (versions.length === 0) {
    return <p className="text-xs text-fg-muted">Nur eine Version vorhanden.</p>;
  }
  return (
    <ul className="space-y-1">
      {versions.map((v) => (
        <li key={v.id}>
          <Tooltip
            title={`Version ${v.version} — generiert ${formatTs(v.generated_at)}. ${v.is_current ? "Aktuelle Version." : "Historische Version."}`}
            source="/api/v1/oberon/datenschutz-konzept/versions"
            updatedAt={relativeTs(v.generated_at)}
          >
            <button
              onClick={() => onSelect(v.id)}
              className={`w-full text-left rounded px-2 py-1.5 text-xs transition-colors ${
                selectedId === v.id
                  ? "bg-accent/20 text-accent border border-accent/40"
                  : "hover:bg-bg-elevated/50 text-fg-muted border border-transparent"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="font-semibold text-fg">v{v.version}</span>
                {v.is_current && (
                  <span className="rounded bg-green-900/50 px-1 text-xxs text-green-300 border border-green-700/40">aktuell</span>
                )}
                <span className="ml-auto text-fg-muted">{formatTs(v.generated_at)}</span>
              </div>
            </button>
          </Tooltip>
        </li>
      ))}
    </ul>
  );
}

// ── Prosa-Markdown-Anzeige ────────────────────────────────────────────────────
// Kein externer Markdown-Parser — einfaches Pre-rendering als Plaintext
// in einem lesbaren Block. Fuer echtes Rendering: react-markdown nachrüsten.

function ProseBlock({ markdown }: { markdown: string }) {
  return (
    <pre className="whitespace-pre-wrap break-words font-sans text-sm text-fg leading-relaxed
                    rounded border border-white/5 bg-bg-subtle/30 p-4 overflow-y-auto max-h-[60vh]">
      {markdown}
    </pre>
  );
}

// ── Scope-Disclaimer-Box ──────────────────────────────────────────────────────

function ScopeDisclaimerBox({ scopeNote }: { scopeNote: string }) {
  return (
    <div className="rounded border border-amber-700/40 bg-amber-900/20 px-4 py-3">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-amber-400 font-semibold text-xs uppercase tracking-wide">Geltungsbereich</span>
        <Tooltip
          title="Dieser Bericht beschreibt den Datenschutz-Status der automatisch gerouteten Datenfluesse. Er ersetzt kein juristisches Verfahrensverzeichnis gemaess Art. 30 DSGVO."
          source="/api/v1/oberon/datenschutz-konzept"
        >
          <span className="cursor-help text-amber-500 text-sm">ⓘ</span>
        </Tooltip>
      </div>
      <p className="text-xs text-amber-200/80 leading-relaxed">{scopeNote}</p>
      <p className="mt-2 text-xxs text-amber-400/60">
        Nicht abgedeckt: Claude Code-Direktzugriff durch Entwickler ·
        Kein juristisches VVT nach Art. 30 DSGVO ·
        Technischer Bericht, kein Rechtsanwaltsgutachten
      </p>
    </div>
  );
}

// ── Integritaets-Status ───────────────────────────────────────────────────────

function IntegrityStatus({
  status,
  unlistedUrls,
}: {
  status: string;
  unlistedUrls: string[];
}) {
  const ok = status === "ok";
  return (
    <Tooltip
      title={ok
        ? "Alle ausgehenden URLs sind in der bekannten Quelle-Liste erfasst."
        : `Integritaets-Warnung: ${unlistedUrls.length} nicht erfasste URL(s) gefunden.`}
      source="/api/v1/oberon/datenschutz-konzept"
      thresholds="ok = alle URLs erfasst · warning = unbekannte URLs"
    >
      <span className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-semibold ${
        ok
          ? "bg-green-900/40 text-green-300 border border-green-700/40"
          : "bg-amber-900/40 text-amber-300 border border-amber-700/40"
      }`}>
        <span className={`inline-block w-2 h-2 rounded-full ${ok ? "bg-green-400" : "bg-amber-400"}`} />
        Integritaet: {ok ? "OK" : `Warnung (${unlistedUrls.length} unbekannte URLs)`}
      </span>
    </Tooltip>
  );
}

// ── Confirm-Dialog ────────────────────────────────────────────────────────────

function GenerateConfirmDialog({
  onConfirm,
  onCancel,
  loading,
}: {
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-lg border border-white/10 bg-bg-elevated p-6 shadow-2xl">
        <h2 className="text-base font-semibold text-fg mb-3">Datenschutzkonzept neu generieren?</h2>
        <p className="text-sm text-fg-muted mb-4">
          Dies loest eine LLM-Abfrage ueber den Oberon-DSGVO-Proxy aus.
          Die Generierung dauert <strong className="text-fg">30–120 Sekunden</strong> und
          verursacht <strong className="text-fg">LLM-Kosten</strong> (je nach Modell ca. 0,01–0,10 EUR).
        </p>
        <p className="text-xs text-amber-300/80 mb-5 border border-amber-700/30 rounded bg-amber-900/20 px-3 py-2">
          Bitte nur ausfuehren wenn eine aktualisierte Konfigurations-Basis vorliegt.
          Das Ergebnis ersetzt die bisherige aktuelle Version in der Verlaufsliste.
        </p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={loading}
            className="rounded px-4 py-2 text-sm text-fg-muted border border-white/10 hover:bg-bg-subtle/50 transition-colors disabled:opacity-50"
          >
            Abbrechen
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="rounded px-4 py-2 text-sm font-semibold bg-accent text-white hover:bg-accent/80 transition-colors disabled:opacity-50"
          >
            {loading ? "Generiere…" : "Ja, neu generieren"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Hauptseite ────────────────────────────────────────────────────────────────

export function KonzeptPage() {
  const queryClient = useQueryClient();
  const [showConfirm, setShowConfirm] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"aktuell" | "verlauf">("aktuell");

  // Aktuelle Version laden
  const konzeptQuery = useQuery({
    queryKey: ["datenschutz-konzept"],
    queryFn: () => api.datenschutz.getKonzept(),
    staleTime: 5 * 60 * 1000, // 5 Minuten
    retry: 1,
  });

  // Versionsliste laden
  const versionsQuery = useQuery({
    queryKey: ["datenschutz-konzept-versions"],
    queryFn: () => api.datenschutz.getVersions(),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  // Ausgewaehlte historische Version laden
  const versionDetailQuery = useQuery({
    queryKey: ["datenschutz-konzept-version", selectedVersionId],
    queryFn: () => api.datenschutz.getVersion(selectedVersionId!),
    enabled: selectedVersionId !== null,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  // Generierungs-Mutation
  const generateMutation = useMutation({
    mutationFn: () => api.datenschutz.generate(),
    onSuccess: () => {
      setShowConfirm(false);
      // Daten neu laden
      void queryClient.invalidateQueries({ queryKey: ["datenschutz-konzept"] });
      void queryClient.invalidateQueries({ queryKey: ["datenschutz-konzept-versions"] });
    },
    onError: () => {
      setShowConfirm(false);
    },
  });

  // Welche Daten anzeigen?
  const displayData: DatenschutzKonzept | null =
    activeTab === "verlauf" && selectedVersionId && versionDetailQuery.data
      ? versionDetailQuery.data
      : !isStub(konzeptQuery.data) && konzeptQuery.data && !("stub" in konzeptQuery.data)
        ? (konzeptQuery.data as DatenschutzKonzept)
        : null;

  const stub = isStub(konzeptQuery.data) ? konzeptQuery.data : null;
  const versions = versionsQuery.data?.versions ?? [];

  const fetchedAt = displayData?.generated_at ?? null;

  return (
    <div className="flex flex-col gap-6 p-4">
      {/* Confirm-Dialog (Mutation) */}
      {showConfirm && (
        <GenerateConfirmDialog
          onConfirm={() => generateMutation.mutate()}
          onCancel={() => setShowConfirm(false)}
          loading={generateMutation.isPending}
        />
      )}

      {/* Kopfzeile */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-fg">Datenschutzkonzept</h1>
          <p className="text-xs text-fg-muted">
            Versioniertes, quellenbelegtes DSGVO-Konzept der Oberon-Datenfluesse.
            {fetchedAt && (
              <span className="ml-1">Generiert {formatTs(fetchedAt)}.</span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Integritaets-Status */}
          {displayData && (
            <IntegrityStatus
              status={displayData.integrity_guard_status}
              unlistedUrls={displayData.integrity_guard_unlisted_urls ?? []}
            />
          )}

          {/* Generieren-Button */}
          <Tooltip
            title="Loest eine LLM-basierte Neu-Generierung des Datenschutzkonzepts aus. Verursacht LLM-Kosten (ca. 0,01–0,10 EUR). Dauer: 30–120 Sekunden."
            source="POST /api/v1/oberon/datenschutz-konzept/generate"
          >
            <button
              onClick={() => setShowConfirm(true)}
              disabled={generateMutation.isPending}
              className="rounded border border-white/10 bg-bg-elevated px-3 py-2 text-xs font-medium
                         text-fg-muted hover:bg-bg-elevated/80 hover:text-fg transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {generateMutation.isPending ? "Generiere…" : "Jetzt neu generieren"}
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Generierungs-Fehler */}
      {generateMutation.isError && (
        <div className="rounded border border-red-700/40 bg-red-900/20 px-3 py-2 text-xs text-red-300">
          Generierung fehlgeschlagen: {String((generateMutation.error as Error)?.message ?? "Unbekannter Fehler")}
        </div>
      )}

      {/* Stub-Hinweis (kein Token) */}
      {stub && (
        <div className="rounded border border-amber-700/40 bg-amber-900/20 px-4 py-3 text-xs text-amber-200">
          <strong className="text-amber-300">Kein Oberon-Token konfiguriert.</strong>{" "}
          {stub.message}
          <br />
          <span className="text-fg-muted">Bitte in den MOAG-Einstellungen den Oberon-Token eintragen.</span>
        </div>
      )}

      {/* Lade-Fehler */}
      {konzeptQuery.isError && !stub && (
        <div className="rounded border border-red-700/40 bg-red-900/20 px-3 py-2 text-xs text-red-300">
          Laden fehlgeschlagen: {String((konzeptQuery.error as Error)?.message ?? konzeptQuery.error)}
        </div>
      )}

      {/* Tab-Navigation: Aktuell / Verlauf */}
      <nav aria-label="Datenschutzkonzept-Tabs" className="flex gap-1 border-b border-white/5 pb-1">
        {(["aktuell", "verlauf"] as const).map((tab) => (
          <Tooltip
            key={tab}
            title={tab === "aktuell" ? "Aktuelle Fassung des Datenschutzkonzepts" : "Versionsverlauf — alle bisher generierten Fassungen"}
            source={tab === "aktuell" ? "/api/v1/oberon/datenschutz-konzept" : "/api/v1/oberon/datenschutz-konzept/versions"}
          >
            <button
              onClick={() => {
                setActiveTab(tab);
                if (tab === "aktuell") setSelectedVersionId(null);
              }}
              className={`rounded px-3 py-2 text-xs font-medium transition-colors ${
                activeTab === tab
                  ? "bg-accent/15 text-accent border border-accent/30"
                  : "text-fg-muted hover:text-fg border border-transparent"
              }`}
            >
              {tab === "aktuell" ? "Aktuell" : "Verlauf"}
            </button>
          </Tooltip>
        ))}
      </nav>

      {/* Verlauf-Tab: Versionsliste + Detail */}
      {activeTab === "verlauf" && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[220px_1fr]">
          {/* Versionsliste */}
          <aside className="rounded border border-white/10 bg-bg-subtle/30 p-3">
            <h2 className="mb-2 text-xs font-semibold text-fg-muted uppercase tracking-wide">Versionen</h2>
            {versionsQuery.isLoading && (
              <p className="text-xs text-fg-muted">Lade Versionen…</p>
            )}
            {versionsQuery.isError && (
              <p className="text-xs text-red-300">Fehler beim Laden der Versionen.</p>
            )}
            {versions.length > 0 && (
              <VersionList
                versions={versions}
                selectedId={selectedVersionId}
                onSelect={(id) => setSelectedVersionId(id)}
              />
            )}
            {!versionsQuery.isLoading && versions.length === 0 && (
              <p className="text-xs text-fg-muted">Keine weiteren Versionen.</p>
            )}
          </aside>

          {/* Versionsdaten */}
          <div>
            {!selectedVersionId && (
              <p className="text-xs text-fg-muted p-2">Bitte eine Version in der Liste auswaehlen.</p>
            )}
            {selectedVersionId && versionDetailQuery.isLoading && (
              <p className="text-xs text-fg-muted p-2">Lade Version…</p>
            )}
            {selectedVersionId && versionDetailQuery.isError && (
              <p className="text-xs text-red-300 p-2">Fehler beim Laden der Version.</p>
            )}
            {versionDetailQuery.data && (
              <KonzeptDetail konzept={versionDetailQuery.data} />
            )}
          </div>
        </div>
      )}

      {/* Aktuell-Tab: Konzept-Inhalt */}
      {activeTab === "aktuell" && (
        <>
          {konzeptQuery.isLoading && (
            <p className="text-xs text-fg-muted">Lade Datenschutzkonzept…</p>
          )}
          {displayData && (
            <KonzeptDetail konzept={displayData} />
          )}
        </>
      )}

      {/* PageBadge Pflicht (ADR-004 + globale Regel) */}
      <PageBadge id="datenschutz.konzept" />
    </div>
  );
}

// ── Konzept-Detail (wiederverwendbar fuer aktuell + historisch) ───────────────

function KonzeptDetail({ konzept }: { konzept: DatenschutzKonzept }) {
  const problemCount = konzept.problems?.length ?? 0;
  const claimsOk = konzept.claims?.filter((c) => c.status === "ok").length ?? 0;
  const claimsTotal = konzept.claims?.length ?? 0;
  const sourcesUnavailable = konzept.sources?.filter((s) => !s.available).length ?? 0;

  return (
    <div className="flex flex-col gap-5">
      {/* Scope-Disclaimer (immer ganz oben, prominent) */}
      {konzept.scope_note && (
        <ScopeDisclaimerBox scopeNote={konzept.scope_note} />
      )}

      {/* Status-Zeile */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <Tooltip
          title={`Version ${konzept.version} des Datenschutzkonzepts.`}
          source="/api/v1/oberon/datenschutz-konzept"
        >
          <span className="rounded bg-bg-elevated border border-white/10 px-2 py-1 text-fg-muted font-mono">
            v{konzept.version}
          </span>
        </Tooltip>

        <Tooltip
          title={`Generiert am ${konzept.generated_at ? new Date(konzept.generated_at).toLocaleString("de-DE") : "unbekannt"}.`}
          source="/api/v1/oberon/datenschutz-konzept"
          updatedAt={relativeTs(konzept.generated_at)}
        >
          <span className="text-fg-muted">{formatTs(konzept.generated_at)}</span>
        </Tooltip>

        <Tooltip
          title={`${claimsOk} von ${claimsTotal} Claims verifiziert.`}
          source="/api/v1/oberon/datenschutz-konzept"
          thresholds="gruen = alle verifiziert · gelb = Teilfehler"
        >
          <span className={`rounded px-2 py-1 text-xxs font-semibold border ${
            claimsOk === claimsTotal
              ? "bg-green-900/40 text-green-300 border-green-700/40"
              : "bg-amber-900/40 text-amber-300 border-amber-700/40"
          }`}>
            Claims {claimsOk}/{claimsTotal}
          </span>
        </Tooltip>

        {problemCount > 0 && (
          <Tooltip
            title={`${problemCount} Problem-Flag(s) in dieser Version.`}
            source="/api/v1/oberon/datenschutz-konzept"
            thresholds="0 = kein Problem · >0 = Handlungsbedarf"
          >
            <span className="rounded px-2 py-1 text-xxs font-semibold border bg-red-900/40 text-red-300 border-red-700/40">
              {problemCount} Problem{problemCount !== 1 ? "e" : ""}
            </span>
          </Tooltip>
        )}

        {sourcesUnavailable > 0 && (
          <Tooltip
            title={`${sourcesUnavailable} Quelle(n) beim letzten Check nicht erreichbar.`}
            source="/api/v1/oberon/datenschutz-konzept"
          >
            <span className="rounded px-2 py-1 text-xxs font-semibold border bg-amber-900/40 text-amber-300 border-amber-700/40">
              {sourcesUnavailable} Quelle(n) tot
            </span>
          </Tooltip>
        )}
      </div>

      {/* Problem-Flags — prominent oben wenn vorhanden */}
      {problemCount > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-fg">Problem-Flags</h2>
          <ProblemList problems={konzept.problems ?? []} />
        </section>
      )}

      {/* Prosa-Markdown */}
      {konzept.prose_markdown && (
        <section>
          <div className="mb-2 flex items-center gap-2">
            <h2 className="text-sm font-semibold text-fg">Datenschutzkonzept</h2>
            <Tooltip
              title="Automatisch generiertes Datenschutzkonzept als Prosa. Basiert auf den aktuellen Oberon-Konfigurationsfakten und Audit-Daten."
              source="/api/v1/oberon/datenschutz-konzept"
              updatedAt={relativeTs(konzept.generated_at)}
            >
              <span className="cursor-help text-fg-muted text-sm">ⓘ</span>
            </Tooltip>
          </div>
          <ProseBlock markdown={konzept.prose_markdown} />
        </section>
      )}

      {/* Claims */}
      <section>
        <div className="mb-2 flex items-center gap-2">
          <h2 className="text-sm font-semibold text-fg">Verifikations-Claims</h2>
          <Tooltip
            title="Einzelne pruefbare Aussagen aus dem Konzept mit Verifizierungsstatus (gruen = OK, rot = Problem) und Quellenreferenz."
            source="/api/v1/oberon/datenschutz-konzept"
          >
            <span className="cursor-help text-fg-muted text-sm">ⓘ</span>
          </Tooltip>
        </div>
        <ClaimsList claims={konzept.claims ?? []} />
      </section>

      {/* Quellen */}
      <section>
        <div className="mb-2 flex items-center gap-2">
          <h2 className="text-sm font-semibold text-fg">Quellen</h2>
          <Tooltip
            title="Alle Quellenreferenzen des Konzepts mit Verfuegbarkeitsstatus (gruen = erreichbar, rot = nicht erreichbar beim letzten Check)."
            source="/api/v1/oberon/datenschutz-konzept"
          >
            <span className="cursor-help text-fg-muted text-sm">ⓘ</span>
          </Tooltip>
        </div>
        <SourceTable sources={konzept.sources ?? []} />
      </section>

      {/* Konfigurationsfakten-Snapshot */}
      {konzept.facts_snapshot && (
        <section>
          <div className="mb-2 flex items-center gap-2">
            <h2 className="text-sm font-semibold text-fg">Konfigurations-Snapshot</h2>
            <Tooltip
              title="Oberon-Konfigurationswerte zum Zeitpunkt der Generierung (eingefrorener Snapshot, nicht Live-Werte)."
              source="/api/v1/oberon/datenschutz-konzept"
              updatedAt={relativeTs(konzept.generated_at)}
            >
              <span className="cursor-help text-fg-muted text-sm">ⓘ</span>
            </Tooltip>
          </div>
          <div className="rounded border border-white/10 bg-bg-subtle/30 p-3 text-xs">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
              {[
                ["DSGVO aktiviert", konzept.facts_snapshot.dsgvoEnabled?.toString() ?? "—"],
                ["FailSafe-Modus", konzept.facts_snapshot.failSafeMode?.toString() ?? "—"],
                ["NER-Modus", konzept.facts_snapshot.nerMode ?? "—"],
                ["Session-TTL (Min.)", konzept.facts_snapshot.sessionTtlMinutes?.toString() ?? "—"],
                ["Cloud-Gate sicher", konzept.facts_snapshot.safeForCloudGate?.toString() ?? "—"],
                ["Audit-Retention (Tage)", konzept.facts_snapshot.auditRetentionDays?.toString() ?? "—"],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-fg-muted">{label}</dt>
                  <dd className="font-mono text-fg">{value}</dd>
                </div>
              ))}
            </dl>
            {(konzept.facts_snapshot.aktiveScanner?.length ?? 0) > 0 && (
              <div className="mt-2 border-t border-white/5 pt-2">
                <Tooltip
                  title="Aktive PII-Scanner-Module zum Zeitpunkt der Generierung."
                  source="/api/v1/oberon/datenschutz-konzept"
                >
                  <span className="text-fg-muted">Aktive Scanner: </span>
                </Tooltip>
                <span className="font-mono text-fg">
                  {konzept.facts_snapshot.aktiveScanner.join(", ")}
                </span>
              </div>
            )}
            {konzept.facts_snapshot.provider && (
              <div className="mt-2 border-t border-white/5 pt-2">
                <Tooltip
                  title="LLM-Provider-Konfiguration zum Zeitpunkt der Generierung."
                  source="/api/v1/oberon/datenschutz-konzept"
                >
                  <span className="text-fg-muted">Provider: </span>
                </Tooltip>
                <span className="font-mono text-fg">
                  {konzept.facts_snapshot.provider.id ?? "—"}
                  {konzept.facts_snapshot.provider.model_standard && (
                    <span className="text-fg-muted"> ({konzept.facts_snapshot.provider.model_standard})</span>
                  )}
                </span>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

export default KonzeptPage;
