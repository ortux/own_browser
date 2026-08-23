import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { BackgroundCategory } from '../lib/backgroundCache';

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
  setSecurityFlag: (flag: keyof SecuritySettings, value: boolean) => void;

  // Appearance / theme
  theme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;

  // Signed-in account (null = not signed in)
  account: { name: string; image?: string } | null;

  // New-tab mode
  newTabMode: 'minimal' | 'full';
  backgroundCategory: BackgroundCategory;
  setNewTabMode: (mode: 'minimal' | 'full') => void;
  setBackgroundCategory: (category: BackgroundCategory) => void;
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
        return engine.url.replace('%s', encodeURIComponent(query));
      },

      addCustomSearchEngine: (name: string, url: string) => {
        const trimmed = url.trim();
        // Must contain the %s query placeholder and a valid-ish URL.
        if (!trimmed.includes('%s')) return false;
        if (!/^https?:\/\//i.test(trimmed)) return false;
        const engine: SearchEngine = {
          id: `custom-${Date.now()}`,
          name: name.trim() || 'Custom',
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

      setSecurityFlag: (flag, value) =>
        set((s) => ({ security: { ...s.security, [flag]: value } })),

      theme: 'dark',
      setTheme: (theme) => set({ theme }),

      account: null,

      newTabMode: 'full',
      backgroundCategory: 'random',
      setNewTabMode: (mode) => set({ newTabMode: mode }),
      setBackgroundCategory: (category) => set({ backgroundCategory: category }),
    }),
    {
      name: 'own-browser-settings',
    }
  )
);
