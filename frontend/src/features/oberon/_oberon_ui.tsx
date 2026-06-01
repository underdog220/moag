// Lokale UI-Bausteine fuer Oberon-Sub-Seiten — Amber-Mission-Control-Stil.
// Lokal gehalten (kein Import aus octoboss) um Kopplung zu vermeiden.
// Verwendbar in allen Dateien unter features/oberon/.

import type { ReactNode } from "react";
import { Tooltip } from "../../components/Tooltip";

// ─── relTime ─────────────────────────────────────────────────────────────────

export function relTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return `vor ${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `vor ${m}min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `vor ${h}h`;
    return `vor ${Math.floor(h / 24)}d`;
  } catch {
    return iso;
  }
}

// ─── Panel ───────────────────────────────────────────────────────────────────

export function Panel({
  title,
  children,
  className = "",
  "data-testid": dataTestId,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  "data-testid"?: string;
}) {
  return (
    <section
      className={`rounded-lg border border-white/10 bg-bg-panel p-3 ${className}`}
      {...(dataTestId ? { "data-testid": dataTestId } : {})}
    >
      <h3 className="mb-2 border-b border-white/10 pb-1.5 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
        {title}
      </h3>
      {children}
    </section>
  );
}

// ─── KV-Zeile ────────────────────────────────────────────────────────────────

export function KV({
  label,
  value,
  tip,
  source,
  mono,
}: {
  label: string;
  value: ReactNode;
  tip?: string;
  source?: string;
  mono?: boolean;
}) {
  const val = (
    <span className={`text-sm text-fg ${mono ? "font-mono break-all" : ""}`}>{value}</span>
  );
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <span className="shrink-0 text-xs text-fg-muted">{label}</span>
      {tip ? (
        <Tooltip title={tip} source={source ?? ""}>
          <span className="text-right">{val}</span>
        </Tooltip>
      ) : (
        <span className="text-right">{val}</span>
      )}
    </div>
  );
}

// ─── Chip ────────────────────────────────────────────────────────────────────

export function Chip({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "ok" | "warn" | "error" | "neutral" | "brand";
}) {
  const cls =
    tone === "ok"
      ? "border-status-ok/40 text-status-ok"
      : tone === "warn"
        ? "border-status-warn/40 text-status-warn"
        : tone === "error"
          ? "border-status-error/40 text-status-error"
          : tone === "brand"
            ? "border-brand/40 text-brand"
            : "border-fg-subtle/30 text-fg-muted";
  return (
    <span className={`rounded border px-1.5 py-0.5 text-xxs font-semibold uppercase ${cls}`}>
      {children}
    </span>
  );
}

// ─── StatusBadge (groesser als Chip, fuer prominente Status-Anzeige) ──────────

export function StatusBadge({
  status,
}: {
  status: "healthy" | "degraded" | "down" | "ok" | "error" | "warn" | "unknown" | string;
}) {
  const normalized = status?.toLowerCase() ?? "unknown";
  const isOk = normalized === "healthy" || normalized === "ok" || normalized === "pass";
  const isWarn = normalized === "degraded" || normalized === "warn" || normalized === "warning";
  const isErr = normalized === "down" || normalized === "error" || normalized === "fail" || normalized === "failed";
  const cls = isOk
    ? "border-status-ok/30 bg-status-ok/10 text-status-ok"
    : isWarn
      ? "border-status-warn/30 bg-status-warn/10 text-status-warn"
      : isErr
        ? "border-status-error/30 bg-status-error/10 text-status-error"
        : "border-fg-subtle/20 bg-bg-elevated text-fg-muted";
  return (
    <span className={`rounded border px-1.5 py-0.5 text-xxs font-medium ${cls}`}>
      {status}
    </span>
  );
}

// ─── MiniBar (Bargraph fuer prozentuale Werte) ────────────────────────────────

export function MiniBar({
  value,
  segs = 10,
}: {
  value: number | null | undefined;
  segs?: number;
}) {
  const filled =
    value == null ? 0 : Math.round((Math.min(Math.max(value, 0), 100) / 100) * segs);
  const color =
    value == null
      ? ""
      : value > 90
        ? "bg-status-error"
        : value > 70
          ? "bg-status-warn"
          : "bg-status-ok";
  return (
    <span className="inline-flex gap-0.5" aria-hidden="true">
      {Array.from({ length: segs }).map((_, i) => (
        <span
          key={i}
          className={`h-2.5 w-1 rounded-[1px] ${i < filled ? color : "bg-fg-subtle/15"}`}
        />
      ))}
    </span>
  );
}

// ─── Fehlerkarte ─────────────────────────────────────────────────────────────

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded border border-status-error/30 bg-status-error/10 px-3 py-2 text-sm text-status-error">
      Fehler: {message}
    </div>
  );
}
