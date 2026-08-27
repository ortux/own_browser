import { app, session, type WebContents } from 'electron';
import fs from 'fs';
import path from 'path';
import type { BlockedRequest } from '../shared/types';
import { ElectronBlocker, adsLists } from '@ghostery/adblocker-electron';
import fetch from 'cross-fetch';

let enabled = true;
let blockedCount = 0;
let blocker: ElectronBlocker | null = null;
let blockerLoading: Promise<ElectronBlocker> | null = null;
let mainWindowGetter: (() => WebContents | null) | null = null;
let statsTimer: ReturnType<typeof setTimeout> | null = null;
let forceHttps = true;
let doNotTrack = false;
let globalPrivacyControl = false;
let stripTrackingParams = false;
const allowedSites = new Set<string>();
const blockedBySite = new Map<string, number>();
const blockedRequestsBySite = new Map<string, BlockedRequest[]>();

const configuredSessions = new Set<Electron.Session>();
const blockingContexts = new WeakMap<Electron.Session, ReturnType<ElectronBlocker['enableBlockingInSession']>>();
type DntListener = (
  details: Electron.OnBeforeSendHeadersListenerDetails,
  callback: (response: Electron.BeforeSendResponse) => void
) => void;

const dntListeners = new WeakMap<Electron.Session, DntListener>();

const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const CACHE_FILENAME = 'ghostery-ads-only.bin';
const BLOCKER_CONFIG = {
  // Start with network ads only. Cosmetic filters and scriptlets can hide real
  // controls or interfere with video/auth flows, so they are intentionally off.
  loadCosmeticFilters: false,
  loadCSPFilters: false,
  enableMutationObserver: false,
  loadExtendedSelectors: false,
  guessRequestTypeFromUrl: true,
};

const YOUTUBE_HOSTS = [
  'youtube.com',
  'youtube-nocookie.com',
  'youtu.be',
  'googlevideo.com',
  'ytimg.com',
  'youtubei.googleapis.com',
];

function emitStats(): void {
  const win = mainWindowGetter?.();
  if (win && !win.isDestroyed()) {
    win.send('adblock:stats', { enabled, blocked: blockedCount });
  }
}

function emitStatsThrottled(): void {
  if (statsTimer) return;
  statsTimer = setTimeout(() => {
    statsTimer = null;
    emitStats();
  }, 500);
}

function isYouTubeHost(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase().replace(/\.$/, '');
    return YOUTUBE_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

function hostFromUrl(value: string): string {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
}

function isAllowedSiteHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, '');
  return [...allowedSites].some((site) => host === site || host.endsWith(`.${site}`));
}

function sourceHost(details: Pick<Electron.OnBeforeRequestListenerDetails, 'webContents' | 'referrer'>): string {
  try {
    return hostFromUrl(details.webContents?.getURL() ?? '') || hostFromUrl(details.referrer);
  } catch {
    return hostFromUrl(details.referrer);
  }
}

function isAllowedSiteRequest(details: Pick<Electron.OnBeforeRequestListenerDetails, 'webContents' | 'referrer'>): boolean {
  return isAllowedSiteHost(sourceHost(details));
}

function isProtectedYouTubeRequest(details: Electron.OnBeforeRequestListenerDetails): boolean {
  return isYouTubeHost(details.url)
    || isYouTubeHost(details.referrer)
    || (() => {
      try { return isYouTubeHost(details.webContents?.getURL() ?? ''); } catch { return false; }
    })();
}

function cachePath(): string {
  return path.join(app.getPath('userData'), CACHE_FILENAME);
}

async function readCachedBlocker(): Promise<ElectronBlocker | null> {
  try {
    const buffer = await fs.promises.readFile(cachePath());
    return ElectronBlocker.deserialize(new Uint8Array(buffer));
  } catch {
    return null;
  }
}

