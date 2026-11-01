import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/** Last-resort safety net so a render error shows a way back instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="error-fallback" role="alert">
        <h1>Something went wrong.</h1>
        <p>Fault Line hit an unexpected error. Refreshing usually fixes it.</p>
        {import.meta.env.DEV && <pre>{this.state.error.message}</pre>}
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
          Refresh
        </button>
      </div>
    );
  }
}
