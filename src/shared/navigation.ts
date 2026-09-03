/**
 * Navigation URLs that the browser shell is willing to hand to a webview.
 *
 * A failed Electron navigation can report a `chrome-error://` URL. Treating
 * that URL as the tab's real URL causes the shell to mount the error document
 * again, which is one of the ways a failed link ends up looking like a blank
 * or black tab. Keep this allowlist in one place and never persist Chromium's
 * internal error pages as browser state.
 */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'file:']);

/**
 * Internal pages, rendered by the shell rather than loaded into a webview.
 *
 * Kept as an explicit allowlist rather than a `zyphora://` prefix test: an
 * unknown internal URL should fail to navigate, not open a blank tab that
 * looks broken.
 */
export const INTERNAL_PAGES = {
  downloads: 'zyphora://downloads',
  settings: 'zyphora://settings',
} as const;

export type InternalPageUrl = (typeof INTERNAL_PAGES)[keyof typeof INTERNAL_PAGES];

const INTERNAL_URLS: ReadonlySet<string> = new Set(Object.values(INTERNAL_PAGES));

/** Titles shown in the tab strip before any page-level title arrives. */
export const INTERNAL_PAGE_TITLES: Record<string, string> = {
  [INTERNAL_PAGES.downloads]: 'Downloads',
  [INTERNAL_PAGES.settings]: 'Settings',
};

export function isInternalPageUrl(value: string): boolean {
  return INTERNAL_URLS.has(value.trim());
}

export function isAllowedNavigationUrl(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === 'about:blank') return true;
  if (isInternalPageUrl(trimmed)) return true;

  try {
    const parsed = new URL(trimmed);
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return false;
    if (parsed.protocol === 'file:') {
      // A genuine local file URL is file:///path — the host is empty. A
      // non-empty host means a UNC/remote path such as file://evil.com/share,
      // which must not be loadable from the address bar.
      return parsed.hostname === '' || parsed.hostname === 'localhost';
    }
    return Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * Convert an address-bar value into a URL, or return null for a protocol that
 * must never be loaded in a browser tab (javascript:, data:, chrome-error:, …).
 * Search queries are intentionally handled by the renderer before this helper
 * is called, so a plain string is interpreted as a domain here.
 */
export function normalizeNavigationUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (isAllowedNavigationUrl(trimmed)) return trimmed;

  // `URL` recognizes arbitrary schemes such as javascript: and data:. Do not
  // turn those into https:// URLs or allow them through to a webview. A colon
  // followed by digits is kept as a normal host:port value (localhost:3000,
  // example.com:8443).
  if (/^[a-z][a-z\d+.-]*:(?!\d)/i.test(trimmed)) return null;

  const withHttps = `https://${trimmed}`;
  return isAllowedNavigationUrl(withHttps) ? withHttps : null;
}

export function isHttpNavigationUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') && Boolean(parsed.hostname)
    );
  } catch {
    return false;
  }
}
