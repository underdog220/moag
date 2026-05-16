// Cost-Feature — Public Entry Point.
// Rendert CostTab + PageBadge.

import { PageBadge } from "../../components/PageBadge";
import { CostTab } from "./CostTab";

export function CostPage() {
  return (
    <>
      <CostTab />
      <PageBadge id="gui.cost" />
    </>
  );
}

export default CostPage;
