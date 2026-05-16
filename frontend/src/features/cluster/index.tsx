// Feature: Schwarm-Cluster-Status (Modul H3)
// Eigene Top-Level-Route /cluster.
// PageBadge laut globaler CLAUDE.md-Pflicht.

import { SwarmStatusPanel } from "./SwarmStatusPanel";
import { PageBadge } from "../../components/PageBadge";

export { SwarmStatusPanel } from "./SwarmStatusPanel";

export default function ClusterSwarmPage() {
  return (
    <>
      <SwarmStatusPanel />
      <PageBadge id="cluster.swarm" />
    </>
  );
}
