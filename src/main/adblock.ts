import { app, session, type WebContents } from 'electron';
import fs from 'fs';
import path from 'path';
import { AdBlockEngine, isThirdParty, parseRules } from '../adblock';
import type { ResourceType, RequestContext } from '../adblock';

let enabled = true;
let blockedCount = 0;
let engine: AdBlockEngine | null = null;
let mainWindowGetter: (() => WebContents | null) | null = null;
let listenerAttached = false;
let statsTimer: ReturnType<typeof setTimeout> | null = null;

const resourceTypeMap: Record<string, ResourceType> = {
  mainFrame: 'main_frame',
  subFrame: 'sub_frame',
  script: 'script',
  stylesheet: 'stylesheet',
  image: 'image',
  font: 'font',
  media: 'media',
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

function sourceUrlFor(details: Electron.OnBeforeRequestListenerDetails): string {
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

function isWebviewRequest(details: Electron.OnBeforeRequestListenerDetails): boolean {
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

function attachRequestListener(): void {
  if (listenerAttached) return;
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    if (!isWebviewRequest(details) || details.resourceType === 'mainFrame') {
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
  listenerAttached = true;
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
  attachRequestListener();
  emitStats();
  void loadLocalFilter();
}

export function setAdblockEnabled(value: boolean): void {
  enabled = Boolean(value);
  engine?.setEnabled(enabled);
  emitStats();
}

export function isAdblockEnabled(): boolean {
  return enabled;
}

export function getBlockedCount(): number {
  return blockedCount;
}
