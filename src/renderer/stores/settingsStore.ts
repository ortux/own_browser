import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { BackgroundCategory } from '../lib/backgroundCache';

export interface SearchEngine {
  id: string;
  name: string;
  url: string; // must contain %s as query placeholder
  shortcut: string;
}

export interface ProxyInfo {
  ip: string;
  port: string;
  ipPort: string;
  country: string;
  type: string;           // "http" | "socks4" | "socks5"
  proxyLevel: string;     // "anonymous" | "elite" | "transparent"
  supportsHttps: boolean;
  speed: number;          // seconds
  fetchedAt: number;      // unix ms
}

export interface SecuritySettings {
  blockTrackers: boolean;
  forceHttps: boolean;
  doNotTrack: boolean;
  privateByDefault: boolean;
}

export const SEARCH_ENGINES: SearchEngine[] = [
  {
    id: 'duckduckgo',
    name: 'DuckDuckGo',
    url: 'https://duckduckgo.com/?q=%s',
    shortcut: 'ddg',
  },
  {
    id: 'google',
    name: 'Google',
    url: 'https://www.google.com/search?igu=1&q=%s',
    shortcut: 'g',
  },
  {
    id: 'bing',
    name: 'Bing',
    url: 'https://www.bing.com/search?q=%s',
    shortcut: 'bing',
  },
  {
    id: 'brave',
    name: 'Brave Search',
    url: 'https://search.brave.com/search?q=%s',
    shortcut: 'brave',
  },
  {
    id: 'ecosia',
    name: 'Ecosia',
    url: 'https://www.ecosia.org/search?q=%s',
    shortcut: 'eco',
  },
  {
    id: 'startpage',
    name: 'Startpage',
    url: 'https://www.startpage.com/search?q=%s',
    shortcut: 'sp',
  },
];

interface SettingsStore {
  searchEngineId: string;
  setSearchEngine: (id: string) => void;
  getSearchEngine: () => SearchEngine;
  buildSearchUrl: (query: string) => string;
  // User-added search engines (persisted)
  customSearchEngines: SearchEngine[];
  addCustomSearchEngine: (name: string, url: string) => boolean;
  removeCustomSearchEngine: (id: string) => void;

  // Security / privacy
  security: SecuritySettings;
  setSecurityFlag: (flag: keyof SecuritySettings, value: boolean) => void;
  adblockAllowlist: string[];
  setAdblockAllowlist: (sites: string[]) => void;

  // Appearance / theme
  theme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;

  // Signed-in account (null = not signed in)
  account: { name: string; image?: string } | null;
  authPromptLastShownAt: number | null;
  markAuthPromptShown: () => void;

  // New-tab mode
  newTabMode: 'minimal' | 'full';
  backgroundCategory: BackgroundCategory;
  setNewTabMode: (mode: 'minimal' | 'full') => void;
  setBackgroundCategory: (category: BackgroundCategory) => void;

  // Proxy
  proxy: ProxyInfo | null;
  proxyEnabled: boolean;
  setProxy: (proxy: ProxyInfo | null) => void;
  setProxyEnabled: (enabled: boolean) => void;

  // Downloads
  downloadPath: string;
  setDownloadPath: (path: string) => void;
  openDownloadsOnStart: boolean;
  setOpenDownloadsOnStart: (value: boolean) => void;
}

