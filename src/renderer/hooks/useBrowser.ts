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

  const stop = useCallback(() => {
    const wv = webviewRegistry.get(store.activeTabId);
    if (wv) wv.stop();
  }, [store.activeTabId]);

  const zoom = useCallback((delta: number) => {
    const wv = webviewRegistry.get(store.activeTabId);
    if (!wv) return;
    wv.setZoomFactor(Math.min(3, Math.max(0.5, wv.getZoomFactor() + delta)));
  }, [store.activeTabId]);

  const resetZoom = useCallback(() => {
    const wv = webviewRegistry.get(store.activeTabId);
    if (wv) wv.setZoomFactor(1);
  }, [store.activeTabId]);

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
    stop,
    duplicateTab,
    restoreClosedTab,
    zoom,
    resetZoom,
    printPage,
  };
};
