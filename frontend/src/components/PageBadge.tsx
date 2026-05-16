// PageBadge — Pflicht aus globaler CLAUDE.md (UI-Sichtbarkeits-Regel).
// Zeigt unten rechts die Page-Identitaet + Build-Hash + Build-Timestamp,
// damit auf Screenshots eindeutig erkennbar ist welche Route + welcher Build laeuft.

import { BUILD_HASH, BUILD_TS } from "../lib/env";

export interface PageBadgeProps {
  /** Eindeutige Page-Kennung, z.B. "gui.dashboard". */
  id: string;
}

function shortTs(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  } catch {
    return iso;
  }
}

export function PageBadge({ id }: PageBadgeProps) {
  return (
    <div
      data-testid="page-badge"
      className="pointer-events-none fixed bottom-2 right-2 z-50 select-text rounded
                 border border-white/10 bg-bg-elevated/90 px-2 py-1 font-mono text-xxs
                 text-fg-muted shadow-md backdrop-blur-sm"
      title={`Page-Identitaet, Commit ${BUILD_HASH}, Build ${BUILD_TS}`}
    >
      <span className="text-fg-muted">pg:</span>
      <span className="text-fg">{id}</span>
      <span className="mx-1 text-fg-subtle">·</span>
      <span className="text-fg-muted">{BUILD_HASH}</span>
      <span className="mx-1 text-fg-subtle">·</span>
      <span className="text-fg-muted">{shortTs(BUILD_TS)}</span>
    </div>
  );
}

export default PageBadge;
