import { useCallback, useEffect } from 'react';
import { useBrowserStore } from '../stores/tabStore';
import { webviewRegistry } from '../stores/webviewRegistry';
import type { BrowserState } from '../../shared/types';

export const useBrowser = () => {
  const updateState = useBrowserStore((state) => state.updateState);
  const store = useBrowserStore();

  // Subscribe to state updates from main process
  useEffect(() => {
    if (!window.browserAPI) {
      console.error('[useBrowser] browserAPI not available');
      return;
    }

    const unsubscribe = window.browserAPI.onStateUpdated((newState) => {
      updateState(newState);
    });

    // Hydrate initial state
    window.browserAPI
      .getState()
      .then((state) => {
        if (state && typeof state === 'object') updateState(state as BrowserState);
      })
      .catch(console.error);

    return unsubscribe;
  }, [updateState]);

  const navigate = useCallback(
    (url: string) => {
      if (window.browserAPI && store.activeTabId) {
        void window.browserAPI.navigate(store.activeTabId, url).catch((error: unknown) => {
          console.error('[navigation] failed to send navigation request:', error);
        });
      }
    },
    [store.activeTabId]
  );

  const createTab = useCallback((privateMode = false) => {
    window.browserAPI?.sendMessage({ type: 'create-tab', privateMode });
  }, []);

  const createTabWithUrl = useCallback((url: string) => {
    window.browserAPI?.sendMessage({ type: 'create-tab-url', url });
  }, []);

  const closeTab = useCallback((tabId: string) => {
    window.browserAPI?.closeTab(tabId);
  }, []);

  const activateTab = useCallback((tabId: string) => {
    window.browserAPI?.activateTab(tabId);
  }, []);

  const setTabMuted = useCallback((tabId: string, muted: boolean) => {
    window.browserAPI?.setTabMuted(tabId, muted);
  }, []);

  /** Flip a tab's mute state; reads the tab from the store to find the current one. */
  const toggleTabMuted = useCallback((tabId: string) => {
    const tab = useBrowserStore.getState().tabs.find((t) => t.id === tabId);
    if (!tab) return;
    window.browserAPI?.setTabMuted(tabId, !tab.muted);
  }, []);

  /** Flip a tab's pinned state, reading the current value from the store. */
  const toggleTabPinned = useCallback((tabId: string) => {
    const tab = useBrowserStore.getState().tabs.find((t) => t.id === tabId);
    if (!tab) return;
    window.browserAPI?.setTabPinned(tabId, !tab.pinned);
  }, []);

  /**
   * Reordering goes through main because the tab Map's insertion order is the
   * real strip order and is what session restore persists; a renderer-only
   * swap is overwritten by the next state broadcast.
   */
  const reorderTabs = useCallback((draggedTabId: string, targetTabId: string) => {
    window.browserAPI?.reorderTabs(draggedTabId, targetTabId);
  }, []);

  const duplicateTab = useCallback(() => {
    if (store.activeTabId) {
      window.browserAPI?.duplicateTab(store.activeTabId);
    }
  }, [store.activeTabId]);

  const restoreClosedTab = useCallback((index = 0) => {
    return window.browserAPI?.sendMessage({ type: 'restore-closed-tab', index });
  }, []);

  // These drive the webview directly — no round-trip to main needed
  const goBack = useCallback(() => {
    const wv = webviewRegistry.get(store.activeTabId);
    if (wv?.canGoBack()) wv.goBack();
  }, [store.activeTabId]);

  const goForward = useCallback(() => {
    const wv = webviewRegistry.get(store.activeTabId);
    if (wv?.canGoForward()) wv.goForward();
  }, [store.activeTabId]);

  const reload = useCallback(() => {
    const wv = webviewRegistry.get(store.activeTabId);
    if (wv) wv.reload();
  }, [store.activeTabId]);

  /** Ctrl+Shift+R — reload bypassing the HTTP cache, as in every other browser. */
  const hardReload = useCallback(() => {
    const wv = webviewRegistry.get(store.activeTabId);
    if (wv) wv.reloadIgnoringCache();
  }, [store.activeTabId]);

  const stop = useCallback(() => {
    const wv = webviewRegistry.get(store.activeTabId);
    if (wv) wv.stop();
  }, [store.activeTabId]);

  // Zoom is stored per origin in the main process, so it survives both the
  // next navigation and a restart. The webview is updated immediately and the
  // level is written back for the site currently loaded in it.
  const applyZoom = useCallback(
    (compute: (current: number) => number) => {
      const tabId = store.activeTabId;
      const wv = webviewRegistry.get(tabId);
      if (!wv) return;

      const next = Math.min(3, Math.max(0.5, compute(wv.getZoomFactor())));
      wv.setZoomFactor(next);

      let url = '';
      try {
        url = wv.getURL();
      } catch {
        // Guest not attached yet; nothing worth remembering.
        return;
      }
      if (!url || url === 'about:blank') return;
      void window.browserAPI.zoom.set(url, next).catch(() => {});
    },
    [store.activeTabId]
  );

  const zoom = useCallback((delta: number) => applyZoom((current) => current + delta), [applyZoom]);

  const resetZoom = useCallback(() => applyZoom(() => 1), [applyZoom]);

  const printPage = useCallback(() => {
    const wv = webviewRegistry.get(store.activeTabId);
    if (wv) void wv.print();
  }, [store.activeTabId]);

  return {
    navigate,
    createTab,
    createTabWithUrl,
    closeTab,
    activateTab,
    goBack,
    goForward,
    reload,
    hardReload,
    stop,
    duplicateTab,
    setTabMuted,
    toggleTabMuted,
    toggleTabPinned,
    reorderTabs,
    restoreClosedTab,
    zoom,
    resetZoom,
    printPage,
  };
};
