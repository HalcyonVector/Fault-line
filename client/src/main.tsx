import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

// Safe to use <StrictMode> now: there's no live Web Audio graph to tear down
// mid-session anymore, just idempotent polling hooks (useQuakeFeed,
// useWorldState) that tolerate a double-invoked effect in dev.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

// Only register in production builds: in dev this would cache Vite's
// module graph and fight with HMR.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Offline shell caching is a nice-to-have; failure here shouldn't be user-visible.
    });
  });
}
