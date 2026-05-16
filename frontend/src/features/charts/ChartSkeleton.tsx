// Skeleton-Placeholder waehrend isLoading.
// Strikt CSS-basiert, kein recharts-Render im Loading-State (vermeidet ResizeObserver-Noise in Tests).

export interface ChartSkeletonProps {
  /** Hoehe in Pixeln, default 240. */
  height?: number;
  /** Optionaler Aria-Label-Text. */
  label?: string;
}

export function ChartSkeleton({ height = 240, label = "Chart laedt" }: ChartSkeletonProps) {
  return (
    <div
      data-testid="chart-skeleton"
      role="status"
      aria-live="polite"
      aria-label={label}
      className="relative w-full overflow-hidden rounded-md bg-bg-elevated/40"
      style={{ height }}
    >
      <div
        className="absolute inset-0 animate-pulse bg-gradient-to-r from-bg-subtle via-bg-elevated to-bg-subtle"
        aria-hidden="true"
      />
      <div className="absolute bottom-3 left-3 right-3 flex items-end gap-1 opacity-40">
        {[24, 38, 56, 32, 70, 48, 64, 30, 80, 50, 60, 42].map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-sm bg-fg-subtle/40"
            style={{ height: `${h}%` }}
            aria-hidden="true"
          />
        ))}
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}

export default ChartSkeleton;
