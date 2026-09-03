export interface SponsorSegment {
  segment: [number, number];
  actionType?: string;
  category?: string;
}

const SPONSORBLOCK_API = 'https://sponsor.ajay.app/api/skipSegments';
const CATEGORIES = [
  'sponsor',
  'intro',
  'outro',
  'selfpromo',
  'interaction',
  'preview',
  'filler',
  'music_offtopic',
];
const MAX_SEGMENTS = 200;

export function extractYouTubeVideoId(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.hostname === 'youtu.be') return url.pathname.slice(1).split('/')[0] || null;
    if (!/(^|\.)youtube\.com$/i.test(url.hostname)) return null;
    if (url.pathname === '/watch') return url.searchParams.get('v');
    const match = url.pathname.match(/^\/(?:shorts|embed|live)\/([^/?]+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

async function hashPrefix(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 4);
}

function validSegments(value: unknown): SponsorSegment[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is SponsorSegment => {
      if (!item || typeof item !== 'object' || !Array.isArray((item as SponsorSegment).segment))
        return false;
      const segment = (item as SponsorSegment).segment;
      return (
        segment.length === 2 &&
        Number.isFinite(segment[0]) &&
        Number.isFinite(segment[1]) &&
        segment[0] >= 0 &&
        segment[1] > segment[0] &&
        segment[1] - segment[0] <= 24 * 60 * 60
      );
    })
    .filter((item) => !item.actionType || item.actionType === 'skip')
    .slice(0, MAX_SEGMENTS);
}

/**
 * The privacy-preserving hash-prefix endpoint answers with an array of
 * *videos*, not segments:
 *   [{ videoID: "abc", hash: "…", segments: [ { segment: [s, e], … } ] }, …]
 *
 * Every video sharing the 4-character SHA-256 prefix comes back, which is the
 * whole point — the server never learns which one was requested. Feeding that
 * outer array straight into the segment validator matched nothing, so
 * SponsorBlock silently never skipped anything.
 */
function segmentsForVideo(payload: unknown, videoId: string): SponsorSegment[] {
  if (!Array.isArray(payload)) return [];
  const match = payload.find(
    (entry) =>
      entry && typeof entry === 'object' && (entry as { videoID?: unknown }).videoID === videoId
  );
  if (!match) return [];
  return validSegments((match as { segments?: unknown }).segments);
}

export async function fetchSponsorSegments(videoId: string): Promise<SponsorSegment[]> {
  const prefix = await hashPrefix(videoId);
  const query = new URLSearchParams({
    categories: JSON.stringify(CATEGORIES),
    actionTypes: JSON.stringify(['skip']),
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  let response: Response;
  try {
    response = await fetch(`${SPONSORBLOCK_API}/${prefix}?${query}`, {
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) return [];
  return segmentsForVideo(await response.json(), videoId);
}

function skipperScript(segments: SponsorSegment[]): string {
  return `(function (nextSegments) {
    const key = '__zyphoraSponsorBlock';
    const state = window[key] || { segments: [], lastEnd: -1 };
    state.segments = nextSegments;
    state.lastEnd = -1;
    if (!window[key]) {
      const check = () => {
        const video = document.querySelector('video');
        if (!video) return;
        const current = video.currentTime;
        const match = state.segments.find((item) => current >= item.segment[0] - 0.25 && current < item.segment[1]);
        if (match && match.segment[1] !== state.lastEnd) {
          state.lastEnd = match.segment[1];
          video.currentTime = match.segment[1];
        } else if (current < state.lastEnd - 1) {
          state.lastEnd = -1;
        }
      };
      // 'timeupdate' does not bubble, so a listener on document only fires in
      // the capture phase — and only for a <video> that already existed. Poll
      // instead: it is cheap, and it survives YouTube swapping the element out
      // during SPA navigation.
      setInterval(check, 250);
      window[key] = state;
    }
  })(${JSON.stringify(segments)});`;
}

export async function applySponsorBlock(
  webview: Electron.WebviewTag,
  pageUrl: string
): Promise<void> {
  const videoId = extractYouTubeVideoId(pageUrl);
  if (!videoId) return;
  try {
    const segments = await fetchSponsorSegments(videoId);
    await webview.executeJavaScript(skipperScript(segments), false);
  } catch {
    // SponsorBlock is optional; a failed lookup must not affect navigation.
  }
}
