import { contextBridge, ipcRenderer } from 'electron';
import type { RendererToMainMessage, BrowserState } from '../shared/types';

/**
 * SECURITY: Preload script - the only bridge between untrusted renderer and main process
 * 
 * This exposes a minimal, validated API to the renderer process.
 * NO raw Node.js modules, NO filesystem access, NO shell access.
 * All communication is validated and type-safe.
 */

const browserAPI = {
  /**
   * Send a message to the main process and optionally wait for a response
   */
  sendMessage: async (message: RendererToMainMessage) => {
    return ipcRenderer.invoke('browser:message', message);
  },

  /**
   * Listen for state updates from the main process
   */
  onStateUpdated: (callback: (state: BrowserState) => void) => {
    const handler = (_event: any, state: BrowserState) => callback(state);
    ipcRenderer.on('state-updated', handler);

    // Return unsubscribe function
    return () => {
      ipcRenderer.removeListener('state-updated', handler);
    };
  },

  /**
   * Navigate to a URL
   */
  navigate: (tabId: string, url: string) => {
    return browserAPI.sendMessage({
      type: 'navigate',
      tabId,
      url,
    });
  },

  /**
   * Create a new tab
   */
  createTab: () => {
    return browserAPI.sendMessage({ type: 'create-tab' });
  },

  /**
   * Close a tab
   */
  closeTab: (tabId: string) => {
    return browserAPI.sendMessage({ type: 'close-tab', tabId });
  },

  /**
   * Activate (switch to) a tab
   */
  activateTab: (tabId: string) => {
    return browserAPI.sendMessage({ type: 'activate-tab', tabId });
  },

  /**
   * Duplicate a tab
   */
  duplicateTab: (tabId: string) => {
    return browserAPI.sendMessage({ type: 'duplicate-tab', tabId });
  },

  /**
   * Go back in history
   */
  goBack: (tabId: string) => {
    return browserAPI.sendMessage({ type: 'go-back', tabId });
  },

  /**
   * Go forward in history
   */
  goForward: (tabId: string) => {
    return browserAPI.sendMessage({ type: 'go-forward', tabId });
  },

  /**
   * Reload the page
   */
  reload: (tabId: string) => {
    return browserAPI.sendMessage({ type: 'reload', tabId });
  },

  /**
   * Stop loading
   */
  stop: (tabId: string) => {
    return browserAPI.sendMessage({ type: 'stop', tabId });
  },

  /**
   * Get current browser state
   */
  getState: () => {
    return browserAPI.sendMessage({ type: 'get-state' });
  },

  /**
   * Window controls (custom title bar)
   */
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow:    () => ipcRenderer.send('window:close'),

  /**
   * Fetch a random background image from the Pexels API.
   */
  pexelsImage: (category?: string): Promise<import('../shared/types').PexelsImage | null> =>
    ipcRenderer.invoke('pexels:image', category),

  // ── SQLite persistence ────────────────────────────────────────────────────

  /** History */
  history: {
    get:    ():                    Promise<import('../shared/types').HistoryEntry[]> =>
      ipcRenderer.invoke('db:history:get'),
    search: (query: string):       Promise<import('../shared/types').HistoryEntry[]> =>
      ipcRenderer.invoke('db:history:search', query),
    delete: (id: number):          Promise<void> =>
      ipcRenderer.invoke('db:history:delete', id),
    clear:  ():                    Promise<void> =>
      ipcRenderer.invoke('db:history:clear'),
  },

  /** Bookmarks */
  bookmarks: {
    get:    ():                                          Promise<import('../shared/types').Bookmark[]> =>
      ipcRenderer.invoke('db:bookmarks:get'),
    search: (query: string):                             Promise<import('../shared/types').Bookmark[]> =>
      ipcRenderer.invoke('db:bookmarks:search', query),
    add:    (url: string, title: string, favicon?: string): Promise<import('../shared/types').Bookmark> =>
      ipcRenderer.invoke('db:bookmarks:add', url, title, favicon),
    remove: (url: string):                               Promise<void> =>
      ipcRenderer.invoke('db:bookmarks:remove', url),
    is:     (url: string):                               Promise<boolean> =>
      ipcRenderer.invoke('db:bookmarks:is', url),
  },

  /** Proxy */
  proxy: {
    fetch:  (): Promise<import('../renderer/stores/settingsStore').ProxyInfo> =>
      ipcRenderer.invoke('proxy:fetch'),
    apply:  (proxy: import('../renderer/stores/settingsStore').ProxyInfo): Promise<void> =>
      ipcRenderer.invoke('proxy:apply', proxy),
    clear:  (): Promise<void> =>
      ipcRenderer.invoke('proxy:clear'),
    verify: (proxy: import('../renderer/stores/settingsStore').ProxyInfo): Promise<boolean> =>
      ipcRenderer.invoke('proxy:verify', proxy),
  },
};

// SECURITY: Expose only the API object, not ipcRenderer or any other Electron/Node APIs
contextBridge.exposeInMainWorld('browserAPI', browserAPI);

export type BrowserAPI = typeof browserAPI;
