// ErrorBoundary — faengt unerwartete Component-Fehler ab und zeigt Fallback.

import { Component, type ErrorInfo, type ReactNode } from "react";

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // In Production sollte hier ein Logger andocken (Pipeline-Logging).
    // Fuer Phase 1 reicht console.
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  handleReload = () => {
    if (typeof window !== "undefined") window.location.reload();
  };

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div
          data-testid="error-boundary"
          className="m-4 rounded-lg border border-status-error/40 bg-status-error/10 p-6"
        >
          <h2 className="text-lg font-semibold text-status-error">
            Etwas ist schiefgelaufen
          </h2>
          <p className="mt-2 text-sm text-fg-muted">
            Ein unerwarteter Fehler ist aufgetreten. Du kannst die Ansicht neu laden
            oder es nochmal versuchen.
          </p>
          <pre
            className="mt-3 max-h-40 overflow-auto rounded bg-bg-elevated p-2 font-mono
                       text-xxs text-fg-muted"
          >
            {String(this.state.error.message ?? this.state.error)}
          </pre>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={this.handleReload}
              className="rounded border border-white/10 bg-brand px-3 py-1.5 text-sm
                         font-medium text-white hover:bg-brand-hover"
            >
              Seite neu laden
            </button>
            <button
              type="button"
              onClick={this.handleReset}
              className="rounded border border-white/10 px-3 py-1.5 text-sm text-fg
                         hover:bg-bg-elevated"
            >
              Erneut versuchen
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
