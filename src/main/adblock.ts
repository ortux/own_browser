/**
 * Inbuilt ad & tracker blocker — Ghostery engine.
 *
 * This is a full replacement for the previous hand-rolled domain/regex
 * blocker, which used overly broad host lists and path patterns that broke
 * real websites (blocked consent managers, SDKs sites await, and any URL
 * containing words like "banner" or "creative").
 *
 * We now delegate matching to @ghostery/adblocker-electron — the
 * production-grade engine that powers the Ghostery browser extension. It is
 * uBlock Origin-/EasyList-compatible, so blocking decisions come from
 * community-maintained filter lists (EasyList, EasyPrivacy, uBlock filters)
 * instead of our own guesses. That means dramatically fewer false positives,
 * plus proper cosmetic filtering (element hiding) and scriptlet injection.
 *
 * How it works here:
 *  - The engine is built once from the prebuilt "ads + tracking" lists and
 *    cached (serialized) on disk under userData so later launches start fast
 *    and work offline. Stale caches are refreshed from the CDN in the
 *    background with the old cache as fallback (never fail hard).
 *  - Blocking is attached to the default session only: every <webview> tab
 *    uses it, and enabling extra sessions would re-register global IPC
 *    handlers and crash. Webviews without a partition share this session.
 *  - The toggle is driven by the renderer's `security.blockTrackers` setting
 *    via the `adblock:set` IPC channel.
 */

import { app, session, type WebContents } from 'electron';
import path from 'path';
import fs from 'fs';
import { ElectronBlocker } from '@ghostery/adblocker-electron';

let enabled = true;
let blockedCount = 0;
let blocker: ElectronBlocker | null = null;
let mainWindowGetter: (() => WebContents | null) | null = null;
let statsTimer: ReturnType<typeof setTimeout> | null = null;

// Filters older than this are re-fetched from the CDN on next launch.
const LIST_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function cacheDir(): string {
  return path.join(app.getPath('userData'), 'adblocker');
}

function cachePath(): string {
  return path.join(cacheDir(), 'filters.bin');
}

/** Disk cache used by the engine: hit → deserialize, miss → fetch + persist. */
const caching = {
  path: '', // filled in during init (needs app to be ready)
  read: async (p: string): Promise<Uint8Array> =>
    new Uint8Array(await fs.promises.readFile(p)),
  write: async (p: string, buffer: Uint8Array): Promise<void> => {
    await fs.promises.mkdir(path.dirname(p), { recursive: true });
    await fs.promises.writeFile(p, Buffer.from(buffer));
  },
};

function emitStats(): void {
  if (!mainWindowGetter) return;
  const win = mainWindowGetter();
  if (win && !win.isDestroyed()) {
    win.send('adblock:stats', { enabled, blocked: blockedCount });
  }
}

/** Push stats to the renderer, at most once per ~500 ms. */
function emitStatsThrottled(): void {
  if (statsTimer) return;
  statsTimer = setTimeout(() => {
    statsTimer = null;
    emitStats();
  }, 500);
}

/** Attach blocking to a session — exactly once (enabling twice throws). */
function attachBlocker(engine: ElectronBlocker): void {
  const ses = session.defaultSession;
  if (enabled && !engine.isBlockingEnabled(ses)) {
    engine.enableBlockingInSession(ses);
  }
}

function detachBlocker(engine: ElectronBlocker): void {
  const ses = session.defaultSession;
  // disableBlockingInSession() throws if it wasn't enabled first.
  if (engine.isBlockingEnabled(ses)) {
    engine.disableBlockingInSession(ses);
  }
}

/**
 * Move a stale cache aside so the engine re-fetches fresh lists. The backup is
 * restored by the caller if the network fetch fails, so an offline laptop
 * never ends up with no ad blocker at all.
 */
function prepareListRefresh(): string | null {
  try {
    const file = cachePath();
    const stat = fs.statSync(file);
    if (Date.now() - stat.mtimeMs < LIST_MAX_AGE_MS) return null;
    const backup = `${file}.bak`;
    fs.renameSync(file, backup);
    return backup;
  } catch {
    return null; // no cache yet, or unreadable — fetching will create it
  }
}

function restoreCacheBackup(backup: string | null): void {
  if (!backup) return;
  try {
    // A partial/empty new cache is worse than the old one; overwrite it.
    if (fs.existsSync(cachePath())) fs.rmSync(cachePath());
    fs.renameSync(backup, cachePath());
  } catch {
    /* leave whatever is on disk */
  }
}

/** Drop the backup kept for a refresh once new lists fetched successfully. */
function discardCacheBackup(backup: string | null): void {
  if (!backup) return;
  try {
    fs.rmSync(backup);
  } catch {
    /* already gone */
  }
}

async function createEngine(): Promise<ElectronBlocker> {
  caching.path = cachePath();
  const engine = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch, caching);

  engine.on('request-blocked', () => {
    blockedCount++;
    emitStatsThrottled();
  });
  // uBO-style redirects swap ad resources for harmless local stubs — those
  // are blocked ads too, so count them.
  engine.on('request-redirected', () => {
    blockedCount++;
    emitStatsThrottled();
  });

  return engine;
}

export function initAdblock(getMainWindow: () => WebContents | null): void {
  mainWindowGetter = getMainWindow;
  emitStats();

  // Build the engine asynchronously — app startup must not wait on the CDN.
  void (async () => {
    const backup = prepareListRefresh();
    try {
      blocker = await createEngine();
      discardCacheBackup(backup);
    } catch (err) {
      // Offline on first run: restore the stale cache and try once more.
      restoreCacheBackup(backup);
      try {
        blocker = await createEngine();
      } catch (err2) {
        // Fail open: the browser must keep working, just unfiltered.
        console.warn('[adblock] filter engine unavailable, running unfiltered:', err2 ?? err);
        blocker = null;
        return;
      }
    }
    attachBlocker(blocker);
    emitStats();
  })();
}

export function setAdblockEnabled(value: boolean): void {
  enabled = Boolean(value);
  if (blocker) {
    if (enabled) attachBlocker(blocker);
    else detachBlocker(blocker);
  }
  emitStats();
}

export function isAdblockEnabled(): boolean {
  return enabled;
}

export function getBlockedCount(): number {
  return blockedCount;
}
