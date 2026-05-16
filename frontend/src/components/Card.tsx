// Schlanke Karten-Komponente fuer Panels.

import type { HTMLAttributes, ReactNode } from "react";

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  bodyClassName?: string;
}

export function Card({
  title,
  description,
  actions,
  children,
  className = "",
  bodyClassName = "",
  ...rest
}: CardProps) {
  return (
    <div
      {...rest}
      className={`rounded-lg border border-white/5 bg-bg-panel shadow-sm ${className}`}
    >
      {(title || actions) && (
        <div className="flex items-start justify-between gap-2 border-b border-white/5 px-4 py-3">
          <div>
            {title && <h2 className="text-sm font-semibold text-fg">{title}</h2>}
            {description && (
              <p className="mt-0.5 text-xs text-fg-muted">{description}</p>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={`p-4 ${bodyClassName}`}>{children}</div>
    </div>
  );
}

export default Card;
