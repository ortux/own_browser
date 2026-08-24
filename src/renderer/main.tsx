import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/index.css';
import { warmCache } from './lib/backgroundCache';
import { useSettingsStore } from './stores/settingsStore';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

console.log('[Renderer] Starting app...');
console.log('[Renderer] browserAPI available:', !!window.browserAPI);

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Dismiss preloader once React has painted the first frame
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    const preloader = document.getElementById('preloader');
    if (preloader) preloader.classList.add('hidden');
  });
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
// every tab after) paints instantly instead of streaming in. Guarded so
// React.StrictMode's double-invoke in dev doesn't fetch twice.
if (!(window as any).__bgWarmed) {
  (window as any).__bgWarmed = true;
  const category = useSettingsStore.getState().backgroundCategory;
  void warmCache(category);
}
