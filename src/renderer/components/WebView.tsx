import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Tab } from '../../shared/types';
import { webviewRegistry } from '../stores/webviewRegistry';
import { applySponsorBlock } from '../lib/sponsorBlock';
import { isAllowedNavigationUrl } from '../../shared/navigation';
import { useSettingsStore } from '../stores/settingsStore';
import { caretBrowsingScript } from '../lib/caretBrowsing';

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
  // Tracks whether the guest webContents has actually attached. Webview methods
  // such as getURL()/getWebContentsId() throw "must be attached …" until then.
  const attachedRef = useRef(false);
  // The last URL SponsorBlock was applied for. reportNavigationState fires on
  // several events per page load, and without this each one re-hit the API and
  // re-injected the skipper script.
  const sponsorBlockUrlRef = useRef<string | null>(null);
  // Resolved by the preload bridge before first render, so capture works on the
  // very first page load. Never attached to private tabs.
  const capturePreloadPath = useRef(
    window.browserAPI?.passwords.capturePreloadPath() || undefined
  ).current;
  // Capturing is only ever attempted when the user enabled the manager and the
  // tab is not private. Read once per mount: changing `preload` on a live
  // <webview> has no effect until it reloads anyway.
  const captureEnabled = useRef(useSettingsStore.getState().passwordManagerEnabled).current;
  const capturePreload = !tab.privateMode && captureEnabled ? capturePreloadPath : undefined;

  // Register / unregister with the registry so nav controls work
  useEffect(() => {
    const el = webviewRef.current;
    if (!el) return;
    webviewRegistry.register(tab.id, el);
    return () => webviewRegistry.unregister(tab.id);
  }, [tab.id]);

  // Caret browsing can be toggled while a page is already open, so subscribe
  // to it rather than only injecting on navigation.
  const caretBrowsing = useSettingsStore((state) => state.general.caretBrowsing);
  useEffect(() => {
    const el = webviewRef.current;
    if (!el || !attachedRef.current) return;
    void el.executeJavaScript(caretBrowsingScript(caretBrowsing)).catch(() => {});
  }, [caretBrowsing]);

  // Imperatively navigate only when the store URL changes to something the
  // webview is NOT already on. Internal SPA navigations report their new URL
  // back to the store, but since the webview is already there we skip — no
  // reload. This is what keeps ChatGPT (and similar SPAs) sessions intact.
  useEffect(() => {
    const el = webviewRef.current;
    if (!el) return;
    if (!tab.url || tab.url === 'about:blank') return;
    if (!attachedRef.current) {
      el.src = tab.url;
      return;
    }
    let current = '';
    try {
      current = el.getURL?.() ?? '';
    } catch {
      el.src = tab.url;
      return;
    }
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

    // Password credentials captured by the webview's passwordCapture preload
    // are forwarded here via ipc-message, then sent to main for the save prompt.
    const onIpcMessage = (e: Electron.IpcMessageEvent) => {
      if (e.channel !== '__zyphora_pm_submit__') return;
      if (tab.privateMode) return; // never save passwords in private tabs
      const [origin, username, password, title, favicon] = e.args as string[];
      if (!username || !password) return;
      void window.browserAPI.sendMessage({
        type: 'webview-credentials',
        tabId: tab.id,
        origin: origin || '',
        username,
        password,
        title: title || '',
        favicon: favicon || undefined,
      });
    };

    const onLoadStart = () => {
      setLoadError(null);
      void window.browserAPI.sendMessage({ type: 'webview-loading', tabId: tab.id, loading: true });
    };

    // `did-attach` can fire before React has installed this effect (especially
    // when restoring an already-cached page).  In that case the old
    // event-only registration left main with no way to find a perfectly live
    // guest, and the agent eventually reported that it could not see the
    // page.  Registration is idempotent, so probe immediately and retry until
    // the guest is attached rather than relying on a single lifecycle event.
    let attachRetry: number | undefined;
    let attachAttempts = 0;
    const registerGuestContents = () => {
      try {
        const webContentsId = el.getWebContentsId();
        attachedRef.current = true;
        void window.browserAPI.sendMessage({
          type: 'webview-attached',
          tabId: tab.id,
          webContentsId,
        });
      } catch {
        // The guest may not have attached yet. A retry also covers a
        // `did-attach` event that occurred before this effect was installed.
        if (attachAttempts++ < 100) {
          attachRetry = window.setTimeout(registerGuestContents, 100);
        }
      }
    };

    const onDidDetach = () => {
      attachedRef.current = false;
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

        if (sponsorBlockUrlRef.current !== url) {
          sponsorBlockUrlRef.current = url;
          void applySponsorBlock(el, url);
        }
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

    // Re-apply the site's saved zoom on every navigation. Chromium resets the
    // zoom factor per navigation, so this has to run each time rather than
    // once at attach.
    const applySavedZoom = () => {
      let url = '';
      try {
        url = el.getURL();
      } catch {
        return;
      }
      if (!url || url === 'about:blank') return;
      void window.browserAPI.zoom
        .get(url)
        .then(({ factor: saved }) => {
          // A site with no saved level uses the "Default page zoom" from
          // Accessibility settings rather than a hard-coded 100%.
          const defaultZoom = useSettingsStore.getState().general.defaultZoom;
          const factor = saved === 1 ? defaultZoom : saved;
          // The tab may have navigated again while this was in flight.
          try {
            if (el.getURL() === url && el.getZoomFactor() !== factor) {
              el.setZoomFactor(factor);
            }
          } catch {
            /* guest went away */
          }
        })
        .catch(() => {});
    };

    // Caret browsing has to be re-injected on every page: it lives in the
    // guest document, which a navigation replaces.
    const applyCaretBrowsing = () => {
      const enabled = useSettingsStore.getState().general.caretBrowsing;
      void el.executeJavaScript(caretBrowsingScript(enabled)).catch(() => {});
    };

    const onDidNavigate = () => {
      reportNavigationState();
      applySavedZoom();
      applyCaretBrowsing();
    };

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

    el.addEventListener('did-attach', registerGuestContents);
    el.addEventListener('did-detach', onDidDetach);
    el.addEventListener('did-start-loading', onLoadStart);
    el.addEventListener('did-stop-loading', reportNavigationState);
    el.addEventListener('dom-ready', applySavedZoom);
    el.addEventListener('dom-ready', applyCaretBrowsing);
    el.addEventListener('page-title-updated', onTitleUpdated as EventListener);
    el.addEventListener('page-favicon-updated', onFaviconUpdated as EventListener);
    el.addEventListener('found-in-page', onFoundInPage);
    el.addEventListener('did-navigate', onDidNavigate);
    el.addEventListener('did-navigate-in-page', onDidNavigate);
    el.addEventListener('did-fail-load', onDidFailLoad as EventListener);
    el.addEventListener('render-process-gone', onRenderProcessGone);
    el.addEventListener('ipc-message', onIpcMessage as EventListener);
    // Do not depend exclusively on `did-attach`: this is intentionally after
    // listener setup so both an already-attached and a soon-to-attach guest
    // are registered with the main process.
    registerGuestContents();

    return () => {
      if (attachRetry !== undefined) window.clearTimeout(attachRetry);
      el.removeEventListener('did-attach', registerGuestContents);
      el.removeEventListener('did-detach', onDidDetach);
      el.removeEventListener('did-start-loading', onLoadStart);
      el.removeEventListener('did-stop-loading', reportNavigationState);
      el.removeEventListener('dom-ready', applySavedZoom);
      el.removeEventListener('dom-ready', applyCaretBrowsing);
      el.removeEventListener('page-title-updated', onTitleUpdated as EventListener);
      el.removeEventListener('page-favicon-updated', onFaviconUpdated as EventListener);
      el.removeEventListener('found-in-page', onFoundInPage);
      el.removeEventListener('did-navigate', onDidNavigate);
      el.removeEventListener('did-navigate-in-page', onDidNavigate);
      el.removeEventListener('did-fail-load', onDidFailLoad as EventListener);
      el.removeEventListener('render-process-gone', onRenderProcessGone);
      el.removeEventListener('ipc-message', onIpcMessage as EventListener);
    };
  }, [tab.id, tab.privateMode]);

  return (
    <div className="relative w-full h-full">
      <webview
        ref={webviewRef}
        src={initialSrc}
        partition={tab.privateMode ? `temp:tab-${tab.id}` : undefined}
        className="w-full h-full border-none"
        webpreferences="contextIsolation=yes,sandbox=no"
        preload={capturePreload}
        allowpopups
      />

      {/* Error overlay — shown when the page fails to load */}
      {loadError && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[var(--bg)] text-[var(--text)] gap-4">
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
              onClick={() => {
                setLoadError(null);
                webviewRef.current?.reload();
              }}
              className="px-4 py-2 rounded-md bg-[var(--accent)] text-[var(--accent-text)] text-sm hover:bg-[var(--accent-hover)] transition-colors"
            >
              Retry
            </button>
            <button
              onClick={() => {
                setLoadError(null);
                webviewRef.current?.stop();
              }}
              className="px-4 py-2 rounded-md border border-[var(--border)] text-sm hover:bg-[var(--hover)] transition-colors"
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
