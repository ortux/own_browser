import { create } from 'zustand';
import { DEFAULT_SLEEP_MINUTES, clampSleepMinutes } from '../../shared/tabSleep';
import {
  DEFAULT_GENERAL_SETTINGS,
  normalizeSettingsUrl,
  type GeneralSettings,
} from '../../shared/generalSettings';
import { persist } from 'zustand/middleware';
import type { BackgroundCategory } from '../lib/backgroundCache';
import { getApiBaseUrl } from '../lib/config';
import { saveTokens, clearTokens, getStoredTokens } from '../lib/tokenManager';
import { apiClient } from '../lib/apiClient';

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
  type: string; // "http" | "socks4" | "socks5"
  proxyLevel: string; // "anonymous" | "elite" | "transparent"
  supportsHttps: boolean;
  speed: number; // seconds
  fetchedAt: number; // unix ms
}

export interface SecuritySettings {
  blockTrackers: boolean;
  forceHttps: boolean;
  doNotTrack: boolean;
  privateByDefault: boolean;
}

export interface AuthUser {
  name?: string;
  email?: string;
  image?: string;
  role?: string;
  id?: number;
}

export type AuthStatus = 'idle' | 'loading' | 'error' | 'authenticated';

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  token_type?: string;
  expires_in: number;
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
  account: AuthUser | null;
  guestMode: boolean;
  onboardingCompleted: boolean;
  firstRunTourCompleted: boolean;
  authPromptLastShownAt: number | null;
  markAuthPromptShown: () => void;
  chooseGuest: () => void;
  completeOnboarding: () => void;
  completeFirstRunTour: () => void;
  /** Epoch ms when the user accepted the Terms of Service, or null. */
  termsAcceptedAt: number | null;
  agreeToTerms: () => void;

  // Authentication
  authBaseUrl: string;
  authStatus: AuthStatus;
  authError: string | null;
  passwordManagerEnabled: boolean;
  setPasswordManagerEnabled: (enabled: boolean) => void;
  signOut: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name?: string) => Promise<void>;
  applyAuthSession: (payload: { tokens: AuthTokens; user: AuthUser }) => Promise<void>;

  /** Strip utm_/gclid/fbclid-style parameters from URLs before navigating. */
  stripTrackingParams: boolean;
  setStripTrackingParams: (enabled: boolean) => void;

  /** Suspend idle background tabs to free their renderer processes. */
  sleepTabs: boolean;
  setSleepTabs: (enabled: boolean) => void;

  /** Minutes a background tab must be idle before it is suspended. */
  sleepTabsAfterMinutes: number;
  setSleepTabsAfterMinutes: (minutes: number) => void;

  /** Days of history to keep. 0 keeps everything. */
  historyRetentionDays: number;
  setHistoryRetentionDays: (days: number) => void;

  // Startup
  /** Reopen the previous tabs on launch instead of a single blank tab. */
  restoreSession: boolean;
  setRestoreSession: (enabled: boolean) => void;

  /**
   * Browser feature level — one switch for the whole product.
   *
   * 'minimal' is a deliberately reduced browser: heavier, non-essential
   * subsystems (the AI agent) are hidden and never initialised, and the new
   * tab page drops its photo background, clock and quote for a plain surface.
   *
   * This used to be two independent settings (`browserMode` and
   * `newTabMode`), which let you ask for a minimal browser and still get the
   * maximal new tab page. They are now a single choice.
   */
  browserMode: 'minimal' | 'full';
  setBrowserMode: (mode: 'minimal' | 'full') => void;

  backgroundCategory: BackgroundCategory;
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

  /**
   * Everything the General settings page owns. One nested object rather than
   * ~45 top-level keys, so persistence, reset and the settings-search index
   * can all address it generically. Settings that already existed (theme,
   * searchEngineId, restoreSession, sleepTabs, downloadPath …) are NOT
   * duplicated here — the General page reads and writes those directly.
   */
  general: GeneralSettings;
  setGeneral: <K extends keyof GeneralSettings>(key: K, value: GeneralSettings[K]) => void;
  /** Returns false when the URL is not a usable http(s) address. */
  addStartupPage: (url: string) => boolean;
  updateStartupPage: (index: number, url: string) => boolean;
  removeStartupPage: (index: number) => void;
  addNeverTranslateLanguage: (id: string) => void;
  removeNeverTranslateLanguage: (id: string) => void;
  /**
   * Restore browser preferences to their defaults. Deliberately does NOT touch
   * bookmarks, saved passwords, history, downloaded files, or agent memory —
   * those have their own explicit destructive actions.
   */
  resetBrowserSettings: () => void;

  // Device management
  deviceKey: string;
  deviceName: string;
  /** Record a device name chosen before an account exists (onboarding). */
  setDeviceName: (name: string) => void;
  registerDevice: (name: string, token: string) => Promise<void>;
}

