/**
 * siteData.ts — per-site cookie inspection for the Site settings surface.
 *
 * Counts are computed from the default session's cookie jar. Clearing removes
 * cookies whose domain matches the host (including dot-prefixed variants that
 * Chromium uses for subdomain-wide cookies).
 */
import { session } from 'electron';

const MAX_COOKIES_SCANNED = 5_000;

function normalizeHost(host: string | undefined): string {
  return (host ?? '').trim().toLowerCase().replace(/^\./, '');
}

function matchesCookieDomain(cookieDomain: string, host: string): boolean {
  const domain = normalizeHost(cookieDomain);
  if (!domain) return false;
  return host === domain || host.endsWith(`.${domain}`);
}

export interface CookieSummary {
  host: string;
  count: number;
}

/** Cookie counts grouped by registrable-ish host (longest two labels). */
export async function getCookieSummary(): Promise<CookieSummary[]> {
  const cookies = await session.defaultSession.cookies.get({});
  const counts = new Map<string, number>();
  for (const cookie of cookies.slice(0, MAX_COOKIES_SCANNED)) {
    const domain = normalizeHost(cookie.domain);
    if (!domain) continue;
    counts.set(domain, (counts.get(domain) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([host, count]) => ({ host, count }))
    .sort((a, b) => b.count - a.count || a.host.localeCompare(b.host))
    .slice(0, 100);
}

/** Remove cookies whose domain matches the host. Returns how many were removed. */
export async function clearCookiesForHost(host: string): Promise<number> {
  const target = normalizeHost(host);
  if (!target) return 0;
  const cookies = await session.defaultSession.cookies.get({});
  let removed = 0;
  for (const cookie of cookies.slice(0, MAX_COOKIES_SCANNED)) {
    const domain = normalizeHost(cookie.domain);
    if (!domain || !matchesCookieDomain(domain, target)) continue;
    const scheme = cookie.secure ? 'https' : 'http';
    const url = `${scheme}://${domain}${cookie.path || '/'}`;
    try {
      await session.defaultSession.cookies.remove(url, cookie.name);
      removed++;
    } catch {
      // Expired or session cookies can already be gone.
    }
  }
  return removed;
}
