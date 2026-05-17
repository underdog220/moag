// features/aktionen/index.tsx — Re-Export für Routing + Phase-2-Drilldown-Import.
// ActionCard ist bewusst separat exportiert (DRY-Wiederverwendung).

export { AktionenPage } from "./AktionenPage";
export { ActionCard } from "./ActionCard";

import { AktionenPage } from "./AktionenPage";
export default AktionenPage;
