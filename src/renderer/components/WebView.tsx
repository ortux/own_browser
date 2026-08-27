import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Tab } from '../../shared/types';
import { webviewRegistry } from '../stores/webviewRegistry';
import { useSettingsStore } from '../stores/settingsStore';
import { applySponsorBlock } from '../lib/sponsorBlock';
import { isAllowedNavigationUrl } from '../../shared/navigation';

interface WebViewProps {
  tab: Tab;
}

/** Friendly copy for the load-failure surface (Chromium net error codes). */
const ERROR_INFO: Record<number, { title: string; hint: string }> = {
  [-6]: { title: 'File not found', hint: 'The address may be wrong or the page may have moved.' },
  [-105]: { title: 'Site not found', hint: 'The domain could not be resolved. Check the address, or your DNS/proxy settings.' },
  [-106]: { title: 'You appear to be offline', hint: 'No internet connection was detected. Reconnect and try again.' },
  [-109]: { title: 'Server unreachable', hint: 'The server could not be reached. It may be down or blocked by a proxy.' },
  [-101]: { title: 'Connection reset', hint: 'The connection was interrupted. If a proxy is enabled, try rotating or disabling it.' },
  [-100]: { title: 'Connection refused', hint: 'The server refused the connection.' },
  [-102]: { title: 'Server refused', hint: 'The server denied the request.' },
  [-118]: { title: 'Connection closed', hint: 'The connection was closed unexpectedly. Retry, or check proxy/firewall settings.' },
  [-200]: { title: 'Secure connection failed', hint: 'The site\u2019s certificate could not be validated. Do not enter sensitive data here.' },
  [-201]: { title: 'Certificate mismatch', hint: 'The certificate does not match this site\u2019s address.' },
  [-202]: { title: 'Certificate expired', hint: 'The site\u2019s certificate has expired.' },
  [-130]: { title: 'Proxy unreachable', hint: 'The configured proxy did not respond. Rotate or disable the proxy and retry.' },
  [-501]: { title: 'Insecure connection', hint: 'The site could not upgrade to a secure HTTPS connection.' },
};

function describeError(code: number, desc: string): { title: string; hint: string; proxy: boolean } {
  const info = ERROR_INFO[code];
  const proxy = code === -130 || code === -101 || code === -21;
  if (info) return { title: info.title, hint: info.hint, proxy };
  return {
    title: 'Page failed to load',
    hint: desc || 'An unknown error occurred.',
    proxy,
  };
}