async function writeCachedBlocker(engine: ElectronBlocker): Promise<void> {
  const target = cachePath();
  const temporary = `${target}.tmp-${process.pid}`;
  try {
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    await fs.promises.writeFile(temporary, Buffer.from(engine.serialize()));
    await fs.promises.rename(temporary, target);
  } catch (error) {
    try { await fs.promises.rm(temporary, { force: true }); } catch { /* best effort */ }
    console.warn('[adblock] could not cache Ghostery engine:', error);
  }
}

async function fetchFilter(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function buildBlocker(): Promise<ElectronBlocker> {
  const cached = await readCachedBlocker();
  let cacheIsFresh = false;
  try {
    cacheIsFresh = Date.now() - (await fs.promises.stat(cachePath())).mtimeMs < CACHE_MAX_AGE;
  } catch { /* no cache */ }

  if (cached && cacheIsFresh) return cached;

  try {
    // Use Ghostery's maintained EasyList/uBlock-compatible ad subscriptions.
    // This avoids the incomplete hand-written filter parser and its false
    // positives around normal site URLs.
    const fresh = await ElectronBlocker.fromLists(
      fetchFilter,
      adsLists,
      BLOCKER_CONFIG,
    );
    await writeCachedBlocker(fresh);
    return fresh;
  } catch (error) {
    console.warn('[adblock] Ghostery list update failed:', error);
    if (cached) {
      console.warn('[adblock] using stale Ghostery cache');
      return cached;
    }
    // Fail open if both the network and cache are unavailable. The browser
    // must remain usable even when filter services are offline.
    return ElectronBlocker.empty(BLOCKER_CONFIG);
  }
}

function installYouTubeException(engine: ElectronBlocker): void {
  const original = engine.onBeforeRequest.bind(engine);
  engine.onBeforeRequest = (details, callback) => {
    if (isProtectedYouTubeRequest(details) || isAllowedSiteRequest(details)) {
      callback({});
      return;
    }
    original(details, callback);
  };
}

function installDntListener(ses: Electron.Session): void {
  if (dntListeners.has(ses)) return;
  const listener: DntListener = (details, callback) => {
    if (details.webContents?.getType() === 'webview') {
      // Classic Do Not Track signal (honoured rarely, costs nothing).
      if (doNotTrack) details.requestHeaders.DNT = '1';
      // Global Privacy Control — the legally recognised successor signal.
      if (globalPrivacyControl) details.requestHeaders['Sec-GPC'] = '1';
    }
    callback({ requestHeaders: details.requestHeaders });
  };
  dntListeners.set(ses, listener);
  ses.webRequest.onBeforeSendHeaders(listener);
}

function enableBlockingForSession(ses: Electron.Session): void {
  if (!blocker || blockingContexts.has(ses)) return;
  blockingContexts.set(ses, blocker.enableBlockingInSession(ses));
}

function disableBlockingForSession(ses: Electron.Session): void {
  if (!blocker || !blockingContexts.has(ses)) return;
  try { blocker.disableBlockingInSession(ses); } catch { /* already disabled */ }
  blockingContexts.delete(ses);
}

/** Attach Ghostery network filtering and DNT policy to one Electron session. */
export function attachAdblockToSession(ses: Electron.Session): void {
  if (configuredSessions.has(ses)) return;
  configuredSessions.add(ses);
  installDntListener(ses);
  if (enabled) enableBlockingForSession(ses);
}

export function detachAdblockFromSession(ses: Electron.Session): void {
  disableBlockingForSession(ses);
  configuredSessions.delete(ses);
  // This removes only our listener in the current session architecture. The
  // Ghostery context uses different webRequest events.
  const listener = dntListeners.get(ses);
  if (listener) {
    ses.webRequest.onBeforeSendHeaders(null);
    dntListeners.delete(ses);
  }
}

export function initAdblock(getMainWindow: () => WebContents | null): void {
  mainWindowGetter = getMainWindow;
  attachAdblockToSession(session.defaultSession);
  blockerLoading = buildBlocker();
  void blockerLoading.then((engine) => {
    blocker = engine;
    installYouTubeException(engine);
    engine.on('request-blocked', (request) => {
      blockedCount++;
      const details = request._originalRequestDetails as Electron.OnBeforeRequestListenerDetails | undefined;
      const site = details?.webContents?.getURL()
          ? (() => { try { return new URL(details.webContents.getURL()).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; } })()
        : details?.referrer
          ? (() => { try { return new URL(details.referrer).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; } })()
          : '';
      if (site) {
        blockedBySite.set(site, (blockedBySite.get(site) ?? 0) + 1);
        const requests = blockedRequestsBySite.get(site) ?? [];
        requests.unshift({ url: request.url, type: String(request.type), timestamp: Date.now() });
        requests.splice(50);
        blockedRequestsBySite.set(site, requests);
      }
      emitStatsThrottled();
    });
    for (const ses of configuredSessions) {
      if (enabled) enableBlockingForSession(ses);
    }
    emitStats();
  }).catch((error) => {
    console.error('[adblock] unexpected Ghostery initialization failure:', error);
  });
}

export function setAdblockEnabled(value: boolean): void {
  enabled = Boolean(value);
  for (const ses of configuredSessions) {
    if (enabled) enableBlockingForSession(ses);
    else disableBlockingForSession(ses);
  }
  emitStats();
}

export function setNetworkSecuritySettings(settings: {
  forceHttps: boolean;
  doNotTrack: boolean;
  globalPrivacyControl?: boolean;
  stripTrackingParams?: boolean;
}): void {
  forceHttps = Boolean(settings.forceHttps);
  doNotTrack = Boolean(settings.doNotTrack);
  globalPrivacyControl = Boolean(settings.globalPrivacyControl);
  stripTrackingParams = Boolean(settings.stripTrackingParams);
}

export function isForceHttpsEnabled(): boolean {
  return forceHttps;
}

export function isStripTrackingParamsEnabled(): boolean {
  return stripTrackingParams;
}

export interface AdblockDiagnostics {
  enabled: boolean;
  blockedThisSession: number;
  cacheExists: boolean;
  cacheAgeDays: number | null;
  allowlistSize: number;
}

export function getAdblockDiagnostics(): AdblockDiagnostics {
  let cacheExists = false;
  let cacheAgeDays: number | null = null;
  try {
    const stat = fs.statSync(cachePath());
    cacheExists = true;
    cacheAgeDays = Math.floor((Date.now() - stat.mtimeMs) / 86_400_000);
  } catch { /* no cache yet */ }
  return {
    enabled,
    blockedThisSession: blockedCount,
    cacheExists,
    cacheAgeDays,
    allowlistSize: allowedSites.size,
  };
}

export function isAdblockEnabled(): boolean {
  return enabled;
}

export function getBlockedCount(): number {
  return blockedCount;
}

export function resetBlockedStats(): void {
  blockedCount = 0;
  blockedBySite.clear();
  blockedRequestsBySite.clear();
  emitStats();
}

export function setAllowedSites(sites: string[]): void {
  allowedSites.clear();
  for (const site of sites) {
    const normalized = site.trim().toLowerCase().replace(/^www\./, '');
    if (/^[a-z\d.-]+$/.test(normalized) && normalized.length <= 253) {
      allowedSites.add(normalized);
    }
  }
}

export function isSiteAllowed(site: string): boolean {
  return isAllowedSiteHost(hostFromUrl(site) || site);
}

export function getSiteBlockedCount(site: string): number {
  const key = (hostFromUrl(site) || site.toLowerCase()).replace(/^www\./, '');
  return blockedBySite.get(key) ?? 0;
}

export function getSiteBlockedRequests(site: string): BlockedRequest[] {
  const key = (hostFromUrl(site) || site.toLowerCase()).replace(/^www\./, '');
  return (blockedRequestsBySite.get(key) ?? []).map((request) => ({ ...request }));
}
