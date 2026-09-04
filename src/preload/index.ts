import { contextBridge, ipcRenderer } from 'electron';
import type { RendererToMainMessage, BrowserState } from '../shared/types';

/**
 * SECURITY: Preload script - the only bridge between untrusted renderer and main process
 *
 * This exposes a minimal, validated API to the renderer process.
 * NO raw Node.js modules, NO filesystem access, NO shell access.
 * All communication is validated and type-safe.
 */

/**
 * Resolved once, synchronously, before the renderer runs. Injecting this later
 * (e.g. from a dom-ready hook) races the first <webview> mount and silently
 * disables password capture on the first page load.
 */
const capturePreloadPath: string = ipcRenderer.sendSync('passwords:capture-preload-path') ?? '';

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

  /** Show a custom permission prompt (camera, mic, location, …) in the UI. */
  onPermissionRequest: (
    callback: (request: import('../shared/types').PermissionRequest) => void
  ) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      request: import('../shared/types').PermissionRequest
    ) => {
      callback(request);
    };
    ipcRenderer.on('permission-request', handler);
    return () => {
      ipcRenderer.removeListener('permission-request', handler);
    };
  },

  /** Send the user's Allow/Block decision for a permission prompt back to main. */
  respondPermission: (requestId: string, allow: boolean): Promise<unknown> =>
    ipcRenderer.invoke('browser:message', { type: 'permission-response', requestId, allow }),

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
   * Mute or unmute a tab's audio.
   */
  setTabMuted: (tabId: string, muted: boolean) => {
    return browserAPI.sendMessage({ type: 'set-tab-muted', tabId, muted });
  },

  /**
   * Pin or unpin a tab.
   */
  setTabPinned: (tabId: string, pinned: boolean) => {
    return browserAPI.sendMessage({ type: 'set-tab-pinned', tabId, pinned });
  },

  /**
   * Move a tab to another tab's position.
   */
  reorderTabs: (draggedTabId: string, targetTabId: string) => {
    return browserAPI.sendMessage({ type: 'reorder-tabs', draggedTabId, targetTabId });
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

  /** Notifies when the window is maximized or restored. */
  onMaximizedChanged: (callback: (maximized: boolean) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, maximized: boolean) => callback(maximized);
    ipcRenderer.on('window:maximized-changed', handler);
    return () => {
      ipcRenderer.removeListener('window:maximized-changed', handler);
    };
  },
  closeWindow: () => ipcRenderer.send('window:close'),

  /**
   * Fetch a random background image from the Pexels API.
   */
  pexelsImage: (category?: string): Promise<import('../shared/types').PexelsImage | null> =>
    ipcRenderer.invoke('pexels:image', category),

  // ── SQLite persistence ────────────────────────────────────────────────────

  /** History */
  history: {
    get: (limit?: number): Promise<import('../shared/types').HistoryEntry[]> =>
      ipcRenderer.invoke('db:history:get', limit),
    search: (query: string): Promise<import('../shared/types').HistoryEntry[]> =>
      ipcRenderer.invoke('db:history:search', query),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('db:history:delete', id),
    clear: (): Promise<void> => ipcRenderer.invoke('db:history:clear'),
    /** Retention in days; 0 keeps everything. Prunes immediately. */
    setRetention: (days: number): Promise<{ removed: number }> =>
      ipcRenderer.invoke('browser:message', { type: 'history-retention', days }),
  },

  /** Bookmarks */
  bookmarks: {
    get: (): Promise<import('../shared/types').Bookmark[]> =>
      ipcRenderer.invoke('db:bookmarks:get'),
    search: (query: string): Promise<import('../shared/types').Bookmark[]> =>
      ipcRenderer.invoke('db:bookmarks:search', query),
    add: (
      url: string,
      title: string,
      favicon?: string
    ): Promise<import('../shared/types').Bookmark> =>
      ipcRenderer.invoke('db:bookmarks:add', url, title, favicon),
    remove: (url: string): Promise<void> => ipcRenderer.invoke('db:bookmarks:remove', url),
    is: (url: string): Promise<boolean> => ipcRenderer.invoke('db:bookmarks:is', url),
  },

  /** Passwords */
  passwords: {
    getAll: (): Promise<import('../shared/types').SavedPassword[]> =>
      ipcRenderer.invoke('db:passwords:get-all'),
    getForOrigin: (origin: string): Promise<import('../shared/types').SavedPassword[]> =>
      ipcRenderer.invoke('db:passwords:get-for-origin', origin),
    getById: (id: number): Promise<import('../shared/types').SavedPassword | null> =>
      ipcRenderer.invoke('db:passwords:get-by-id', id),
    save: (
      origin: string,
      username: string,
      password: string,
      title: string,
      favicon?: string
    ): Promise<import('../shared/types').SavedPassword> =>
      ipcRenderer.invoke('db:passwords:save', origin, username, password, title, favicon),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('db:passwords:delete', id),
    clear: (): Promise<void> => ipcRenderer.invoke('db:passwords:clear'),
    search: (query: string): Promise<import('../shared/types').SavedPassword[]> =>
      ipcRenderer.invoke('db:passwords:search', query),
    /** Called by the renderer when user confirms "Save password". */
    onSavePrompt: (
      callback: (data: {
        origin: string;
        username: string;
        password: string;
        title: string;
        favicon?: string;
      }) => void
    ) => {
      const handler = (
        _e: Electron.IpcRendererEvent,
        data: {
          origin: string;
          username: string;
          password: string;
          title: string;
          favicon?: string;
        }
      ) => callback(data);
      ipcRenderer.on('save-password-prompt', handler);
      return () => {
        ipcRenderer.removeListener('save-password-prompt', handler);
      };
    },
    /** Inject autofill credentials into the given tab's webview. */
    autofill: (
      tabId: string,
      username: string,
      password: string
    ): Promise<{ ok: boolean; reason?: string }> =>
      ipcRenderer.invoke('browser:message', {
        type: 'autofill-credentials',
        tabId,
        username,
        password,
      }),
    /**
     * Absolute path of the guest preload that captures logins. Resolved in the
     * main process at startup, so the renderer never touches Node APIs and the
     * value is available synchronously on first render.
     */
    capturePreloadPath: (): string => capturePreloadPath,
  },

  /** Proxy */
  proxy: {
    fetch: (): Promise<import('../renderer/stores/settingsStore').ProxyInfo> =>
      ipcRenderer.invoke('proxy:fetch'),
    apply: (proxy: import('../renderer/stores/settingsStore').ProxyInfo): Promise<void> =>
      ipcRenderer.invoke('proxy:apply', proxy),
    clear: (): Promise<void> => ipcRenderer.invoke('proxy:clear'),
    verify: (proxy: import('../renderer/stores/settingsStore').ProxyInfo): Promise<boolean> =>
      ipcRenderer.invoke('proxy:verify', proxy),
  },

  /** Per-site zoom, remembered across navigations and restarts. */
  zoom: {
    get: (url: string): Promise<{ factor: number }> =>
      ipcRenderer.invoke('browser:message', { type: 'zoom-get', url }),
    set: (url: string, factor: number): Promise<{ factor: number }> =>
      ipcRenderer.invoke('browser:message', { type: 'zoom-set', url, factor }),
  },

  /** Restore the previous tab strip on next launch. */
  session: {
    setRestoreEnabled: (enabled: boolean): Promise<unknown> =>
      ipcRenderer.invoke('browser:message', { type: 'session-restore-setting', enabled }),
  },

  /** Network privacy policy */
  security: {
    set: (settings: {
      forceHttps: boolean;
      doNotTrack: boolean;
      stripTracking?: boolean;
    }): Promise<unknown> =>
      ipcRenderer.invoke('browser:message', { type: 'security-settings', ...settings }),
  },

  /** Ad blocker */
  adblock: {
    set: (enabled: boolean): Promise<boolean> => ipcRenderer.invoke('adblock:set', enabled),
    get: (): Promise<boolean> => ipcRenderer.invoke('adblock:get'),
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
    const handler = (
      _event: Electron.IpcRendererEvent,
      stats: { enabled: boolean; blocked: number }
    ) => callback(stats);
    ipcRenderer.on('adblock:stats', handler);
    return () => {
      ipcRenderer.removeListener('adblock:stats', handler);
    };
  },

  // ── Downloads ──────────────────────────────────────────────────────────────

  downloads: {
    list: (): Promise<import('../shared/types').Download[]> => ipcRenderer.invoke('download:list'),
    setPath: (p: string): Promise<void> => ipcRenderer.invoke('download:set-path', p),
    defaultPath: (): Promise<string> => ipcRenderer.invoke('download:default-path'),
    pickFolder: (): Promise<string | null> => ipcRenderer.invoke('download:pick-folder'),
    cancel: (id: string): Promise<void> => ipcRenderer.invoke('download:cancel', id),
    pause: (id: string): Promise<void> => ipcRenderer.invoke('download:pause', id),
    resume: (id: string): Promise<void> => ipcRenderer.invoke('download:resume', id),
    retry: (id: string): Promise<void> => ipcRenderer.invoke('download:retry', id),
    remove: (id: string): Promise<void> => ipcRenderer.invoke('download:remove', id),
    clear: (): Promise<void> => ipcRenderer.invoke('download:clear'),
    open: (id: string): Promise<void> => ipcRenderer.invoke('download:open', id),
    show: (id: string): Promise<void> => ipcRenderer.invoke('download:show', id),
    revealFolder: (): Promise<void> => ipcRenderer.invoke('download:reveal-folder'),
    /** Live updates: receives the full download list on every change. */
    onUpdated: (callback: (list: import('../shared/types').Download[]) => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        list: import('../shared/types').Download[]
      ) => callback(list);
      ipcRenderer.on('download:updated', handler);
      return () => {
        ipcRenderer.removeListener('download:updated', handler);
      };
    },
    /** Fired once when a new download begins. */
    onStarted: (callback: (d: import('../shared/types').Download) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, d: import('../shared/types').Download) =>
        callback(d);
      ipcRenderer.on('download:started', handler);
      return () => {
        ipcRenderer.removeListener('download:started', handler);
      };
    },
  },

  /** Clear local history and current-session site storage. */
  privacy: {
    clearData: (): Promise<void> => ipcRenderer.invoke('privacy:clear-data'),
  },

  /** Certificate information for a given hostname. */
  cert: {
    get: (hostname: string): Promise<import('../shared/types').CertInfo | null> =>
      ipcRenderer.invoke('cert:get', hostname),
  },

  /** Per-site permission decisions (Allow / Block per host+permission). */
  permissions: {
    list: (): Promise<Record<string, Record<string, boolean>>> =>
      ipcRenderer.invoke('permissions:list'),
    set: (host: string, permission: string, allowed: boolean): Promise<void> =>
      ipcRenderer.invoke('permissions:set', host, permission, allowed),
    clear: (host: string, permission: string): Promise<void> =>
      ipcRenderer.invoke('permissions:clear', host, permission),
    resetAll: (): Promise<void> => ipcRenderer.invoke('permissions:reset-all'),
  },

  /** Read the page as a clean typographic article (reading mode). */
  reader: {
    toggle: (tabId: string): Promise<{ ok: boolean; activated?: boolean; reason?: string }> =>
      ipcRenderer.invoke('browser:message', { type: 'reader-toggle', tabId }),
    /** Whether reading mode is currently applied to the tab's live page. */
    isActive: (tabId: string): Promise<boolean> =>
      ipcRenderer.invoke('browser:message', { type: 'reader-is-active', tabId }),
  },

  /** AI agent. Gated on browserMode === 'full' in the UI. */
  agent: {
    /** The whole agent configuration, owned and enforced by the main process. */
    getConfig: (): Promise<{
      config: import('../shared/agentConfig').AgentConfig;
      hasApiKey: boolean;
    }> => ipcRenderer.invoke('agent:config:get'),
    updateConfig: (
      patch: Partial<import('../shared/agentConfig').AgentConfig>
    ): Promise<import('../shared/agentConfig').AgentConfig> =>
      ipcRenderer.invoke('agent:config:update', patch),
    resetConfig: (): Promise<import('../shared/agentConfig').AgentConfig> =>
      ipcRenderer.invoke('agent:config:reset'),

    memory: {
      add: (content: string): Promise<import('../shared/agentConfig').MemoryEntry | null> =>
        ipcRenderer.invoke('agent:memory:add', content),
      update: (id: string, content: string): Promise<unknown> =>
        ipcRenderer.invoke('agent:memory:update', { id, content }),
      remove: (id: string): Promise<unknown> => ipcRenderer.invoke('agent:memory:delete', id),
      clear: (): Promise<unknown> => ipcRenderer.invoke('agent:memory:clear'),
    },

    activity: {
      clear: (): Promise<unknown> => ipcRenderer.invoke('agent:activity:clear'),
    },

    files: {
      /** Open the OS folder picker. Returns null if the user cancelled. */
      pickFolder: (): Promise<string | null> => ipcRenderer.invoke('agent:files:pick-folder'),
    },

    tasks: {
      runNow: (id: string): Promise<{ ok: boolean; summary: string }> =>
        ipcRenderer.invoke('agent:task:run-now', id),
    },
    setApiKey: (key: string): Promise<{ ok: boolean; reason?: string }> =>
      ipcRenderer.invoke('agent:key:set', key),
    /**
     * Models the saved Gemini key can actually use. Never throws across IPC —
     * the caller gets `{ ok: false, error }` and can keep its existing list.
     */
    listModels: (): Promise<
      | { ok: true; models: Array<{ id: string; label: string; description?: string }> }
      | { ok: false; error: string }
    > => ipcRenderer.invoke('agent:models:list'),
    getProfile: (): Promise<import('../shared/agent').AgentProfileField[]> =>
      ipcRenderer.invoke('agent:profile:get'),
    setProfile: (
      fields: import('../shared/agent').AgentProfileField[]
    ): Promise<{ ok: boolean; reason?: string }> => ipcRenderer.invoke('agent:profile:set', fields),
    run: (goal: string): Promise<{ ok: boolean }> => ipcRenderer.invoke('agent:run', goal),
    stop: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('agent:stop'),
    /** Pause after the current step; the agent parks until resumed. */
    pause: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('agent:pause'),
    resume: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('agent:resume'),
    /**
     * Answer the agent: true/false for a confirmation, 'always' to also trust
     * the site, or free text to answer a question.
     */
    respond: (value: boolean | 'always' | string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('agent:respond', value),
    /** Live run events: state changes, steps, confirmations. */
    onEvent: (callback: (event: import('../shared/agent').AgentEvent) => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        payload: import('../shared/agent').AgentEvent
      ) => callback(payload);
      ipcRenderer.on('agent:event', handler);
      return () => {
        ipcRenderer.removeListener('agent:event', handler);
      };
    },
  },

  /**
   * General settings the main process must enforce (Accept-Language, guest
   * font sizes, download behaviour, launch-at-login, default browser).
   * The renderer settings store remains the source of truth.
   */
  general: {
    apply: (
      settings: import('../shared/generalSettings').MainGeneralSettings
    ): Promise<import('../shared/generalSettings').MainGeneralSettings> =>
      ipcRenderer.invoke('general:apply', settings),
    getLaunchAtLogin: (): Promise<boolean> => ipcRenderer.invoke('general:launch-at-login:get'),
    setLaunchAtLogin: (enabled: boolean): Promise<boolean> =>
      ipcRenderer.invoke('general:launch-at-login:set', enabled),
    isDefaultBrowser: (): Promise<boolean> => ipcRenderer.invoke('general:default-browser:get'),
    makeDefaultBrowser: (): Promise<boolean> => ipcRenderer.invoke('general:default-browser:set'),
  },

  /** DNS-over-HTTPS mode. Changes apply on the next launch. */
  dns: {
    getMode: (): Promise<'automatic' | 'secure'> => ipcRenderer.invoke('dns:get-mode'),
    setMode: (mode: 'automatic' | 'secure'): Promise<'automatic' | 'secure'> =>
      ipcRenderer.invoke('dns:set-mode', mode),
  },

  /** Search suggestions from Google Autocomplete (routed through main to bypass CORS). */
  searchSuggestions: (query: string): Promise<string[]> =>
    ipcRenderer.invoke('search-suggestions', query),

  /** Open external URLs in the default browser. */
  shell: {
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:open-external', url),
  },
};

// SECURITY: Expose only the API object, not ipcRenderer or any other Electron/Node APIs
contextBridge.exposeInMainWorld('browserAPI', browserAPI);

export type BrowserAPI = typeof browserAPI;
