import { app, session, type WebContents } from 'electron';
import fs from 'fs';
import path from 'path';
import { AdBlockEngine, isThirdParty, parseRules } from '../adblock';
import type { ResourceType, RequestContext } from '../adblock';

let enabled = true;
let blockedCount = 0;
let engine: AdBlockEngine | null = null;
let mainWindowGetter: (() => WebContents | null) | null = null;
let statsTimer: ReturnType<typeof setTimeout> | null = null;
let forceHttps = true;
let doNotTrack = false;

const attachedSessions = new WeakSet<Electron.Session>();

type WebRequestDetails = {
  webContents?: WebContents;
  referrer: string;
  url: string;
};

const resourceTypeMap: Record<string, ResourceType> = {
  mainFrame: 'main_frame',
  subFrame: 'sub_frame',
  script: 'script',
  stylesheet: 'stylesheet',
  image: 'image',
  font: 'font',
  media: 'media',
  webSocket: 'websocket',
  websocket: 'websocket',
  xhr: 'xhr',
  fetch: 'fetch',
};

function filterPath(): string {
  return path.join(app.getAppPath(), 'filter.txt');
}

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

function domainFromUrl(value: string): string {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function sourceUrlFor(details: WebRequestDetails): string {
  try {
    return details.webContents?.getURL() || details.referrer || details.url;
  } catch {
    // A request can finish while its guest webContents is being destroyed.
    return details.referrer || details.url;
  }
}

function requestContext(details: Electron.OnBeforeRequestListenerDetails): RequestContext {
  const sourceUrl = sourceUrlFor(details);
  const sourceDomain = domainFromUrl(sourceUrl);
  const destinationDomain = domainFromUrl(details.url);
  const resourceType = resourceTypeMap[details.resourceType] ?? 'other';
  return {
    url: details.url,
    sourceUrl,
    sourceDomain,
    destinationDomain,
    resourceType,
    method: details.method,
    isThirdParty: sourceDomain !== '' && destinationDomain !== ''
      ? isThirdParty(sourceDomain, destinationDomain)
      : false,
    isMainFrame: resourceType === 'main_frame',
  };
}

function isWebviewRequest(details: WebRequestDetails): boolean {
  try {
    // The application shell also uses the default session. Filtering it would
    // allow a filter list to cancel the shell's own JS/CSS and make the whole
    // window appear black. If Electron does not provide webContents for a
    // request, fail open rather than guessing that it belongs to a webview.
    return details.webContents?.getType() === 'webview';
  } catch {
    return false;
  }
}

function upgradeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:') return null;
    url.protocol = 'https:';
    return url.toString();
  } catch {
    return null;
  }
}

/** Attach filtering and network privacy policy to one Electron session. */
export function attachAdblockToSession(ses: Electron.Session): void {
  if (attachedSessions.has(ses)) return;
  attachedSessions.add(ses);

  ses.webRequest.onBeforeRequest((details, callback) => {
    if (!isWebviewRequest(details)) {
      callback({ cancel: false });
      return;
    }

    // Keep the top-level navigation alive. A DNS/list match should never turn
    // an address-bar click into a blank tab. Force HTTPS is an explicit
    // redirect, not an ad-block decision.
    if (forceHttps) {
      const upgraded = upgradeHttpUrl(details.url);
      if (upgraded) {
        callback({ redirectURL: upgraded });
        return;
      }
    }
    if (details.resourceType === 'mainFrame') {
      callback({ cancel: false });
      return;
    }

    const result = engine?.checkRequest(requestContext(details));
    if (enabled && result?.action === 'BLOCK') {
      blockedCount++;
      emitStatsThrottled();
      callback({ cancel: true });
      return;
    }
    callback({ cancel: false });
  });

  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    if (doNotTrack && isWebviewRequest(details)) {
      details.requestHeaders.DNT = '1';
    }
    callback({ requestHeaders: details.requestHeaders });
  });
}

async function loadLocalFilter(): Promise<void> {
  try {
    const text = await fs.promises.readFile(filterPath(), 'utf8');
    const localEngine = new AdBlockEngine();
    localEngine.addRules(parseRules(text));
    localEngine.setEnabled(enabled);
    engine = localEngine;
    emitStats();
  } catch (error) {
    console.warn('[adblock] local filter list unavailable, running unfiltered:', error);
  }
}

export function initAdblock(getMainWindow: () => WebContents | null): void {
  mainWindowGetter = getMainWindow;
  attachAdblockToSession(session.defaultSession);
  emitStats();
  void loadLocalFilter();
}

export function setAdblockEnabled(value: boolean): void {
  enabled = Boolean(value);
  engine?.setEnabled(enabled);
  emitStats();
}

export function setNetworkSecuritySettings(settings: {
  forceHttps: boolean;
  doNotTrack: boolean;
}): void {
  forceHttps = Boolean(settings.forceHttps);
  doNotTrack = Boolean(settings.doNotTrack);
}

export function isAdblockEnabled(): boolean {
  return enabled;
}

export function getBlockedCount(): number {
  return blockedCount;
}
