// Hub-Overview Feature — exportiert Komponenten fuer Wiederverwendung
// (z.B. Einbettung als Karte ins Cluster-Dashboard).

export { HubMultiTable } from "./HubMultiTable";
export { HubHealthDot, deriveHubStatus } from "./HubHealthDot";

// Default-Export = Karte fuer das Dashboard.
import { HubMultiTable } from "./HubMultiTable";
export default function HubOverview() {
  return <HubMultiTable />;
}
