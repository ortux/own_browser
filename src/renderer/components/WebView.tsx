import React, { useEffect, useRef, useState } from 'react';
import type { Tab } from '../../shared/types';
import { webviewRegistry } from '../stores/webviewRegistry';
import { applySponsorBlock } from '../lib/sponsorBlock';

interface WebViewProps {
  tab: Tab;
}

export const WebView: React.FC<WebViewProps> = ({ tab }) => {
  const webviewRef = useRef<Electron.WebviewTag>(null);
  const [loadError, setLoadError] = useState<{ code: number; desc: string } | null>(null);
  // Capture the URL only once, on first mount. The webview must NOT have its
  // `src` bound reactively to `tab.url`, or every store update (including
  // client-side SPA navigations like ChatGPT's pushState) would force a full
  // reload and reset the session.
  const initialSrc = useRef(tab.url === 'about:blank' ? '' : tab.url).current;
  const mounted = useRef(false);

  // Register / unregister with the registry so nav controls work
  useEffect(() => {
    const el = webviewRef.current;
    if (!el) return;
    webviewRegistry.register(tab.id, el);
    return () => webviewRegistry.unregister(tab.id);
  }, [tab.id]);

  // Imperatively navigate only when the store URL changes to something the
  // webview is NOT already on. Internal SPA navigations report their new URL
  // back to the store, but since the webview is already there we skip — no
  // reload. This is what keeps ChatGPT (and similar SPAs) sessions intact.
  useEffect(() => {
    const el = webviewRef.current;
    if (!el) return;
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (!tab.url || tab.url === 'about:blank') return;
    const current = el.getURL?.() ?? '';
    if (current !== tab.url) {
      el.src = tab.url;
    }
  }, [tab.url, tab.id]);

  // Clear the error overlay when a real navigation is in progress.
  useEffect(() => {
    if (tab.url && tab.url !== 'about:blank') {
      setLoadError(null);
    }
  }, [tab.url]);

  // Wire webview events → IPC → main → Zustand
  useEffect(() => {
    const el = webviewRef.current;
    if (!el || !window.browserAPI) return;

    const onLoadStart = () => {
      setLoadError(null);
      window.browserAPI.sendMessage({ type: 'webview-loading', tabId: tab.id, loading: true });
    };

    const onLoadStop = () => {
      try {
        const url = el.getURL();
        void applySponsorBlock(el, url);
        const canGoBack = el.canGoBack();
        const canGoForward = el.canGoForward();
        window.browserAPI.sendMessage({
          type: 'webview-nav-state',
          tabId: tab.id,
          url,
          canGoBack,
          canGoForward,
        });
      } catch {
        window.browserAPI.sendMessage({ type: 'webview-loading', tabId: tab.id, loading: false });
      }
    };

    const onTitleUpdated = (e: Electron.PageTitleUpdatedEvent) => {
      window.browserAPI.sendMessage({
        type: 'webview-title-updated',
        tabId: tab.id,
        title: e.title,
      });
    };

    const onFaviconUpdated = (e: Electron.PageFaviconUpdatedEvent) => {
      if (e.favicons?.[0]) {
        window.browserAPI.sendMessage({
          type: 'webview-favicon-updated',
          tabId: tab.id,
          favicon: e.favicons[0],
        });
      }
    };

    const onDidNavigate = () => {
      try {
        const url = el.getURL();
        void applySponsorBlock(el, url);
        const canGoBack = el.canGoBack();
        const canGoForward = el.canGoForward();
        window.browserAPI.sendMessage({
          type: 'webview-nav-state',
          tabId: tab.id,
          url,
          canGoBack,
          canGoForward,
        });
      } catch { /* ignore */ }
    };

    const onDidFailLoad = (e: Electron.DidFailLoadEvent) => {
      // -3 = ABORTED (user navigated away), ignore it
      if (e.errorCode === -3) return;
      // Only surface main-frame failures. Electron also fires did-fail-load for
      // every failing subresource (a blocked ad, a 404 image, etc.); showing the
      // full-screen error overlay for those would black out the whole page.
      if (!e.isMainFrame) return;
      setLoadError({ code: e.errorCode, desc: e.errorDescription });
      window.browserAPI.sendMessage({ type: 'webview-loading', tabId: tab.id, loading: false });
    };

    el.addEventListener('did-start-loading',   onLoadStart);
    el.addEventListener('did-stop-loading',    onLoadStop);
    el.addEventListener('page-title-updated',  onTitleUpdated  as EventListener);
    el.addEventListener('page-favicon-updated',onFaviconUpdated as EventListener);
    el.addEventListener('did-navigate',        onDidNavigate);
    el.addEventListener('did-navigate-in-page',onDidNavigate);
    el.addEventListener('did-fail-load',       onDidFailLoad   as EventListener);

    return () => {
      el.removeEventListener('did-start-loading',   onLoadStart);
      el.removeEventListener('did-stop-loading',    onLoadStop);
      el.removeEventListener('page-title-updated',  onTitleUpdated  as EventListener);
      el.removeEventListener('page-favicon-updated',onFaviconUpdated as EventListener);
      el.removeEventListener('did-navigate',        onDidNavigate);
      el.removeEventListener('did-navigate-in-page',onDidNavigate);
      el.removeEventListener('did-fail-load',       onDidFailLoad   as EventListener);
    };
  }, [tab.id]);

  return (
    <div className="relative w-full h-full">
      <webview
        ref={webviewRef}
        src={initialSrc}
        className="w-full h-full border-none"
        webpreferences="contextIsolation=yes"
        // Required for target=_blank/window.open events to reach the main
        // process. The main process safely routes http(s) URLs into browser tabs
        // and still denies unmanaged native popup windows.
        allowpopups
      />

      {/* Error overlay — shown when the page fails to load */}
      {loadError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[var(--bg)] text-[var(--text)] gap-4">
          <div className="text-5xl">⚠</div>
          <h2 className="text-xl font-semibold">Page failed to load</h2>
          <p className="text-sm text-[var(--text-muted)] max-w-sm text-center">
            {loadError.desc || 'An unknown error occurred.'}
            {loadError.code === -130 || loadError.code === -101
              ? ' — If proxy is enabled, it may be unreachable. Try rotating or disabling the proxy.'
              : ''}
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => { setLoadError(null); webviewRef.current?.reload(); }}
              className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm hover:opacity-90 transition-opacity"
            >
              Retry
            </button>
            <button
              onClick={() => { setLoadError(null); webviewRef.current?.stop(); }}
              className="px-4 py-2 rounded-lg border border-[var(--border)] text-sm hover:bg-[var(--hover)] transition-colors"
            >
              Dismiss
            </button>
          </div>
          <p className="text-xs text-[var(--text-faint)]">Error {loadError.code}</p>
        </div>
      )}
    </div>
  );
};
