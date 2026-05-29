import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Top-level error boundary. Converts an otherwise-blank white screen (from an
 * uncaught render error) into a readable message with the error text, so
 * failures in deployed/preview builds are diagnosable.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface in the console for deployed builds.
    console.error("Unhandled UI error:", error, info);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-6">
        <div className="max-w-lg w-full rounded-lg border border-line bg-surface p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-ink">
            Something went wrong
          </h1>
          <p className="mt-2 text-sm text-ink-3">
            The app failed to render. The error below should point at the cause
            (a common one in preview builds is a missing or stale
            <code className="font-mono"> VITE_CLERK_PUBLISHABLE_KEY</code>).
          </p>
          <pre className="mt-4 max-h-64 overflow-auto rounded-md bg-surface-2 p-3 text-xs text-ink-2 whitespace-pre-wrap break-words">
            {error.message}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 inline-flex h-9 items-center rounded-md bg-ink px-4 text-[13px] font-medium text-[color:var(--c-accent-fg)] hover:bg-ink-2"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
