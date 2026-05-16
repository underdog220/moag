// StatusDot — kleiner Statuskreis (gruen/gelb/rot).

import type { HTMLAttributes } from "react";

export type StatusKind = "ok" | "warn" | "error" | "info" | "neutral";

const COLOR: Record<StatusKind, string> = {
  ok: "bg-status-ok",
  warn: "bg-status-warn",
  error: "bg-status-error",
  info: "bg-status-info",
  neutral: "bg-status-neutral",
};

const SIZE = {
  sm: "h-2 w-2",
  md: "h-2.5 w-2.5",
  lg: "h-3 w-3",
};

export interface StatusDotProps extends HTMLAttributes<HTMLSpanElement> {
  status: StatusKind;
  size?: keyof typeof SIZE;
  pulse?: boolean;
  label?: string;
}

export function StatusDot({
  status,
  size = "md",
  pulse = false,
  label,
  className = "",
  ...rest
}: StatusDotProps) {
  return (
    <span
      {...rest}
      data-testid="status-dot"
      data-status={status}
      role="status"
      aria-label={label ?? status}
      className={`inline-block rounded-full ${COLOR[status]} ${SIZE[size]}
                  ${pulse ? "animate-pulse" : ""} ${className}`}
    />
  );
}

export default StatusDot;
