// Audit-Feature — Public Entry Point.
// Rendert AuditTab + PageBadge.

import { PageBadge } from "../../components/PageBadge";
import { AuditTab } from "./AuditTab";

export function AuditPage() {
  return (
    <>
      <AuditTab />
      <PageBadge id="gui.audit" />
    </>
  );
}

export default AuditPage;
