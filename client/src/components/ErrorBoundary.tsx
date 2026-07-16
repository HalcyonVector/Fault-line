import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * A last-resort safety net. A live ops dashboard tracking a real, permanent
 * ledger shouldn't white-screen silently if a component throws; this at
 * least tells the operator it broke and offers a way back.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] caught an error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-fallback">
          <p className="error-fallback-title">Something went wrong.</p>
          <p className="error-fallback-body">
            The dashboard hit an unexpected error. Refreshing usually fixes it; the shared world state on the
            server is unaffected.
          </p>
          <button onClick={() => window.location.reload()}>Refresh</button>
        </div>
      );
    }
    return this.props.children;
  }
}
