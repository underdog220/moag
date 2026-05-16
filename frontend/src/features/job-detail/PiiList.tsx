// PII-Liste mit Anzahl, anonymisiertem Beispiel und Click-zu-Sprung im PDF.
// Schema-Quelle: ocrexpert/pii/detector.py (PII_KATEGORIEN + PiiTreffer)

import type { PiiFinding } from "../../lib/types";

export interface PiiListProps {
  findings: PiiFinding[] | undefined;
  /** Wird mit (page, bbox?) aufgerufen wenn der User auf einen Eintrag klickt. */
  onNavigate?: (page: number, bbox?: [number, number, number, number]) => void;
}

function piiTypeColor(t: string): string {
  // Farbschema je Kategorie — visuell trennen damit lange Listen lesbar bleiben
  const upper = t.toUpperCase();
  if (upper === "PERSON" || upper === "GEBURTSNAME") return "bg-status-warn/20 text-status-warn";
  if (upper === "ADDRESS" || upper === "ADRESSE") return "bg-brand/20 text-brand";
  if (upper === "IBAN" || upper === "EMAIL" || upper === "PHONE" || upper === "TELEFON")
    return "bg-status-error/20 text-status-error";
  if (upper === "DATUM" || upper === "NOTAR") return "bg-status-info/20 text-status-info";
  return "bg-status-neutral/20 text-fg-muted";
}

export function PiiList({ findings, onNavigate }: PiiListProps) {
  if (!findings || findings.length === 0) {
    return (
      <div
        data-testid="pii-list-empty"
        className="rounded border border-dashed border-white/10 p-4 text-center text-sm text-fg-muted"
      >
        Keine PII-Funde erkannt.
      </div>
    );
  }

  return (
    <ul data-testid="pii-list" className="flex flex-col gap-2">
      {findings.map((f, idx) => {
        const firstHit = f.hits?.[0];
        const clickable = onNavigate && firstHit;
        return (
          <li
            key={`${f.type}-${idx}`}
            data-testid={`pii-item-${f.type}`}
            className={`flex items-center justify-between gap-2 rounded border border-white/5
                        bg-bg-elevated px-3 py-2 transition-colors ${
                          clickable ? "cursor-pointer hover:border-brand/50" : ""
                        }`}
            onClick={() => clickable && onNavigate(firstHit.page, firstHit.bbox)}
            onKeyDown={(e) => {
              if (clickable && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                onNavigate(firstHit.page, firstHit.bbox);
              }
            }}
            role={clickable ? "button" : undefined}
            tabIndex={clickable ? 0 : undefined}
          >
            <div className="flex min-w-0 items-center gap-2">
              <span
                className={`inline-flex items-center rounded px-1.5 py-0.5 font-mono text-xxs uppercase
                            ${piiTypeColor(f.type)}`}
              >
                {f.type}
              </span>
              <span className="truncate text-xs text-fg-muted">
                {f.examples[0] ?? "(kein Beispiel)"}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2 text-xs">
              <span className="font-mono text-fg">×{f.count}</span>
              {clickable && (
                <span
                  className="text-fg-subtle"
                  aria-label={`Springe zu Seite ${firstHit.page}`}
                  title={`Springe zu Seite ${firstHit.page}`}
                >
                  &rsaquo;
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default PiiList;
