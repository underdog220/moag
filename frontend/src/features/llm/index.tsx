// Feature: LLM-Provider-Übersicht (K-FE-LLM)
// Route: /llm
// PageBadge laut globaler CLAUDE.md-Pflicht.

import { LlmTab } from "./LlmTab";
import { PageBadge } from "../../components/PageBadge";

export { LlmTab } from "./LlmTab";
export { ProviderCard } from "./ProviderCard";

export default function LlmPage() {
  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-fg">LLM-Provider</h1>
        <p className="text-xs text-fg-muted">
          Oberon Cockpit — aktualisiert alle 10 s
        </p>
      </div>
      <LlmTab />
      <PageBadge id="gui.llm" />
    </div>
  );
}
