import type { PexelsImage } from '../../shared/types';

/**
 * Background image cache for the New Tab page.
 *
 * The key idea behind "instant, non-progressive" loading:
 *   - We keep a POOL of fully *preloaded* images (HTMLImageElement in memory).
 *   - When a new tab opens we hand it an image that is already decoded, so it
 *     paints in one shot instead of streaming in line-by-line.
 *   - In the background we keep refilling the pool by fetching fresh images
 *     from the main process, so the next new tab is instant too.
 */

export type BackgroundCategory = 'random' | 'nature' | 'technology' | 'space' | 'arts';

const POOL_SIZE = 6;

const pool: PexelsImage[] = [];
const preloaded = new Map<string, HTMLImageElement>();
let lastShownUrl: string | null = null;
let warming = false;

function categoryForApi(category: BackgroundCategory): string | undefined {
  return category === 'random' ? undefined : category;
}

/** Decode an image fully before resolving, so it never paints progressively. */
function preload(img: PexelsImage): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const existing = preloaded.get(img.url);
    if (existing && existing.complete && existing.naturalWidth > 0) {
      resolve(existing);
      return;
    }
    const el = new Image();
    el.decoding = 'async';
    el.onload = () => {
      preloaded.set(img.url, el);
      resolve(el);
    };
    el.onerror = () => reject(new Error('image load failed'));
    el.src = img.url;
  });
}

async function fetchFresh(category: BackgroundCategory): Promise<PexelsImage | null> {
  try {
    const img = await window.browserAPI.pexelsImage(categoryForApi(category));
    if (!img || !img.url) return null;
    await preload(img);
    return img;
  } catch {
    return null;
  }
}

/** Top the pool back up to POOL_SIZE in the background. */
async function topUp(category: BackgroundCategory) {
  if (pool.length >= POOL_SIZE) return;
  const img = await fetchFresh(category);
  if (img) pool.push(img);
}

/** Pre-fetch a batch of images so the very first new tab is also instant. */
export async function warmCache(category: BackgroundCategory = 'random', count = POOL_SIZE) {
  if (warming) return;
  warming = true;
  try {
    while (pool.length < count) {
      const img = await fetchFresh(category);
      if (!img) break;
      pool.push(img);
    }
  } finally {
    warming = false;
  }
}

/**
 * Take an image from the pool to display on a new tab. Returns a fully
 * preloaded image (or null if the pool is empty / offline), and refills the
 * pool in the background. Excludes the most recently shown image so two
 * consecutive tabs never repeat.
 */
export function takeImage(category: BackgroundCategory = 'random'): PexelsImage | null {
  if (pool.length === 0) return null;

  let idx = pool.findIndex((p) => p.url !== lastShownUrl);
  if (idx === -1) idx = 0;

  const img = pool[idx];
  pool.splice(idx, 1);
  lastShownUrl = img.url;

  void topUp(category);
  return img;
}

/** Fetch a brand-new image on demand (e.g. a "shuffle" action). */
export async function fetchNew(
  category: BackgroundCategory = 'random'
): Promise<PexelsImage | null> {
  const img = await fetchFresh(category);
  if (img) {
    lastShownUrl = img.url;
    void topUp(category);
  }
  return img;
}