export const WebView: React.FC<WebViewProps> = ({ tab }) => {
  const webviewRef = useRef<Electron.WebviewTag>(null);
  const [loadError, setLoadError] = useState<{ code: number; desc: string } | null>(null);
  const sponsorBlockEnabled = useSettingsStore((s) => s.security.sponsorBlock);
  const siteZoom = useSettingsStore((s) => s.siteZoom);
  // The webview event listeners bind once (useLayoutEffect [tab.id]); keep the
  // latest settings reachable from those closures through refs.
  const sponsorBlockRef = useRef(sponsorBlockEnabled);
  sponsorBlockRef.current = sponsorBlockEnabled;
  const siteZoomRef = useRef(siteZoom);
  siteZoomRef.current = siteZoom;
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

  // Wire webview events → IPC → main → Zustand. Layout effect attaches the
  // listeners before the browser gets a chance to paint/start a fast load.
  useLayoutEffect(() => {
    const el = webviewRef.current;
    if (!el || !window.browserAPI) return;

    const onLoadStart = () => {
      setLoadError(null);
      void window.browserAPI.sendMessage({ type: 'webview-loading', tabId: tab.id, loading: true });
    };

    const registerGuestContents = () => {
      try {
        void window.browserAPI.sendMessage({
          type: 'webview-attached',
          tabId: tab.id,
          webContentsId: el.getWebContentsId(),
        });
      } catch {
        // The guest may not have attached yet; did-attach will retry.
      }
    };

    const reportNavigationState = () => {
      try {
        const url = el.getURL();
        const canGoBack = el.canGoBack();
        const canGoForward = el.canGoForward();

        // Failed Chromium loads can expose chrome-error://chromewebdata/ from
        // getURL(). It is an implementation detail, not a page URL. Keep the
        // requested URL in the tab model and let did-fail-load show the useful
        // error message instead.
        if (!isAllowedNavigationUrl(url)) {
          void window.browserAPI.sendMessage({
            type: 'webview-loading',
            tabId: tab.id,
            loading: false,
          });
          return;
        }

        // SponsorBlock is opt-in: it queries sponsor.ajay.app for the video ID.
        if (sponsorBlockRef.current) void applySponsorBlock(el, url);

        // Re-apply this origin's remembered zoom after every navigation.
        try {
          const origin = new URL(url).origin;
          const remembered = siteZoomRef.current[origin];
          if (remembered !== undefined && Math.abs(el.getZoomFactor() - remembered) > 0.01) {
            el.setZoomFactor(remembered);
          }
        } catch { /* not a parseable URL */ }

        void window.browserAPI.sendMessage({
          type: 'webview-nav-state',
          tabId: tab.id,
          url,
          canGoBack,
          canGoForward,
        });
      } catch {
        void window.browserAPI.sendMessage({
          type: 'webview-loading',
          tabId: tab.id,
          loading: false,
        });
      }
    };

    const onLoadStop = reportNavigationState;

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

    const onFoundInPage = (e: Electron.FoundInPageEvent) => {
      webviewRegistry.emitFind(tab.id, e);
    };

    const onDidNavigate = reportNavigationState;

    const onRenderProcessGone = (event: Electron.RenderProcessGoneEvent) => {
      const reason = event.details?.reason || 'unknown reason';
      setLoadError({
        code: -1000,
        desc: `The embedded page renderer stopped (${reason}). Try reloading the page.`,
      });
      void window.browserAPI.sendMessage({
        type: 'webview-loading',
        tabId: tab.id,
        loading: false,
      });
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

    el.addEventListener('did-attach',          registerGuestContents);
    el.addEventListener('did-start-loading',   onLoadStart);
    el.addEventListener('did-stop-loading',    onLoadStop);
    registerGuestContents();
    el.addEventListener('page-title-updated',  onTitleUpdated  as EventListener);
    el.addEventListener('page-favicon-updated',onFaviconUpdated as EventListener);
    el.addEventListener('found-in-page',        onFoundInPage);
    el.addEventListener('did-navigate',        onDidNavigate);
    el.addEventListener('did-navigate-in-page',onDidNavigate);
    el.addEventListener('did-fail-load',       onDidFailLoad   as EventListener);
    el.addEventListener('render-process-gone', onRenderProcessGone);

    return () => {
      el.removeEventListener('did-attach',          registerGuestContents);
      el.removeEventListener('did-start-loading',   onLoadStart);
      el.removeEventListener('did-stop-loading',    onLoadStop);
      el.removeEventListener('page-title-updated',  onTitleUpdated  as EventListener);
      el.removeEventListener('page-favicon-updated',onFaviconUpdated as EventListener);
      el.removeEventListener('found-in-page',        onFoundInPage);
      el.removeEventListener('did-navigate',        onDidNavigate);
      el.removeEventListener('did-navigate-in-page',onDidNavigate);
      el.removeEventListener('did-fail-load',       onDidFailLoad   as EventListener);
      el.removeEventListener('render-process-gone', onRenderProcessGone);
    };
  }, [tab.id]);

  return (
    <div className="relative w-full h-full">
      <webview
        ref={webviewRef}
        src={initialSrc}
        partition={tab.privateMode ? `temp:tab-${tab.id}` : undefined}
        className="w-full h-full border-none"
        webpreferences="contextIsolation=yes,sandbox=yes"
        // Required for target=_blank/window.open events to reach the main
        // process. The main process safely routes http(s) URLs into browser tabs
        // and still denies unmanaged native popup windows.
        allowpopups
      />

      {/* Error overlay — shown when the page fails to load */}
      {loadError && (() => {
        const info = describeError(loadError.code, loadError.desc);
        return (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[var(--bg)] text-[var(--text)] gap-4">
            <div className="text-5xl" aria-hidden>{info.title.includes('offline') ? '📡' : '⚠'}</div>
            <h2 className="text-xl font-semibold">{info.title}</h2>
            <p className="text-sm text-[var(--text-muted)] max-w-sm text-center">{info.hint}</p>
            {info.proxy && (
              <p className="text-xs text-[var(--text-faint)] max-w-xs text-center">
                A configured proxy can cause this. Rotate or disable it from Settings → Proxy.
              </p>
            )}
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
        );
      })()}
    </div>
  );
};
