import React, { useEffect, useRef } from 'react';
import type { Tab } from '../../shared/types';
import { webviewRegistry } from '../stores/webviewRegistry';

interface WebViewProps {
  tab: Tab;
}

export const WebView: React.FC<WebViewProps> = ({ tab }) => {
  const webviewRef = useRef<Electron.WebviewTag>(null);

  // Register / unregister with the registry so ControlBar commands reach us
  useEffect(() => {
    const el = webviewRef.current;
    if (!el) return;
    webviewRegistry.register(tab.id, el);
    return () => webviewRegistry.unregister(tab.id);
  }, [tab.id]);

  // When the tab URL changes from outside (e.g. address bar / new tab navigation),
  // drive the webview to the new URL.
  useEffect(() => {
    const el = webviewRef.current;
    if (!el || !tab.url || tab.url === 'about:blank') return;

    // Only push if the webview is already showing a different URL
    try {
      if (el.src !== tab.url) {
        el.src = tab.url;
      }
    } catch {
      // webview may not be ready yet; the src attribute on the element handles init
    }
  }, [tab.url]);

  // Wire webview events → IPC → main process → state update
  useEffect(() => {
    const el = webviewRef.current;
    if (!el || !window.browserAPI) return;

    const onLoadStart = () => {
      window.browserAPI.sendMessage({ type: 'webview-loading', tabId: tab.id, loading: true });
    };

    const onLoadStop = () => {
      try {
        const url = el.getURL();
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

    el.addEventListener('did-start-loading', onLoadStart);
    el.addEventListener('did-stop-loading', onLoadStop);
    el.addEventListener('page-title-updated', onTitleUpdated as EventListener);
    el.addEventListener('page-favicon-updated', onFaviconUpdated as EventListener);
    el.addEventListener('did-navigate', onDidNavigate);
    el.addEventListener('did-navigate-in-page', onDidNavigate);

    return () => {
      el.removeEventListener('did-start-loading', onLoadStart);
      el.removeEventListener('did-stop-loading', onLoadStop);
      el.removeEventListener('page-title-updated', onTitleUpdated as EventListener);
      el.removeEventListener('page-favicon-updated', onFaviconUpdated as EventListener);
      el.removeEventListener('did-navigate', onDidNavigate);
      el.removeEventListener('did-navigate-in-page', onDidNavigate);
    };
  }, [tab.id]);

  return (
    <webview
      ref={webviewRef}
      src={tab.url}
      className="w-full h-full border-none"
      // Allow the page to run its own scripts; we're sandboxing at the
      // renderer-shell level, not inside the webview itself.
      webpreferences="contextIsolation=yes"
    />
  );
};
