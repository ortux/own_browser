import { useCallback, useEffect } from 'react';
import { useBrowserStore } from '../stores/tabStore';
import { webviewRegistry } from '../stores/webviewRegistry';

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
        if (state) updateState(state as any);
      })
      .catch(console.error);

    return unsubscribe;
  }, [updateState]);

  const navigate = useCallback(
    (url: string) => {
      if (window.browserAPI && store.activeTabId) {
        window.browserAPI.navigate(store.activeTabId, url);
      }
    },
    [store.activeTabId]
  );

  const createTab = useCallback(() => {
    window.browserAPI?.createTab();
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
  };
};
