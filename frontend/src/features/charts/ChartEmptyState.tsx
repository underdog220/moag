// Standardisierter Empty-State fuer alle Charts.
// Pflicht-Text aus Briefing F: "Noch zu wenig Daten - fahre 10 Jobs durch um Trends zu sehen".

import { EmptyState } from "../../components/EmptyState";

const MIN_DATAPOINTS = 5;

export interface ChartEmptyStateProps {
  /** Anzahl der vorhandenen Datenpunkte; bei < MIN_DATAPOINTS wird Empty-State gezeigt. */
  count: number;
  /** Title-Override, falls Sub-Charts spezifischer formulieren wollen. */
  title?: string;
  /** Beschreibung-Override. */
  description?: string;
  /** Wenn true, ueberschreibt count-Logik und zeigt immer Empty-State. */
  force?: boolean;
}

export function shouldShowEmpty(count: number): boolean {
  return count < MIN_DATAPOINTS;
}

export function ChartEmptyState({
  count,
  title = "Noch zu wenig Daten",
  description = "Fahre mindestens 10 Jobs durch, um Trends zu sehen.",
  force = false,
}: ChartEmptyStateProps) {
  if (!force && !shouldShowEmpty(count)) return null;
  return <EmptyState title={title} description={description} />;
}

export const CHART_MIN_DATAPOINTS = MIN_DATAPOINTS;

export default ChartEmptyState;
