// Schlanker Toggle-Switch (kontrolliert).

export interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  testId?: string;
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
  testId,
}: ToggleProps) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        data-testid={testId}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors
                    ${checked ? "bg-brand" : "bg-bg-elevated border border-white/10"}
                    disabled:cursor-not-allowed`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                      ${checked ? "translate-x-4" : "translate-x-0.5"}`}
        />
      </button>
      <span className="flex flex-col">
        <span className="text-sm text-fg">{label}</span>
        {description && (
          <span className="text-xs text-fg-muted">{description}</span>
        )}
      </span>
    </label>
  );
}

export default Toggle;