function sanitizeProxy(value: unknown): ProxyInfo | null {
  if (!value || typeof value !== 'object') return null;
  const proxy = value as Partial<ProxyInfo>;
  if (
    typeof proxy.ip !== 'string' ||
    typeof proxy.port !== 'string' ||
    typeof proxy.ipPort !== 'string' ||
    proxy.ipPort !== `${proxy.ip}:${proxy.port}`
  )
    return null;
  return {
    ip: proxy.ip,
    port: proxy.port,
    ipPort: proxy.ipPort,
    country: typeof proxy.country === 'string' ? proxy.country : 'Unknown',
    type: typeof proxy.type === 'string' ? proxy.type : 'http',
    proxyLevel: typeof proxy.proxyLevel === 'string' ? proxy.proxyLevel : 'unknown',
    supportsHttps: proxy.supportsHttps === true,
    speed: typeof proxy.speed === 'number' && Number.isFinite(proxy.speed) ? proxy.speed : 0,
    fetchedAt:
      typeof proxy.fetchedAt === 'number' && Number.isFinite(proxy.fetchedAt) ? proxy.fetchedAt : 0,
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
        // Prevent duplicate engines with the same URL.
        const { customSearchEngines } = get();
        const allEngines = [...SEARCH_ENGINES, ...customSearchEngines];
        if (allEngines.some((e) => e.url === trimmed)) return false;
        const engine: SearchEngine = {
          id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
      adblockAllowlist: [],

      setSecurityFlag: (flag, value) =>
        set((s) => ({ security: { ...s.security, [flag]: value } })),
      setAdblockAllowlist: (sites) =>
        set({
          adblockAllowlist: [
            ...new Set(sites.map((site) => site.toLowerCase().replace(/^www\./, ''))),
          ],
        }),

      theme: 'dark',
      setTheme: (theme) => set({ theme }),

      account: null,
      guestMode: false,
      onboardingCompleted: false,
      firstRunTourCompleted: false,
      authPromptLastShownAt: null,
      markAuthPromptShown: () => set({ authPromptLastShownAt: Date.now() }),
      chooseGuest: () => set({ guestMode: true }),
      completeOnboarding: () => set({ onboardingCompleted: true }),
      completeFirstRunTour: () => set({ firstRunTourCompleted: true }),
      termsAcceptedAt: null,
      // Was `set({})` — a literal no-op, so consent was never recorded.
      agreeToTerms: () => set({ termsAcceptedAt: Date.now() }),

      stripTrackingParams: true,
      setStripTrackingParams: (enabled) => set({ stripTrackingParams: enabled }),

      sleepTabs: true,
      setSleepTabs: (enabled) => set({ sleepTabs: enabled }),

      sleepTabsAfterMinutes: DEFAULT_SLEEP_MINUTES,
      setSleepTabsAfterMinutes: (minutes) =>
        set({ sleepTabsAfterMinutes: clampSleepMinutes(minutes) }),

      historyRetentionDays: 0,
      setHistoryRetentionDays: (days) => set({ historyRetentionDays: days }),

      restoreSession: false,
      setRestoreSession: (enabled) => set({ restoreSession: enabled }),

      // Default to the lightweight profile. Full agent features can still be
      // enabled manually from settings without paying the memory cost on first
      // launch.
      browserMode: 'minimal',
      setBrowserMode: (mode) => set({ browserMode: mode }),

      backgroundCategory: 'random',
      setBackgroundCategory: (category) => set({ backgroundCategory: category }),

      proxy: null,
      proxyEnabled: false,
      setProxy: (proxy) => set({ proxy }),
      setProxyEnabled: (enabled) => set({ proxyEnabled: enabled }),

      downloadPath: '',
      setDownloadPath: (path) => set({ downloadPath: path }),
      openDownloadsOnStart: false,
      setOpenDownloadsOnStart: (value) => set({ openDownloadsOnStart: value }),

      // Auth
      authBaseUrl: getApiBaseUrl(),
      authStatus: 'idle',
      authError: null,
      passwordManagerEnabled: false,
      setPasswordManagerEnabled: (enabled) => set({ passwordManagerEnabled: enabled }),
      signOut: async () => {
        // Best-effort server-side revocation so the refresh token cannot be
        // replayed. A network failure must never trap the user in a signed-in
        // state, so the local teardown below runs regardless.
        const refreshToken = getStoredTokens()?.refresh_token;
        if (refreshToken) {
          try {
            await fetch(`${getApiBaseUrl()}/auth/logout`, {
              method: 'POST',
              mode: 'cors',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ refresh_token: refreshToken }),
            });
          } catch {
            /* offline or endpoint unavailable — local sign-out still applies */
          }
        }

        clearTokens();
        localStorage.removeItem('zyphora_user');
        localStorage.removeItem('zyphora_tokens'); // Clear old format
        // Anything queued for the previous account must not be replayed under
        // the next one.
        localStorage.removeItem('zyphora_sync_queue');
        // The device registration belonged to that account; a later sign-in
        // re-registers this device against the new one.
        set({
          account: null,
          authStatus: 'idle',
          authError: null,
          deviceName: '',
          guestMode: false,
        });
      },
      signIn: async (email, password) => {
        set({ authStatus: 'loading', authError: null });
        try {
          const baseUrl = getApiBaseUrl();
          const response = await fetch(`${baseUrl}/auth/login`, {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data?.error || 'Login failed');

          // Save tokens using secure token manager
          if (data?.tokens) {
            saveTokens(data.tokens);
          }

          await get().applyAuthSession(data);
          set({ authStatus: 'authenticated', authError: null });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Sign in failed';
          set({ authStatus: 'error', authError: message });
          throw error;
        }
      },
      signUp: async (email, password, name) => {
        set({ authStatus: 'loading', authError: null });
        try {
          const baseUrl = getApiBaseUrl();
          const response = await fetch(`${baseUrl}/auth/register`, {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, name: name || undefined }),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data?.error || 'Registration failed');

          // Save tokens using secure token manager
          if (data?.tokens) {
            saveTokens(data.tokens);
          }

          await get().applyAuthSession(data);
          set({ authStatus: 'authenticated', authError: null });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Sign up failed';
          set({ authStatus: 'error', authError: message });
          throw error;
        }
      },
      applyAuthSession: async (payload) => {
        if (payload?.tokens) {
          // Save tokens using secure token manager
          saveTokens(payload.tokens);
        }
        if (payload?.user) {
          localStorage.setItem('zyphora_user', JSON.stringify(payload.user));
          set({ account: payload.user, authStatus: 'authenticated', authError: null });
        }
      },

      // ── General settings ────────────────────────────────────────────────
      general: { ...DEFAULT_GENERAL_SETTINGS },

      setGeneral: (key, value) => set((s) => ({ general: { ...s.general, [key]: value } })),

      addStartupPage: (url) => {
        const normalized = normalizeSettingsUrl(url);
        if (!normalized) return false;
        set((s) => ({
          general: {
            ...s.general,
            startupPages: [...s.general.startupPages, normalized].slice(0, 50),
          },
        }));
        return true;
      },

      updateStartupPage: (index, url) => {
        const normalized = normalizeSettingsUrl(url);
        if (!normalized) return false;
        set((s) => ({
          general: {
            ...s.general,
            startupPages: s.general.startupPages.map((p, i) => (i === index ? normalized : p)),
          },
        }));
        return true;
      },

      removeStartupPage: (index) =>
        set((s) => ({
          general: {
            ...s.general,
            startupPages: s.general.startupPages.filter((_, i) => i !== index),
          },
        })),

      addNeverTranslateLanguage: (id) =>
        set((s) => ({
          general: {
            ...s.general,
            neverTranslateLanguages: [...new Set([...s.general.neverTranslateLanguages, id])],
          },
        })),

      removeNeverTranslateLanguage: (id) =>
        set((s) => ({
          general: {
            ...s.general,
            neverTranslateLanguages: s.general.neverTranslateLanguages.filter((l) => l !== id),
          },
        })),

      resetBrowserSettings: () => {
        set({
          general: { ...DEFAULT_GENERAL_SETTINGS },
          // Pre-existing preferences the General page surfaces. Reset them too,
          // otherwise "restore defaults" would leave half the page unchanged.
          searchEngineId: 'duckduckgo',
          theme: 'dark',
          restoreSession: false,
          sleepTabs: true,
          sleepTabsAfterMinutes: DEFAULT_SLEEP_MINUTES,
          openDownloadsOnStart: false,
          stripTrackingParams: true,
          backgroundCategory: 'random',
          security: {
            blockTrackers: true,
            forceHttps: true,
            doNotTrack: false,
            privateByDefault: false,
          },
        });
      },

      // Device management
      deviceKey: (() => {
        const stored = localStorage.getItem('zyphora_device_key');
        if (stored) return stored;
        const generated = Array.from(crypto.getRandomValues(new Uint8Array(32)))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
        localStorage.setItem('zyphora_device_key', generated);
        return generated;
      })(),
      deviceName: '',
      setDeviceName: (name: string) => set({ deviceName: name.trim().slice(0, 64) }),
      registerDevice: async (name: string, token?: string) => {
        try {
          const baseUrl = getApiBaseUrl();

          // Ensure device key is always present — read directly from localStorage
          // as a fallback in case the store state hasn't hydrated yet
          let deviceKey = get().deviceKey;
          if (!deviceKey) {
            deviceKey = localStorage.getItem('zyphora_device_key') || '';
          }
          if (!deviceKey) {
            deviceKey = Array.from(crypto.getRandomValues(new Uint8Array(32)))
              .map((b) => b.toString(16).padStart(2, '0'))
              .join('');
            localStorage.setItem('zyphora_device_key', deviceKey);
            set({ deviceKey });
          }

          const trimmedName = name.trim();
          if (!trimmedName) throw new Error('Device name is required');
          if (token) {
            const response = await fetch(`${baseUrl}/api/v1/devices`, {
              method: 'POST',
              mode: 'cors',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                device_key: deviceKey,
                name: trimmedName,
              }),
            });
            if (!response.ok) {
              const data = await response.json().catch(() => ({}));
              throw new Error(data?.error || 'Failed to register device');
            }
            set({ deviceName: trimmedName });
          } else {
            // Use apiClient which has automatic token refresh
            const response = await apiClient.post(
              '/api/v1/devices',
              {
                device_key: deviceKey,
                name: trimmedName,
              },
              { requireAuth: true }
            );
            if (!response.ok) {
              throw new Error(response.error || 'Failed to register device');
            }
            set({ deviceName: trimmedName });
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Device registration failed';
          console.error('Device registration error:', message);
          throw error;
        }
      },
    }),
    {
      name: 'zyphora-settings',
      partialize: (state) => {
        // Never persist authBaseUrl (always derived fresh from config) or the
        // transient auth status/error. Destructuring `state` directly keeps
        // this honest: if one of these keys is ever renamed the build fails,
        // whereas the previous `state as any` would have silently started
        // persisting it.
        const {
          authBaseUrl: _authBaseUrl,
          authStatus: _authStatus,
          authError: _authError,
          ...rest
        } = state;
        return { ...rest, proxy: sanitizeProxy(state.proxy) };
      },
      merge: (persisted, current) => {
        const stored = persisted as Partial<SettingsStore>;
        const proxy = sanitizeProxy(stored.proxy);
        // Migration: `newTabMode` was folded into `browserMode`. Someone who
        // had explicitly chosen a minimal new tab page asked for a quieter
        // browser, so honour that rather than silently upgrading them.
        const legacyNewTabMode = (stored as { newTabMode?: unknown }).newTabMode;
        const browserMode =
          stored.browserMode === 'minimal' || legacyNewTabMode === 'minimal'
            ? ('minimal' as const)
            : (stored.browserMode ?? current.browserMode);

        return {
          ...current,
          ...stored,
          browserMode,
          // Always use the live config value — never restore from localStorage
          authBaseUrl: getApiBaseUrl(),
          authStatus: 'idle',
          authError: null,
          security: { ...current.security, ...stored.security },
          // Key-wise merge, so a setting added in a later version arrives at
          // its default instead of `undefined` for existing installs.
          general: { ...DEFAULT_GENERAL_SETTINGS, ...stored.general },
          proxy,
          proxyEnabled: proxy !== null && stored.proxyEnabled === true,
        };
      },
    }
  )
);

/**
 * A human label for an account.
 *
 * The backend's user payload has no `name` field — only `email` — so anything
 * rendering `account.name` directly showed an empty string for every signed-in
 * user. Fall back to the local part of the email, then to a generic label.
 */
export function accountDisplayName(account: AuthUser | null): string {
  if (!account) return 'Guest';
  const name = account.name?.trim();
  if (name) return name;
  const email = account.email?.trim();
  if (email) return email.split('@')[0] || email;
  return 'Account';
}
