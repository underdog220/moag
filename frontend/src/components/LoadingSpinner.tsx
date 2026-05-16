// Wiederverwendbarer Lade-Indikator.

export interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  label?: string;
  inline?: boolean;
}

const SIZE_MAP = {
  sm: "h-4 w-4 border-2",
  md: "h-6 w-6 border-2",
  lg: "h-10 w-10 border-[3px]",
};

export function LoadingSpinner({ size = "md", label, inline = false }: LoadingSpinnerProps) {
  const dim = SIZE_MAP[size];
  const Wrapper = inline ? "span" : "div";
  return (
    <Wrapper
      data-testid="loading-spinner"
      role="status"
      aria-live="polite"
      className={`inline-flex items-center gap-2 ${inline ? "" : "justify-center p-4"}`}
    >
      <span
        className={`${dim} animate-spin rounded-full border-fg-subtle border-t-brand`}
        aria-hidden="true"
      />
      {label && <span className="text-sm text-fg-muted">{label}</span>}
      <span className="sr-only">{label ?? "Laden"}</span>
    </Wrapper>
  );
}

export default LoadingSpinner;
