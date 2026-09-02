import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/index.css';
import { warmCache } from './lib/backgroundCache';
import { useSettingsStore } from './stores/settingsStore';

// ── Purge any stale authBaseUrl persisted from a previous session ─────────────
try {
  const KEY = 'own-browser-settings';
  const raw = localStorage.getItem(KEY);
  if (raw) {
    const parsed = JSON.parse(raw);
    if (parsed?.state?.authBaseUrl) {
      delete parsed.state.authBaseUrl;
      localStorage.setItem(KEY, JSON.stringify(parsed));
    }
  }
} catch {
  /* best-effort */
}
// ─────────────────────────────────────────────────────────────────────────────

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

console.log('[Renderer] Starting app...');
console.log('[Renderer] browserAPI available:', !!window.browserAPI);

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

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
