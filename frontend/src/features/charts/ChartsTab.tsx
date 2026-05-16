// ChartsTab: Aggregator fuer alle 5 Charts + Zeitraum-Filter.
// Persistiert Range in localStorage; einige Charts (engine-performance, doctype, round-robin, failure-rate)
// nehmen aktuell Range nicht entgegen (Backend liefert Gesamt-Aggregate) - Throughput nutzt sie.

import { useCallback, useEffect, useState } from "react";
import { PageBadge } from "../../components/PageBadge";
import { ThroughputChart } from "./ThroughputChart";
import { EnginePerformanceChart } from "./EnginePerformanceChart";
import { DoctypeDistributionChart } from "./DoctypeDistributionChart";
import { RoundRobinChart } from "./RoundRobinChart";
import { FailureRateChart } from "./FailureRateChart";
import { TimeRangePicker } from "./TimeRangePicker";
import {
  loadTimeRange,
  saveTimeRange,
  rangeLabel,
  type TimeRange,
} from "./timeRange";

export function ChartsTab() {
  const [range, setRange] = useState<TimeRange>(() => loadTimeRange());

  useEffect(() => {
    saveTimeRange(range);
  }, [range]);

  const onChange = useCallback((r: TimeRange) => setRange(r), []);

  return (
    <div className="space-y-4 p-4" data-testid="charts-tab">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-fg">Charts</h1>
          <p className="text-xs text-fg-muted">{rangeLabel(range)}</p>
        </div>
        <TimeRangePicker value={range} onChange={onChange} />
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <ThroughputChart range={range} />
        <EnginePerformanceChart />
      </div>

      <DoctypeDistributionChart />

      <div className="grid gap-4 lg:grid-cols-2">
        <RoundRobinChart />
        <FailureRateChart />
      </div>

      <PageBadge id="gui.charts" />
    </div>
  );
}

export default ChartsTab;
