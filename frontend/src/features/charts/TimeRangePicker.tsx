// Zeitraum-Filter mit 4 Presets + Custom (from/to-Input).
// Persistent in localStorage, controlled component.

import { useState } from "react";
import type { TimeRange, TimeRangePreset } from "./timeRange";

export interface TimeRangePickerProps {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
}

const PRESETS: { id: TimeRangePreset; label: string }[] = [
  { id: "24h", label: "24h" },
  { id: "7d", label: "7d" },
  { id: "30d", label: "30d" },
  { id: "custom", label: "Custom" },
];

export function TimeRangePicker({ value, onChange }: TimeRangePickerProps) {
  const [customFrom, setCustomFrom] = useState(value.from ?? "");
  const [customTo, setCustomTo] = useState(value.to ?? "");

  const onPresetClick = (preset: TimeRangePreset) => {
    if (preset === "custom") {
      onChange({
        preset: "custom",
        from: customFrom || new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10),
        to: customTo || new Date().toISOString().slice(0, 10),
      });
      return;
    }
    onChange({ preset });
  };

  const applyCustom = () => {
    if (!customFrom || !customTo) return;
    onChange({ preset: "custom", from: customFrom, to: customTo });
  };

  return (
    <div
      data-testid="time-range-picker"
      className="flex flex-wrap items-center gap-2 text-xs"
    >
      <div role="tablist" aria-label="Zeitraum" className="flex items-center gap-1">
        {PRESETS.map((p) => {
          const active = value.preset === p.id;
          return (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`range-preset-${p.id}`}
              onClick={() => onPresetClick(p.id)}
              className={`rounded px-2.5 py-1 transition-colors ${
                active
                  ? "bg-brand text-white"
                  : "bg-bg-subtle text-fg-muted hover:text-fg"
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {value.preset === "custom" && (
        <div className="flex items-center gap-1">
          <input
            type="date"
            data-testid="range-custom-from"
            aria-label="Von"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="rounded border border-white/10 bg-bg-subtle px-2 py-1 text-fg"
          />
          <span className="text-fg-subtle">-</span>
          <input
            type="date"
            data-testid="range-custom-to"
            aria-label="Bis"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="rounded border border-white/10 bg-bg-subtle px-2 py-1 text-fg"
          />
          <button
            type="button"
            data-testid="range-custom-apply"
            onClick={applyCustom}
            className="rounded bg-brand px-2 py-1 text-white hover:bg-brand-hover"
          >
            Anwenden
          </button>
        </div>
      )}
    </div>
  );
}

export default TimeRangePicker;
