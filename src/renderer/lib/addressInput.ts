/**
 * Single resolver for address-bar / search-box input.
 *
 * Every input surface (address bar, new-tab search, command palette) funnels
 * through here so "g cats" or "example.com" is interpreted identically.
 */
import { looksLikeUrl, normalizeNavigationUrl } from '../../shared/navigation';

export interface EngineLike {
  id: string;
  name: string;
  url: string; // contains %s
  shortcut: string;
}

export interface ResolvedAddress {
  url: string;
  /** Set when the input resolved to a search query. */
  engineName?: string;
  /** Set when an explicit "<shortcut> query" keyword was used. */
  usedKeyword?: string;
}

function engineHomeUrl(engine: EngineLike): string {
  // Drop the query placeholder to land on the engine's home page.
  return engine.url.replace(/%s/gi, '');
}

/**
 * Resolve raw user input into a navigation URL.
 *
 * Supported forms:
 *   "example.com"            → https://example.com
 *   "https://example.com/x"  → unchanged
 *   "zyphora://downloads"    → internal page
 *   "how do magnets work"    → search with the default engine
 *   "g how do magnets work"  → search with the engine whose shortcut is "g"
 */
export function resolveAddressInput(
  input: string,
  engines: EngineLike[],
  defaultEngineId: string,
  buildSearchUrlWith: (engine: EngineLike, query: string) => string,
): ResolvedAddress {
  const trimmed = input.trim();
  if (!trimmed) return { url: '' };

  // 1. Explicit engine keyword: "<shortcut> <query>" or a bare "<shortcut>"
  //    (longest matching shortcut wins). A bare keyword opens the engine home.
  const firstSpace = trimmed.search(/\s/);
  const token = (firstSpace > 0 ? trimmed.slice(0, firstSpace) : trimmed).toLowerCase();
  const rest = firstSpace > 0 ? trimmed.slice(firstSpace).trim() : '';
  if (token) {
    const candidates = engines.filter((e) => e.shortcut && e.shortcut.toLowerCase() === token);
    if (candidates.length > 0) {
      const engine = candidates.sort((a, b) => b.shortcut.length - a.shortcut.length)[0];
      const url = rest
        ? buildSearchUrlWith(engine, rest)
        : engineHomeUrl(engine);
      return { url, engineName: engine.name, usedKeyword: token };
    }
  }

  // 2. URL-like input.
  if (looksLikeUrl(trimmed)) {
    const normalized = normalizeNavigationUrl(trimmed);
    if (normalized) return { url: normalized };
    // Known-but-disallowed scheme or malformed URL: treat the whole input as
    // a search query so the user still gets a useful destination.
  }

  // 3. Search query with the default (or currently selected) engine.
  const engine = engines.find((e) => e.id === defaultEngineId) ?? engines[0];
  if (!engine) return { url: buildSearchUrlWith({ id: 'fallback', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s', shortcut: '' }, trimmed) };
  return { url: buildSearchUrlWith(engine, trimmed), engineName: engine.name };
}
