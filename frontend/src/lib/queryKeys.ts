// Zentrale React-Query-Key-Convention.
//
// WICHTIG: Niemals hardcoded Strings als queryKey verwenden — immer ueber `qk`.
// Sonst greifen invalidateQueries-Aufrufe nicht und Tabs zeigen veraltete Daten.
//
// Hierarchie:
//   qk.cluster.{hubs|nodes|engines|edgeLog}
//   qk.charts.{throughput|engines|doctypes|roundRobin|failures}
//   qk.jobs.{list|detail|text|ab}
//   qk.settings, qk.health

export const qk = {
  health: ["health"] as const,

  cluster: {
    hubs: ["cluster", "hubs"] as const,
    nodes: ["cluster", "nodes"] as const,
    engines: ["cluster", "engines"] as const,
    edgeLog: ["cluster", "edge-log"] as const,
    swarmStatus: ["cluster", "swarm", "status"] as const,
    swarmPeers: ["cluster", "swarm", "peers"] as const,
  },

  charts: {
    throughput: (range: string) => ["charts", "throughput", range] as const,
    engines: ["charts", "engine-performance"] as const,
    doctypes: ["charts", "doctype-distribution"] as const,
    roundRobin: ["charts", "round-robin"] as const,
    failures: ["charts", "failure-rate"] as const,
  },

  jobs: {
    list: (filters?: Record<string, unknown>) =>
      filters ? (["jobs", "list", filters] as const) : (["jobs", "list"] as const),
    detail: (id: string) => ["jobs", "detail", id] as const,
    text: (id: string) => ["jobs", "text", id] as const,
    ab: (id: string) => ["jobs", "ab-compare", id] as const,
  },

  settings: ["settings"] as const,

  // Oberon Cockpit-API (5 Endpoints).
  cockpit: {
    providers: ["cockpit", "providers"] as const,
    calls: (since?: string) => ["cockpit", "calls", since ?? null] as const,
    cost: (from: string, to: string, groupBy: string) =>
      ["cockpit", "cost", from, to, groupBy] as const,
    audit: (since?: string) => ["cockpit", "audit", since ?? null] as const,
    smoke: ["cockpit", "smoke"] as const,
  },

  // MOAG-Aggregator-Endpoints
  overview: ["overview"] as const,
  aggregator: {
    health: ["aggregator", "health"] as const,
  },

  // MOAG-Aktionen-API
  actions: ["actions"] as const,
} as const;
