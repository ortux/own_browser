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

export function isAllowedNavigationUrl(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === 'about:blank') return true;
  if (trimmed === 'zyphora://downloads') return true;

  try {
    const parsed = new URL(trimmed);
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return false;
    return parsed.protocol === 'file:' || Boolean(parsed.hostname);
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
    const protocol = new URL(value).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}
