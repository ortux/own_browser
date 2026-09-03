/**
 * zoom.ts — remember zoom level per site.
 *
 * Zoom was previously applied straight to the live webview and lost on the
 * next navigation, so anyone zooming because a site has small text had to redo
 * it on every page load.
 *
 * Levels are keyed by origin, reusing the same normalisation the password
 * store uses, so every page on a site shares one level.
 */

import { DebouncedWriter, readJsonFile, removeJsonFile, isRecord } from './jsonStore';
import { normalizeOrigin } from './db';

const FILENAME = 'zoom-levels.json';

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 3;
export const DEFAULT_ZOOM = 1;

/** Bound the file so a long browsing history cannot grow it without limit. */
const MAX_ENTRIES = 500;

interface ZoomEntry {
  factor: number;
  updatedAt: number;
}

let levels = new Map<string, ZoomEntry>();
let loaded = false;

const writer = new DebouncedWriter<Record<string, ZoomEntry>>(FILENAME, 1_000);

export function clampZoom(factor: number): number {
  if (!Number.isFinite(factor)) return DEFAULT_ZOOM;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, factor));
}

function load(): void {
  if (loaded) return;
  loaded = true;

  const parsed = readJsonFile(FILENAME);
  if (!isRecord(parsed)) return;

  for (const [origin, value] of Object.entries(parsed)) {
    if (!isRecord(value)) continue;
    const { factor, updatedAt } = value;
    if (typeof factor !== 'number' || !Number.isFinite(factor)) continue;
    // A stored 1.0 carries no information; treat it as absent.
    const clamped = clampZoom(factor);
    if (clamped === DEFAULT_ZOOM) continue;
    levels.set(origin, {
      factor: clamped,
      updatedAt: typeof updatedAt === 'number' ? updatedAt : 0,
    });
  }

  // persist() caps what we write, but a hand-edited or older file can still be
  // larger than the cap; trim on the way in too.
  evictOldest();
}

/** Keep only the MAX_ENTRIES most recently touched origins. */
function evictOldest(): void {
  if (levels.size <= MAX_ENTRIES) return;
  const sorted = [...levels.entries()].sort((a, b) => b[1].updatedAt - a[1].updatedAt);
  levels = new Map(sorted.slice(0, MAX_ENTRIES));
}

function persist(): void {
  // Evict the least recently touched entries rather than letting the file grow
  // for every site ever visited.
  evictOldest();
  writer.schedule(Object.fromEntries(levels));
}

/** The saved zoom for a URL's origin, or 1 when the user never set one. */
export function getZoomForUrl(url: string): number {
  load();
  const origin = normalizeOrigin(url);
  if (!origin) return DEFAULT_ZOOM;
  return levels.get(origin)?.factor ?? DEFAULT_ZOOM;
}

/**
 * Record a zoom level for a URL's origin. Setting it back to 1 removes the
 * entry, so "reset zoom" does not leave a redundant row behind.
 */
export function setZoomForUrl(url: string, factor: number): number {
  load();
  const origin = normalizeOrigin(url);
  const clamped = clampZoom(factor);
  if (!origin) return clamped;

  if (clamped === DEFAULT_ZOOM) {
    if (levels.delete(origin)) persist();
    return clamped;
  }

  levels.set(origin, { factor: clamped, updatedAt: Date.now() });
  persist();
  return clamped;
}

/** Drop every stored level (used when clearing browsing data). */
export function clearZoomLevels(): void {
  load();
  levels.clear();
  writer.cancel();
  removeJsonFile(FILENAME);
}

export function flushZoomLevels(): void {
  writer.flush();
}

/** Testing seam: forget in-memory state so a fresh file can be read. */
export function resetZoomCacheForTests(): void {
  levels = new Map();
  loaded = false;
  writer.cancel();
}
