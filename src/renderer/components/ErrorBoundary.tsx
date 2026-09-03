import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Last line of defence for the browser shell.
 *
 * Without this, any throw during render unmounts the whole React tree and the
 * user is left staring at an empty window with no tab strip, no address bar,
 * and no way to recover short of killing the process. A crash should cost the
 * user a click, not their session.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[shell] render error:', error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  private reload = () => window.location.reload();

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-[var(--bg)] px-6">
        <div className="w-full max-w-md">
          <h1 className="text-xl font-semibold tracking-tight text-[var(--text)]">
            Something went wrong
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
            The browser interface hit an unexpected error. Your open tabs and saved data are
            unaffected.
          </p>
          <pre className="mt-4 max-h-40 overflow-auto rounded-md bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--text-faint)]">
            {error.message}
          </pre>
          <div className="mt-6 flex gap-2">
            <button
              type="button"
              onClick={this.reset}
              className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-text)] transition-colors hover:bg-[var(--accent-hover)]"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={this.reload}
              className="rounded-md border border-[var(--border-strong)] px-4 py-2 text-sm font-medium text-[var(--text)] transition-colors hover:bg-[var(--hover)]"
            >
              Reload browser
            </button>
          </div>
        </div>
      </div>
    );
  }
}
