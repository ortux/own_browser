import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles/index.css';
import { warmCache } from './lib/backgroundCache';
import { useSettingsStore } from './stores/settingsStore';

// NOTE: no authBaseUrl migration is needed here — the settings store's
// `partialize` never persists it and `merge` always re-derives it from config.

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

// A rejected promise with no handler would otherwise vanish into the void;
// surfacing it in the main log is what makes these debuggable at all.
window.addEventListener('unhandledrejection', (event) => {
  console.error('[shell] unhandled promise rejection:', event.reason);
});

// Apply the saved theme on startup so it's correct before Settings is opened.
function applyTheme() {
  const t = useSettingsStore.getState().theme;
  const resolved =
    t === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : t;
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.classList.toggle('dark', resolved === 'dark');
}
applyTheme();
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (useSettingsStore.getState().theme === 'system') applyTheme();
});

// Preload a pool of background images at startup so the first new tab (and
// every tab after) paints instantly instead of streaming in. A module-level
// flag prevents duplicate requests if this module is evaluated more than once.
let backgroundWarmed = false;
if (!backgroundWarmed) {
  backgroundWarmed = true;
  const category = useSettingsStore.getState().backgroundCategory;
  void warmCache(category);
}