function sanitizeProxy(value: unknown): ProxyInfo | null {
  if (!value || typeof value !== 'object') return null;
  const proxy = value as Partial<ProxyInfo>;
  if (
    typeof proxy.ip !== 'string'
    || typeof proxy.port !== 'string'
    || typeof proxy.ipPort !== 'string'
    || proxy.ipPort !== `${proxy.ip}:${proxy.port}`
  ) return null;
  return {
    ip: proxy.ip,
    port: proxy.port,
    ipPort: proxy.ipPort,
    country: typeof proxy.country === 'string' ? proxy.country : 'Unknown',
    type: typeof proxy.type === 'string' ? proxy.type : 'http',
    proxyLevel: typeof proxy.proxyLevel === 'string' ? proxy.proxyLevel : 'unknown',
    supportsHttps: proxy.supportsHttps === true,
    speed: typeof proxy.speed === 'number' && Number.isFinite(proxy.speed) ? proxy.speed : 0,
    fetchedAt: typeof proxy.fetchedAt === 'number' && Number.isFinite(proxy.fetchedAt)
      ? proxy.fetchedAt
      : 0,
  };
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      searchEngineId: 'duckduckgo',
      customSearchEngines: [],

      setSearchEngine: (id: string) => {
        const all = [...SEARCH_ENGINES, ...get().customSearchEngines];
        if (all.find((e) => e.id === id)) set({ searchEngineId: id });
      },

      getSearchEngine: () => {
        const { searchEngineId, customSearchEngines } = get();
        const all = [...SEARCH_ENGINES, ...customSearchEngines];
        return all.find((e) => e.id === searchEngineId) ?? SEARCH_ENGINES[0];
      },

      buildSearchUrl: (query: string) => {
        const engine = get().getSearchEngine();
        return engine.url.replace(/%s/g, encodeURIComponent(query));
      },

      addCustomSearchEngine: (name: string, url: string) => {
        const trimmed = url.trim();
        // The URL is user input and is later loaded in a webview. Validate it
        // with URL rather than accepting a string that merely starts with https.
        const hasControlCharacter = [...trimmed].some((character) => character.charCodeAt(0) < 32);
        if (trimmed.length > 2_048 || !trimmed.includes('%s') || hasControlCharacter) {
          return false;
        }
        try {
          const parsed = new URL(trimmed);
          if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) return false;
        } catch {
          return false;
        }
        const engine: SearchEngine = {
          id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,          name: name.trim() || 'Custom',
          url: trimmed,
          shortcut: '',
        };
        set((s) => ({
          customSearchEngines: [...s.customSearchEngines, engine],
          searchEngineId: engine.id,
        }));
        return true;
      },

      removeCustomSearchEngine: (id: string) =>
        set((s) => ({
          customSearchEngines: s.customSearchEngines.filter((e) => e.id !== id),
        })),

      security: {
        blockTrackers: true,
        forceHttps: true,
        doNotTrack: false,
        privateByDefault: false,
      },
      adblockAllowlist: [],

      setSecurityFlag: (flag, value) =>
        set((s) => ({ security: { ...s.security, [flag]: value } })),
      setAdblockAllowlist: (sites) =>
        set({ adblockAllowlist: [...new Set(sites.map((site) => site.toLowerCase().replace(/^www\./, '')))] }),

      theme: 'dark',
      setTheme: (theme) => set({ theme }),

      account: null,
      authPromptLastShownAt: null,
      markAuthPromptShown: () => set({ authPromptLastShownAt: Date.now() }),

      newTabMode: 'full',
      backgroundCategory: 'random',
      setNewTabMode: (mode) => set({ newTabMode: mode }),
      setBackgroundCategory: (category) => set({ backgroundCategory: category }),

      proxy: null,
      proxyEnabled: false,
      setProxy: (proxy) => set({ proxy }),
      setProxyEnabled: (enabled) => set({ proxyEnabled: enabled }),

      downloadPath: '',
      setDownloadPath: (path) => set({ downloadPath: path }),
      openDownloadsOnStart: false,
      setOpenDownloadsOnStart: (value) => set({ openDownloadsOnStart: value }),
    }),
    {
      name: 'own-browser-settings',
      partialize: (state) => ({ ...state, proxy: sanitizeProxy(state.proxy) }),
      merge: (persisted, current) => {
        const stored = persisted as Partial<SettingsStore>;
        const proxy = sanitizeProxy(stored.proxy);
        return {
          ...current,
          ...stored,
          security: { ...current.security, ...stored.security },
          proxy,
          proxyEnabled: proxy !== null && stored.proxyEnabled === true,
        };
      },
    }
  )
);
