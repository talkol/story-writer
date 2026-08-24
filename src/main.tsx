import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import './fonts.css';
import './icons.css';
import './styles.css';

// Hash routing: the app is a static bundle that may be served from a subdirectory, and
// the device back gesture should move between screens.

// Fixtures and the storage smoke test are dev-only. The dynamic import inside this
// statically-false branch is dead code in a production build, so none of it ships.
if (import.meta.env.DEV) {
  void import('./dev/devtools').then((m) => m.install());
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </HashRouter>
  </StrictMode>,
);
