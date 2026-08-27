import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { BackgroundCategory } from '../lib/backgroundCache';
import type { ProxyInfo } from '../../shared/types';

export type { ProxyInfo };

export interface SearchEngine {
  id: string;
  name: string;
  url: string; // must contain %s as query placeholder
  shortcut: string;
}

export interface SecuritySettings {
  blockTrackers: boolean;
  forceHttps: boolean;
  doNotTrack: boolean;
  privateByDefault: boolean;
  /** Send the Global Privacy Control signal (Sec-GPC: 1). */
  globalPrivacyControl: boolean;
  /** Strip utm_ and click-tracker identifiers from navigations. */
  stripTrackingParams: boolean;
  /** WebRTC IP handling policy (applies on next launch). */
  webrtcPolicy: 'default' | 'public-only' | 'disable';
  /** Block third-party cookies (applies on next launch). */
  blockThirdPartyCookies: boolean;
  /** Skip sponsored segments on YouTube (queries sponsor.ajay.app). */
  sponsorBlock: boolean;
}

export interface QuickLink {
  url: string;
  title: string;
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
    url: 'https://www.google.com/search?q=%s',
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
  setSecurityFlag: <K extends keyof SecuritySettings>(flag: K, value: SecuritySettings[K]) => void;
  adblockAllowlist: string[];
  setAdblockAllowlist: (sites: string[]) => void;

  // Session
  restoreSession: boolean;
  setRestoreSession: (enabled: boolean) => void;

  // New-tab quick links (user-pinned shortcuts)
  quickLinks: QuickLink[];
  addQuickLink: (url: string, title: string) => boolean;
  removeQuickLink: (url: string) => void;

  // Appearance / theme
  theme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;

  // Signed-in account (null = not signed in)
  account: { name: string; image?: string } | null;
  /** Local-only profile display name (no sync, no account). */
  setAccountName: (name: string) => void;

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
  downloadRetentionDays: number;
  setDownloadRetentionDays: (days: number) => void;

  /** Per-origin zoom factor persistence (origin → factor, 1 = default). */
  siteZoom: Record<string, number>;
  setSiteZoom: (origin: string, factor: number) => void;
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
        globalPrivacyControl: false,
        stripTrackingParams: false,
        webrtcPolicy: 'public-only',
        blockThirdPartyCookies: true,
        sponsorBlock: false,
      },
      adblockAllowlist: [],

      setSecurityFlag: (flag, value) =>
        set((s) => ({ security: { ...s.security, [flag]: value } })),
      setAdblockAllowlist: (sites) =>
        set({ adblockAllowlist: [...new Set(sites.map((site) => site.toLowerCase().replace(/^www\./, '')))] }),

      restoreSession: true,
      setRestoreSession: (enabled) => set({ restoreSession: enabled }),

      quickLinks: [],
      addQuickLink: (url, title) => {
        const trimmed = url.trim();
        try {
          const parsed = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
          if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) return false;
          const finalUrl = parsed.toString();
          if (get().quickLinks.some((link) => link.url === finalUrl)) return false;
          const host = parsed.hostname.replace(/^www\./, '');
          set((s) => ({
            quickLinks: [...s.quickLinks, { url: finalUrl, title: (title.trim() || host).slice(0, 60) }],
          }));
          return true;
        } catch {
          return false;
        }
      },
      removeQuickLink: (url) =>
        set((s) => ({ quickLinks: s.quickLinks.filter((link) => link.url !== url) })),

      theme: 'dark',
      setTheme: (theme) => set({ theme }),

      account: null,
      setAccountName: (name) => {
        const trimmed = name.trim().slice(0, 60);
        set({ account: trimmed ? { name: trimmed } : null });
      },

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
      downloadRetentionDays: 30,
      setDownloadRetentionDays: (days) =>
        set({ downloadRetentionDays: Math.min(365, Math.max(0, Math.floor(days))) }),

      siteZoom: {},
      setSiteZoom: (origin, factor) =>
        set((s) => {
          const next = { ...s.siteZoom };
          if (Math.abs(factor - 1) < 0.01) delete next[origin];
          else next[origin] = Math.min(3, Math.max(0.5, factor));
          // Cap the map so years of browsing cannot grow it unbounded.
          const keys = Object.keys(next);
          if (keys.length > 200) for (const key of keys.slice(0, keys.length - 200)) delete next[key];
          return { siteZoom: next };
        }),
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
