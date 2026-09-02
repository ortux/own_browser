/**
 * trackingParams.ts — strip campaign and click-ID parameters from URLs.
 *
 * The network blocker stops tracker *requests*, but analytics parameters ride
 * along inside the URL itself. Left alone they end up in history, in copied
 * links, and in synced bookmarks — so a "privacy-focused" browser hands them
 * straight back out again.
 *
 * Shared between main and renderer so the address bar and the navigation path
 * agree on what a cleaned URL looks like.
 */

/** Exact parameter names to remove. */
const EXACT: ReadonlySet<string> = new Set([
  // Google Analytics / Urchin
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'utm_name',
  'utm_cid',
  'utm_reader',
  'utm_source_platform',
  'utm_creative_format',
  'utm_marketing_tactic',
  // Click identifiers
  'gclid',
  'gclsrc',
  'dclid',
  'wbraid',
  'gbraid',
  'fbclid',
  'msclkid',
  'twclid',
  'ttclid',
  'igshid',
  'igsh',
  'yclid',
  'rdt_cid',
  'li_fat_id',
  'epik',
  'irclickid',
  // Mail / campaign platforms
  'mc_cid',
  'mc_eid',
  'mkt_tok',
  'vero_conv',
  'vero_id',
  '_hsenc',
  '_hsmi',
  'hsctatracking',
  'oly_anon_id',
  'oly_enc_id',
  'ml_subscriber',
  'ml_subscriber_hash',
  // Marketplaces / social
  'spm',
  'scm',
  'ref_src',
  'ref_url',
  '_openstat',
  'action_object_map',
  'action_type_map',
  'action_ref_map',
]);

/** Prefixes covering families of generated parameters. */
const PREFIXES: readonly string[] = ['utm_', 'pk_', 'piwik_', 'matomo_', 'hsa_', 'ns_'];

/**
 * Hosts where stripping would break the page. Some sites carry state in
 * parameters that look like tracking but are load-bearing.
 */
const SKIP_HOSTS: ReadonlySet<string> = new Set([
  // `si` on a share link is tracking, but YouTube also uses short params for
  // playback state; leaving YouTube alone avoids breaking timestamped links.
  'youtube.com',
  'www.youtube.com',
  'youtu.be',
  'music.youtube.com',
]);

function hostMatches(hostname: string, entry: string): boolean {
  return hostname === entry || hostname.endsWith(`.${entry}`);
}

export function isTrackingParam(name: string): boolean {
  const lower = name.toLowerCase();
  if (EXACT.has(lower)) return true;
  return PREFIXES.some((prefix) => lower.startsWith(prefix));
}

/**
 * Remove tracking parameters from a URL.
 *
 * Returns the URL unchanged when there is nothing to strip, when it is not
 * http(s), or when it cannot be parsed — callers can compare by identity to
 * detect whether anything happened.
 */
export function stripTrackingParams(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return url;
  if ([...SKIP_HOSTS].some((entry) => hostMatches(parsed.hostname, entry))) return url;
  if (!parsed.search) return url;

  const keys = [...parsed.searchParams.keys()];
  const doomed = keys.filter(isTrackingParam);
  if (!doomed.length) return url;

  // Removing every parameter should drop the '?' too, rather than leaving a
  // trailing question mark on the URL.
  for (const key of doomed) parsed.searchParams.delete(key);
  const remaining = [...parsed.searchParams.keys()].length;
  if (remaining === 0) parsed.search = '';

  return parsed.toString();
}
