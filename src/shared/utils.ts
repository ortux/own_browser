/**
 * Shared utility functions used across main, preload, and renderer.
 * Eliminates duplicated implementations of common helpers.
 */

/** Check if a value is a non-null object (record). */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Extract hostname from a URL string, returning empty string on failure. */
export function hostFromUrl(value: string): string {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Quick heuristic: does this input look like a URL rather than a search query? */
export function looksLikeUrl(input: string): boolean {
  const trimmed = input.trim();
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('file://') ||
    trimmed.startsWith('about:') ||
    trimmed.startsWith('zyphora://') ||
    trimmed.startsWith('localhost')
  )
    return true;
  return trimmed.includes('.') && !trimmed.includes(' ');
}

/** Detect macOS platform. */
export function isMacPlatform(): boolean {
  if (typeof navigator !== 'undefined') {
    const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
    if (nav.userAgentData?.platform) {
      return nav.userAgentData.platform === 'macOS';
    }
    return /Mac/i.test(nav.userAgent || '');
  }
  return false;
}
