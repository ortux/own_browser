/**
 * Tracking-parameter stripping for URLs.
 *
 * Removes common analytics/marketing parameters (utm_*, fbclid, gclid, …)
 * without changing anything else about the URL. Used by the opt-in
 * "clean links" navigation setting and by the "Copy clean link" action
 * (which always cleans).
 */

/** Exact parameter names that are tracking vectors. */
const TRACKING_PARAMS = new Set([
  'fbclid',          // Facebook
  'gclid',           // Google Ads
  'gclsrc',          // Google Ads (doubleclick)
  'dclid',           //DoubleClick click identifier
  'gbraid',          // Google Ads (iOS app)
  'wbraid',          // Google Ads (web-to-app)
  'msclkid',         // Microsoft Ads
  'mc_eid',          // Mailchimp campaign
  'mc_cid',          // Mailchimp campaign id
  'igshid',          // Instagram share
  'igsh',            // Instagram share (short)
  '_hsenc',          // HubSpot encode
  '_hsmi',           // HubSpot message id
  'vero_id',         // Vero
  'vero_conv',       // Vero conversion
  'ml_subscriber',   // MailerLite
  'ml_subscriber_hash',
  'ttclid',          // TikTok
  'twclid',          // Twitter/X
  'tc_click_id',     // Trendclick
  'spm',             // Alibaba
  'spm_idc',         // Alibaba
  'scm',             // Alibaba
]);

/** Parameter prefixes that are always tracking (e.g. utm_source). */
const TRACKING_PREFIXES = ['utm_'];

export function isTrackingParam(name: string): boolean {
  const lower = name.toLowerCase();
  if (TRACKING_PARAMS.has(lower)) return true;
  return TRACKING_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

/**
 * Return the URL with tracking parameters removed from its query string.
 * Never throws: unparseable input is returned unchanged.
 */
export function stripTrackingParams(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return url;

    const keys = [...parsed.searchParams.keys()];
    let removed = false;
    for (const key of keys) {
      if (isTrackingParam(key)) {
        parsed.searchParams.delete(key);
        removed = true;
      }
    }
    if (!removed) return url;

    // Drop a dangling '?' when every parameter was removed.
    const cleaned = parsed.toString();
    return cleaned.endsWith('?') ? cleaned.slice(0, -1) : cleaned;
  } catch {
    return url;
  }
}
