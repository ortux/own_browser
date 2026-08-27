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
    const handler = (_event: Electron.IpcRendererEvent, state: BrowserState) => callback(state);
    ipcRenderer.on('state-updated', handler);

    // Return unsubscribe function
    return () => {
      ipcRenderer.removeListener('state-updated', handler);
    };
  },

  onOpenFind: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('open-find', handler);
    return () => {
      ipcRenderer.removeListener('open-find', handler);
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
  createTab: (privateMode = false) => {
    return browserAPI.sendMessage({ type: 'create-tab', privateMode });
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
  toggleFullscreen: () => ipcRenderer.send('window:fullscreen'),

  /** Focus the address bar (raised by Ctrl+L while a webview has focus). */
  onFocusAddress: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('focus-address', handler);
    return () => {
      ipcRenderer.removeListener('focus-address', handler);
    };
  },

  /** Open the command palette (raised by Ctrl+K while a webview has focus). */
  onOpenPalette: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('open-palette', handler);
    return () => {
      ipcRenderer.removeListener('open-palette', handler);
    };
  },

  /** "Search <selection>" from the page context menu. */
  onContextSearch: (callback: (selection: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, selection: string) => callback(selection);
    ipcRenderer.on('context-search', handler);
    return () => {
      ipcRenderer.removeListener('context-search', handler);
    };
  },

  // ── Tab pinning / muting / cycling ─────────────────────────────────────────
  tabs: {
    setPinned: (tabId: string, pinned: boolean): Promise<unknown> =>
      browserAPI.sendMessage({ type: 'set-tab-pinned', tabId, pinned }),
    setMuted: (tabId: string, muted: boolean): Promise<unknown> =>
      browserAPI.sendMessage({ type: 'set-tab-muted', tabId, muted }),
    cycle: (forward = true): Promise<unknown> =>
      browserAPI.sendMessage({ type: 'cycle-tab', forward }),
  },

  // ── Session restore ────────────────────────────────────────────────────────
  session: {
    setRestore: (enabled: boolean): Promise<unknown> =>
      browserAPI.sendMessage({ type: 'set-session-restore', enabled }),
  },

  /**
   * Fetch a random background image from the Pexels API.
   */
  pexelsImage: (category?: string): Promise<import('../shared/types').PexelsImage | null> =>
    ipcRenderer.invoke('pexels:image', category),

  // ── SQLite persistence ────────────────────────────────────────────────────

  /** History */
  history: {
    get:    (limit?: number):      Promise<import('../shared/types').HistoryEntry[]> =>
      ipcRenderer.invoke('db:history:get', limit),
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
    /** Export bookmarks to a Netscape-format HTML file. */
    export: (): Promise<{ success: boolean; canceled: boolean; count: number }> =>
      ipcRenderer.invoke('db:bookmarks:export'),
    /** Import bookmarks from any browser's HTML export. */
    import: (): Promise<{ success: boolean; canceled: boolean; imported: number; skipped: number }> =>
      ipcRenderer.invoke('db:bookmarks:import'),
  },

  /** Proxy */
  proxy: {
    fetch:  (): Promise<import('../shared/types').ProxyInfo> =>
      ipcRenderer.invoke('proxy:fetch'),
    apply:  (proxy: import('../shared/types').ProxyInfo): Promise<void> =>
      ipcRenderer.invoke('proxy:apply', proxy),
    clear:  (): Promise<void> =>
      ipcRenderer.invoke('proxy:clear'),
    verify: (proxy: import('../shared/types').ProxyInfo): Promise<import('../shared/types').ProxyVerifyResult> =>
      ipcRenderer.invoke('proxy:verify', proxy),
  },

  /** Network privacy policy */
  security: {
    set: (settings: {
      forceHttps: boolean;
      doNotTrack: boolean;
      globalPrivacyControl?: boolean;
      stripTrackingParams?: boolean;
      webrtcPolicy?: 'default' | 'public-only' | 'disable';
      blockThirdPartyCookies?: boolean;
    }): Promise<unknown> =>
      ipcRenderer.invoke('browser:message', { type: 'security-settings', ...settings }),
  },

  /** Ad blocker */
  adblock: {
    set:   (enabled: boolean): Promise<boolean> =>
      ipcRenderer.invoke('adblock:set', enabled),
    get:   (): Promise<boolean> =>
      ipcRenderer.invoke('adblock:get'),
    stats: (): Promise<{ enabled: boolean; blocked: number }> =>
      ipcRenderer.invoke('adblock:stats'),
    setAllowlist: (sites: string[]): Promise<void> =>
      ipcRenderer.invoke('adblock:set-allowlist', sites),
    siteStatus: (site: string): Promise<{ allowed: boolean; blocked: number }> =>
      ipcRenderer.invoke('adblock:site-status', site),
    siteDetails: (site: string): Promise<import('../shared/types').BlockedRequest[]> =>
      ipcRenderer.invoke('adblock:site-details', site),
  },

  /** Subscribe to live ad-blocker stats (blocked count + enabled state). */
  onAdblockStats: (callback: (stats: { enabled: boolean; blocked: number }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, stats: { enabled: boolean; blocked: number }) => callback(stats);
    ipcRenderer.on('adblock:stats', handler);
    return () => {
      ipcRenderer.removeListener('adblock:stats', handler);
    };
  },

  // ── Downloads ──────────────────────────────────────────────────────────────

  downloads: {
    list: ():       Promise<import('../shared/types').Download[]> =>
      ipcRenderer.invoke('download:list'),
    setPath: (p: string): Promise<void> =>
      ipcRenderer.invoke('download:set-path', p),
    defaultPath: (): Promise<string> =>
      ipcRenderer.invoke('download:default-path'),
    pickFolder: (): Promise<string | null> =>
      ipcRenderer.invoke('download:pick-folder'),
    cancel: (id: string): Promise<void> =>
      ipcRenderer.invoke('download:cancel', id),
    pause: (id: string): Promise<void> =>
      ipcRenderer.invoke('download:pause', id),
    resume: (id: string): Promise<void> =>
      ipcRenderer.invoke('download:resume', id),
    setRetention: (days: number): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('download:set-retention', days),
    clearHistory: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('download:clear-history'),
    retry: (id: string): Promise<void> =>
      ipcRenderer.invoke('download:retry', id),
    remove: (id: string): Promise<void> =>
      ipcRenderer.invoke('download:remove', id),
    clear: ():  Promise<void> =>
      ipcRenderer.invoke('download:clear'),
    open: (id: string): Promise<void> =>
      ipcRenderer.invoke('download:open', id),
    show: (id: string): Promise<void> =>
      ipcRenderer.invoke('download:show', id),
    revealFolder: (): Promise<void> =>
      ipcRenderer.invoke('download:reveal-folder'),
    /** Live updates: receives the full download list on every change. */
    onUpdated: (callback: (list: import('../shared/types').Download[]) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, list: import('../shared/types').Download[]) => callback(list);
      ipcRenderer.on('download:updated', handler);
      return () => {
        ipcRenderer.removeListener('download:updated', handler);
      };
    },
    /** Fired once when a new download begins. */
    onStarted: (callback: (d: import('../shared/types').Download) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, d: import('../shared/types').Download) => callback(d);
      ipcRenderer.on('download:started', handler);
      return () => {
        ipcRenderer.removeListener('download:started', handler);
      };
    },
  },

  /** Clear local history and current-session site storage. */
  privacy: {
    clearData: (): Promise<void> => ipcRenderer.invoke('privacy:clear-data'),
    /** Selective clear with targets + optional time range. */
    clearDataSelective: (options: {
      since: number;
      targets: {
        history?: boolean;
        cookies?: boolean;
        cache?: boolean;
        permissions?: boolean;
        downloads?: boolean;
        blockedStats?: boolean;
      };
    }): Promise<{ success: boolean; cleared: string[] }> =>
      ipcRenderer.invoke('privacy:clear-data-selective', options),
  },

  /** Local diagnostics (versions, adblock, DNS, proxy, DB) — no network. */
  diagnostics: {
    get: (): Promise<import('../shared/types').DiagnosticsInfo> =>
      ipcRenderer.invoke('diag:get'),
  },

  /** Per-site data (Site settings): permission decisions + cookie counts. */
  sites: {
    permissions: (): Promise<{ host: string; permission: string; allowed: boolean }[]> =>
      ipcRenderer.invoke('sites:permissions'),
    clearPermissions: (host: string): Promise<{ removed: number }> =>
      ipcRenderer.invoke('sites:clear-permissions', host),
    cookies: (): Promise<{ host: string; count: number }[]> =>
      ipcRenderer.invoke('sites:cookies'),
    clearCookies: (host: string): Promise<{ removed: number }> =>
      ipcRenderer.invoke('sites:clear-cookies', host),
  },

  /** App updates (electron-updater / GitHub Releases). */
  updates: {
    check: (): Promise<import('../main/update').UpdateStatus> =>
      ipcRenderer.invoke('update:check'),
    status: (): Promise<import('../main/update').UpdateStatus> =>
      ipcRenderer.invoke('update:status'),
    quitAndInstall: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('update:quit-install'),
    onStatus: (callback: (status: import('../main/update').UpdateStatus) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, status: import('../main/update').UpdateStatus) => callback(status);
      ipcRenderer.on('update:status', handler);
      return () => {
        ipcRenderer.removeListener('update:status', handler);
      };
    },
  },

  /** Certificate information for a given hostname. */
  cert: {
    get: (hostname: string): Promise<import('../main/certificate').CertInfo | null> =>
      ipcRenderer.invoke('cert:get', hostname),
  },
};

// SECURITY: Expose only the API object, not ipcRenderer or any other Electron/Node APIs
contextBridge.exposeInMainWorld('browserAPI', browserAPI);

export type BrowserAPI = typeof browserAPI;
