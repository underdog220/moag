// ProviderCard — zeigt einen einzelnen Oberon-LLM-Provider.
// Felder: Name, Health-Pill, p50/p95-Latenz, Error-Rate-Bar, last_check relativ.

import { formatRelative } from "../../lib/format";
import type { CockpitProvider } from "../../lib/types";

// ── Health-Pill ─────────────────────────────────────────────────────────────

function healthPillClass(status: string): string {
  switch (status) {
    case "healthy":
      return "bg-status-ok/20 text-status-ok border-status-ok/30";
    case "degraded":
      return "bg-status-warn/20 text-status-warn border-status-warn/30";
    case "down":
      return "bg-status-error/20 text-status-error border-status-error/30";
    default:
      return "bg-bg-elevated text-fg-muted border-white/10";
  }
}

function healthLabel(status: string): string {
  switch (status) {
    case "healthy":
      return "healthy";
    case "degraded":
      return "degraded";
    case "down":
      return "down";
    default:
      return status;
  }
}

interface HealthPillProps {
  status: string;
}

export function HealthPill({ status }: HealthPillProps) {
  return (
    <span
      data-testid="health-pill"
      data-status={status}
      className={`inline-flex items-center rounded border px-2 py-0.5 font-mono text-xxs uppercase tracking-wider ${healthPillClass(status)}`}
    >
      {healthLabel(status)}
    </span>
  );
}

// ── Latenz-Zeile ─────────────────────────────────────────────────────────────

function LatencyRow({
  p50,
  p95,
}: {
  p50: number | null;
  p95: number | null;
}) {
  const fmt = (ms: number | null) => (ms == null ? "—" : `${Math.round(ms)} ms`);
  return (
    <div className="flex items-center gap-4 text-xs text-fg-muted">
      <span>
        p50: <span data-testid="latency-p50" className="font-mono text-fg">{fmt(p50)}</span>
      </span>
      <span>
        p95: <span data-testid="latency-p95" className="font-mono text-fg">{fmt(p95)}</span>
      </span>
    </div>
  );
}

// ── Profil-Badges ────────────────────────────────────────────────────────────

function ProfileBadges({
  profiles,
}: {
  profiles: CockpitProvider["profiles"];
}) {
  if (!profiles) return null;

  // Nur Profile anzeigen, die ein Modell haben
  const aktiv = (["STANDARD", "MINI", "HEAVY", "VISION"] as const).filter(
    (k) => profiles[k] != null
  );

  if (aktiv.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1" data-testid="profile-badges">
      {aktiv.map((k) => (
        <span
          key={k}
          className="rounded bg-bg-elevated px-1.5 py-0.5 font-mono text-xxs text-fg-muted"
        >
          {k}
        </span>
      ))}
    </div>
  );
}

// ── Hauptkomponente ──────────────────────────────────────────────────────────

export interface ProviderCardProps {
  provider: CockpitProvider;
}

export function ProviderCard({ provider }: ProviderCardProps) {
  const lastCheck = provider.last_check
    ? formatRelative(provider.last_check)
    : null;

  return (
    <article
      data-testid={`provider-card-${provider.id}`}
      className="flex flex-col gap-3 rounded-lg border border-white/8 bg-bg-subtle p-4 shadow-sm"
    >
      {/* Kopfzeile: Name + Default-Badge + Health-Pill */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3
              data-testid="provider-name"
              className="truncate font-semibold text-fg"
            >
              {provider.name}
            </h3>
            {provider.is_default && (
              <span
                data-testid="default-badge"
                className="shrink-0 rounded bg-brand/20 px-1.5 py-0.5 text-xxs font-medium text-brand"
              >
                Default
              </span>
            )}
          </div>
          <p className="mt-0.5 font-mono text-xxs text-fg-muted">
            {provider.type}
          </p>
        </div>
        <HealthPill status={provider.status} />
      </div>

      {/* Latenz */}
      <LatencyRow p50={provider.latency_p50_ms} p95={provider.latency_p95_ms} />

      {/* Profil-Badges */}
      <ProfileBadges profiles={provider.profiles} />

      {/* Letzter Check */}
      {lastCheck && (
        <p className="text-xxs text-fg-subtle">
          Letzter Check: <span data-testid="last-check">{lastCheck}</span>
        </p>
      )}

      {/* Base-URL (optional, klein) */}
      {provider.base_url && (
        <p className="truncate font-mono text-xxs text-fg-subtle">
          {provider.base_url}
        </p>
      )}
    </article>
  );
}

export default ProviderCard;
