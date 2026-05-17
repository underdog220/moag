// UploadHubPage — dritte Top-Achse des MOAG-Cockpits.
// Layout: MultiDropZone oben → Operation-Cluster als Grid → Upload-Historie unten.

import { useRef, useCallback } from "react";
import { UPLOAD_OPERATIONS } from "../../lib/uploadOperations";
import type { UploadOperation } from "../../lib/uploadOperations";
import { PageBadge } from "../../components/PageBadge";
import { MultiDropZone } from "./MultiDropZone";
import { OperationCard } from "./OperationCard";
import { UploadHistory } from "./UploadHistory";

// Cluster-Gruppierung: nach category
const CLUSTER_GROUPS: { label: string; category: UploadOperation["category"]; anchor: string }[] = [
  { label: "OCR",            category: "ocr",   anchor: "ocr" },
  { label: "LLM-Analyse",   category: "llm",   anchor: "llm" },
  { label: "Audio",         category: "audio", anchor: "audio" },
  { label: "DSGVO & PDF",  category: "dsgvo", anchor: "dsgvo" },
  { label: "PDF-Tools",    category: "pdf",   anchor: "pdf" },
];

export function UploadHubPage() {
  // Ref-Map: operation.id → DOM-Element für Scroll-Target
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map());

  const setCardRef = useCallback(
    (id: string) => (el: HTMLElement | null) => {
      if (el) {
        cardRefs.current.set(id, el);
      } else {
        cardRefs.current.delete(id);
      }
    },
    [],
  );

  // Kategorien in der richtigen Reihenfolge deduplizieren
  const seenCategories = new Set<string>();
  const clustersWithOps = CLUSTER_GROUPS
    .filter((g) => {
      const ops = UPLOAD_OPERATIONS.filter((op) => op.category === g.category);
      if (ops.length === 0) return false;
      if (seenCategories.has(g.category)) return false;
      seenCategories.add(g.category);
      return true;
    })
    .map((g) => ({
      ...g,
      ops: UPLOAD_OPERATIONS.filter((op) => op.category === g.category),
    }));

  return (
    <div className="min-h-full p-4 pb-16" data-testid="upload-hub-page">
      {/* Header */}
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-fg">MOAG — Upload-Hub</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Datei hochladen und direkt verarbeiten. Erkanntes Format → passende Operation auswählen.
        </p>
      </header>

      {/* MultiDropZone: Datei rein → kompatible Ops werden vorgeschlagen */}
      <MultiDropZone
        onOperationSelect={(_file, op) => {
          // Scroll zur OperationCard (bereits via handleOperationClick in MultiDropZone)
          const el = cardRefs.current.get(op.id);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }}
      />

      {/* Anchor-Sprung-Links (Cluster-Navigation) */}
      <nav
        aria-label="Operation-Cluster"
        className="mb-6 flex flex-wrap gap-2"
      >
        {clustersWithOps.map((g) => (
          <a
            key={g.anchor}
            href={`#cluster-${g.anchor}`}
            className="rounded border border-white/10 bg-bg-elevated px-2.5 py-1
                       text-xs text-fg-muted hover:border-white/20 hover:text-fg
                       transition-colors"
          >
            #{g.label}
          </a>
        ))}
      </nav>

      {/* Operation-Cluster */}
      {clustersWithOps.map((cluster) => (
        <section
          key={cluster.anchor}
          id={`cluster-${cluster.anchor}`}
          className="mb-10"
          data-testid={`cluster-${cluster.anchor}`}
        >
          {/* Cluster-Headline */}
          <div className="mb-4 flex items-center gap-3">
            <h2 className="text-base font-semibold uppercase tracking-wide text-fg-subtle">
              {cluster.label}
            </h2>
            <span className="text-xs text-fg-subtle">
              {cluster.ops.length} Operation{cluster.ops.length !== 1 ? "en" : ""}
            </span>
          </div>

          {/* OperationCards im responsive Grid */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {cluster.ops.map((op) => (
              <OperationCard
                key={op.id}
                operation={op}
                cardRef={setCardRef(op.id)}
              />
            ))}
          </div>
        </section>
      ))}

      {/* Upload-Historie */}
      <UploadHistory />

      {/* PageBadge — Pflicht aus CLAUDE.md / ADR-004 */}
      <PageBadge id="upload.hub" />
    </div>
  );
}

export default UploadHubPage;
