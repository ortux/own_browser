/**
 * generalSettings.ts — the schema, defaults and validators for everything the
 * General settings page owns.
 *
 * It lives in `shared/` because both processes need it: the renderer persists
 * it (inside the existing settings store — there is deliberately no second
 * store) and the main process consumes the parts that only Chromium can
 * enforce (accept-languages, guest font sizes, download prompts).
 */

export type StartupMode = 'new-tab' | 'continue' | 'specific-pages';
export type HomepageMode = 'new-tab' | 'custom';
export type ExternalLinkTarget = 'tab' | 'window';
export type TimeFormat = '12h' | '24h';
export type DateFormat = 'system' | 'dmy' | 'mdy' | 'ymd';
export type NumberFormat = 'system' | 'comma-dot' | 'dot-comma' | 'space-comma' | 'indian';

export interface GeneralSettings {
  // ── 1. Startup ───────────────────────────────────────────────────────────
  startupMode: StartupMode;
  startupPages: string[];
  launchAtLogin: boolean;

  // ── 2. Search ────────────────────────────────────────────────────────────
  searchSuggestions: boolean;
  searchHistorySuggestions: boolean;
  searchBookmarkSuggestions: boolean;
  searchFromAddressBar: boolean;
  searchResultsInNewTab: boolean;

  // ── 3. Navigation ────────────────────────────────────────────────────────
  externalLinkTarget: ExternalLinkTarget;
  showFullUrl: boolean;
  smoothScrolling: boolean;
  showLoadingIndicator: boolean;

  // ── 4. Tabs ──────────────────────────────────────────────────────────────
  openTabsNextToCurrent: boolean;
  switchToNewTab: boolean;
  showTabPreviews: boolean;
  warnClosingMultipleTabs: boolean;
  reopenClosedTabs: boolean;
  keepOpenOnLastTabClose: boolean;

  // ── 5. Home button ───────────────────────────────────────────────────────
  showHomeButton: boolean;
  homepageMode: HomepageMode;
  homepageUrl: string;

  // ── 6. Downloads ─────────────────────────────────────────────────────────
  askWhereToSave: boolean;
  downloadNotifications: boolean;
  autoOpenDownloads: boolean;
  clearCompletedDownloads: boolean;

  // ── 7. Appearance ────────────────────────────────────────────────────────
  showBookmarksBar: boolean;
  showSidebar: boolean;
  compactToolbar: boolean;
  showTabSearchButton: boolean;

  // ── 8. Language & region ─────────────────────────────────────────────────
  browserLanguage: string;
  offerTranslate: boolean;
  autoTranslate: boolean;
  neverTranslateLanguages: string[];
  region: string;
  dateFormat: DateFormat;
  timeFormat: TimeFormat;
  numberFormat: NumberFormat;

  // ── 9. Accessibility ─────────────────────────────────────────────────────
  defaultFontSize: number;
  minimumFontSize: number;
  defaultZoom: number;
  highContrast: boolean;
  reduceAnimations: boolean;
  alwaysShowFocus: boolean;
  keyboardNavigation: boolean;
  caretBrowsing: boolean;
}

export const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
  startupMode: 'new-tab',
  startupPages: [],
  launchAtLogin: false,

  searchSuggestions: true,
  searchHistorySuggestions: true,
  searchBookmarkSuggestions: true,
  searchFromAddressBar: true,
  searchResultsInNewTab: false,

  externalLinkTarget: 'tab',
  showFullUrl: false,
  smoothScrolling: true,
  showLoadingIndicator: true,

  openTabsNextToCurrent: true,
  switchToNewTab: true,
  showTabPreviews: true,
  warnClosingMultipleTabs: true,
  reopenClosedTabs: true,
  keepOpenOnLastTabClose: true,

  showHomeButton: true,
  homepageMode: 'new-tab',
  homepageUrl: '',

  askWhereToSave: false,
  downloadNotifications: true,
  autoOpenDownloads: false,
  clearCompletedDownloads: false,

  showBookmarksBar: false,
  showSidebar: true,
  compactToolbar: false,
  showTabSearchButton: true,

  browserLanguage: 'en-US',
  offerTranslate: true,
  autoTranslate: false,
  neverTranslateLanguages: [],
  region: 'system',
  dateFormat: 'system',
  timeFormat: '24h',
  numberFormat: 'system',

  defaultFontSize: 16,
  minimumFontSize: 0,
  defaultZoom: 1,
  highContrast: false,
  reduceAnimations: false,
  alwaysShowFocus: false,
  keyboardNavigation: true,
  caretBrowsing: false,
};

