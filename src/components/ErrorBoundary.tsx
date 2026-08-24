import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Last line of defence. Without one, a render error anywhere unmounts the whole tree
 * and leaves a blank white page — with the reader's stories still safely in storage but
 * no way to reach them, and no indication anything went wrong.
 */
interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[app] render failed', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="crash">
        <h1 className="crash__title">Something went wrong</h1>
        <p className="crash__body">
          Your stories are safe — they are stored on this device and were not affected.
        </p>
        <p className="crash__detail">{error.message}</p>
        <div className="crash__actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              // Route first, then clear the error. Clearing first re-renders the
              // children on the route that just threw, which throws again and lands
              // straight back here. The router is unmounted while the fallback shows,
              // so it picks up the new hash when the tree remounts.
              window.location.hash = '#/library';
              this.setState({ error: null });
            }}
          >
            Back to Library
          </button>
          <button type="button" className="btn" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </div>
    );
  }
}
