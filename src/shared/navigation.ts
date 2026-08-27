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
  if (isInternalPageUrl(trimmed)) return true;

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
    const parsed = new URL(value);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:')
      && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * Heuristic: does this address-bar input look like a destination URL rather
 * than a search query? Kept here so every input surface (address bar, new-tab
 * search, command palette) interprets input identically.
 */
export function looksLikeUrl(input: string): boolean {
  const trimmed = input.trim();
  if (
    trimmed.startsWith('http://')
    || trimmed.startsWith('https://')
    || trimmed.startsWith('file://')
    || trimmed.startsWith('about:')
    || trimmed.startsWith('zyphora://')
    || trimmed.startsWith('localhost')
  ) {
    return true;
  }
  return trimmed.includes('.') && !trimmed.includes(' ');
}

/** Schemes that should be handed to the OS instead of loaded in a tab. */
export const EXTERNAL_PROTOCOLS = new Set([
  'mailto:',
  'tel:',
  'sms:',
  'callto:',
  'news:',
  'nntp:',
  'feed:',
  'webcal:',
  'irc:',
  'ircs:',
  'magnet:',
  'xmpp:',
  'matrix:',
]);

export function isExternalProtocolUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed.includes(':')) return false;
  for (const scheme of EXTERNAL_PROTOCOLS) {
    if (trimmed.toLowerCase().startsWith(scheme)) return true;
  }
  return false;
}

/** Internal pages the shell can render without a webview. */
export const INTERNAL_PAGES = new Set([
  'zyphora://downloads',
  'zyphora://history',
  'zyphora://diagnostics',
]);

export function isInternalPageUrl(value: string): boolean {
  return INTERNAL_PAGES.has(value.trim());
}

/** Friendly title for an internal page, or null for anything else. */
export function internalPageTitle(value: string): string | null {
  switch (value.trim()) {
    case 'zyphora://downloads': return 'Downloads';
    case 'zyphora://history': return 'History';
    case 'zyphora://diagnostics': return 'Diagnostics';
    default: return null;
  }
}