export const BROWSER_LANGUAGES: { id: string; label: string }[] = [
  { id: 'en-US', label: 'English' },
  { id: 'en-IN', label: 'English (India)' },
  { id: 'bn', label: 'Bengali' },
  { id: 'hi', label: 'Hindi' },
];

export const REGIONS: { id: string; label: string }[] = [
  { id: 'system', label: 'System default' },
  { id: 'US', label: 'United States' },
  { id: 'IN', label: 'India' },
  { id: 'GB', label: 'United Kingdom' },
  { id: 'BD', label: 'Bangladesh' },
  { id: 'DE', label: 'Germany' },
  { id: 'JP', label: 'Japan' },
];

export const ZOOM_LEVELS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5];

/** Font sizes Chromium accepts for a guest page, in CSS pixels. */
export const FONT_SIZE_RANGE = { min: 9, max: 32 } as const;
export const MIN_FONT_SIZE_RANGE = { min: 0, max: 24 } as const;

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * Validate a URL typed into a settings field (startup pages, homepage).
 *
 * Returns the normalised URL, or null when it cannot be understood. A bare
 * host such as "example.com" is upgraded to https rather than rejected —
 * that is what every browser does and what users expect.
 */
export function normalizeSettingsUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 2048) return null;
  if ([...trimmed].some((c) => c.charCodeAt(0) < 32)) return null;

  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    // Reject "https://" alone and hostnames with no dot and no port that are
    // clearly search text rather than an address ("hello world").
    if (!parsed.hostname || /\s/.test(parsed.hostname)) return null;
    if (!parsed.hostname.includes('.') && parsed.hostname !== 'localhost') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * The subset the main process needs. Kept explicit so a renaming in the
 * renderer cannot silently stop reaching Chromium.
 */
export interface MainGeneralSettings {
  acceptLanguages: string;
  defaultFontSize: number;
  minimumFontSize: number;
  defaultZoom: number;
  askWhereToSave: boolean;
  downloadNotifications: boolean;
  autoOpenDownloads: boolean;
  clearCompletedDownloads: boolean;
  smoothScrolling: boolean;
  externalLinkTarget: ExternalLinkTarget;
  keepOpenOnLastTabClose: boolean;
  openTabsNextToCurrent: boolean;
  switchToNewTab: boolean;
  warnClosingMultipleTabs: boolean;
  reopenClosedTabs: boolean;
  caretBrowsing: boolean;
}

/** Accept-Language header value derived from the chosen browser language. */
export function acceptLanguagesFor(language: string): string {
  const base = language.split('-')[0];
  const parts = [language];
  if (base !== language) parts.push(base);
  if (base !== 'en') parts.push('en-US', 'en');
  else if (!parts.includes('en')) parts.push('en');
  return [...new Set(parts)].join(',');
}

export function toMainSettings(settings: GeneralSettings): MainGeneralSettings {
  return {
    acceptLanguages: acceptLanguagesFor(settings.browserLanguage),
    defaultFontSize: clampNumber(
      settings.defaultFontSize,
      FONT_SIZE_RANGE.min,
      FONT_SIZE_RANGE.max
    ),
    minimumFontSize: clampNumber(
      settings.minimumFontSize,
      MIN_FONT_SIZE_RANGE.min,
      MIN_FONT_SIZE_RANGE.max
    ),
    defaultZoom: clampNumber(settings.defaultZoom, 0.25, 5),
    askWhereToSave: settings.askWhereToSave,
    downloadNotifications: settings.downloadNotifications,
    autoOpenDownloads: settings.autoOpenDownloads,
    clearCompletedDownloads: settings.clearCompletedDownloads,
    smoothScrolling: settings.smoothScrolling,
    externalLinkTarget: settings.externalLinkTarget,
    keepOpenOnLastTabClose: settings.keepOpenOnLastTabClose,
    openTabsNextToCurrent: settings.openTabsNextToCurrent,
    switchToNewTab: settings.switchToNewTab,
    warnClosingMultipleTabs: settings.warnClosingMultipleTabs,
    reopenClosedTabs: settings.reopenClosedTabs,
    caretBrowsing: settings.caretBrowsing,
  };
}

/**
 * Locale used for dates, times and numbers shown by the browser chrome.
 * `region: 'system'` means "whatever the OS says", which is the default.
 */
export function resolveLocale(settings: {
  browserLanguage: string;
  region: string;
}): string | undefined {
  if (settings.region === 'system') {
    return settings.browserLanguage || undefined;
  }
  const base = settings.browserLanguage.split('-')[0] || 'en';
  return `${base}-${settings.region}`;
}
