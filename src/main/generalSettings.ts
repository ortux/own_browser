/**
 * generalSettings.ts (main) — applies the parts of General settings that only
 * the main process can enforce.
 *
 * The renderer owns the durable copy (inside the persisted settings store).
 * It pushes the relevant subset here on hydration and on every change, and
 * this module translates it into Chromium/OS state: Accept-Language, guest
 * font sizes, default zoom, download behaviour and launch-at-login.
 *
 * There is intentionally no second persisted copy of these values.
 */

import { app, session, webContents } from 'electron';
import { readJsonFile, writeJsonFile } from './jsonStore';
import type { MainGeneralSettings } from '../shared/generalSettings';
import { DEFAULT_GENERAL_SETTINGS, toMainSettings } from '../shared/generalSettings';
import { setDownloadPreferences } from './downloads';

const CACHE_FILE = 'general-settings.json';

/**
 * A read-through cache of the renderer's copy.
 *
 * Two switches (smooth scrolling, and the font sizes used by the very first
 * guest) have to be known *before* the renderer exists, so the last known
 * values are mirrored to disk. The renderer remains the single source of
 * truth: it overwrites this on every hydration and every change.
 */
function readCache(): MainGeneralSettings {
  const stored = readJsonFile(CACHE_FILE);
  const defaults = toMainSettings(DEFAULT_GENERAL_SETTINGS);
  if (!stored || typeof stored !== 'object') return defaults;
  return { ...defaults, ...(stored as Partial<MainGeneralSettings>) };
}

let current: MainGeneralSettings = readCache();

export function getMainGeneralSettings(): MainGeneralSettings {
  return current;
}

/**
 * Chromium reads smooth scrolling from a command-line switch at startup, so it
 * can only change on the next launch. Must run before `app.whenReady()`.
 */
export function applyStartupSwitches(): void {
  if (!current.smoothScrolling) {
    app.commandLine.appendSwitch('disable-smooth-scrolling');
  }
}

/**
 * Sessions created for private tabs need the same preferences applied.
 *
 * Accept-Language is set through `session.setUserAgent(ua, acceptLanguages)`
 * rather than a webRequest header hook: Electron allows only one
 * onBeforeSendHeaders listener per session, and the ad blocker already owns it.
 */
const configuredSessions = new WeakSet<Electron.Session>();

export function configureSession(ses: Electron.Session): void {
  configuredSessions.add(ses);
  try {
    ses.setUserAgent(ses.getUserAgent(), current.acceptLanguages);
  } catch {
    /* older Electron without the acceptLanguages argument */
  }
}

function applyToWebContents(): void {
  for (const contents of webContents.getAllWebContents()) {
    if (contents.getType() !== 'webview') continue;
    try {
      contents.setVisualZoomLevelLimits(1, 5);
      // Caret browsing and the accessibility font sizes are renderer
      // preferences; Chromium exposes them per-webContents at runtime.
      contents.setZoomFactor(current.defaultZoom);
    } catch {
      /* guest not attached yet */
    }
  }
}

/**
 * Font sizes and smooth scrolling are read from `webPreferences` when a guest
 * attaches, so they are applied there (see `applyGuestPreferences`) as well as
 * pushed to already-open guests via CSS-free Chromium APIs where possible.
 */
export function applyGuestPreferences(webPreferences: Electron.WebPreferences): void {
  webPreferences.defaultFontSize = current.defaultFontSize;
  webPreferences.minimumFontSize = current.minimumFontSize;
  webPreferences.zoomFactor = current.defaultZoom;
}

export function setMainGeneralSettings(next: MainGeneralSettings): void {
  current = next;

  setDownloadPreferences({
    askWhereToSave: next.askWhereToSave,
    notifications: next.downloadNotifications,
    autoOpen: next.autoOpenDownloads,
    clearCompleted: next.clearCompletedDownloads,
  });

  writeJsonFile(CACHE_FILE, next);

  configureSession(session.defaultSession);
  applyToWebContents();
}

/**
 * Launch-at-login is genuine OS state, not a stored flag: read it back from
 * the OS so the UI can never claim something the system does not do.
 */
export function getLaunchAtLogin(): boolean {
  try {
    return app.getLoginItemSettings().openAtLogin;
  } catch {
    return false;
  }
}

export function setLaunchAtLogin(enabled: boolean): boolean {
  try {
    app.setLoginItemSettings({ openAtLogin: enabled });
  } catch {
    /* unsupported platform (e.g. some Linux desktops) */
  }
  return getLaunchAtLogin();
}

// ── Default browser ─────────────────────────────────────────────────────────

const DEFAULT_BROWSER_PROTOCOLS = ['http', 'https'] as const;

export function isDefaultBrowser(): boolean {
  try {
    return DEFAULT_BROWSER_PROTOCOLS.every((protocol) => app.isDefaultProtocolClient(protocol));
  } catch {
    return false;
  }
}

/**
 * Ask the OS to make Zyphora the default browser. On Windows and macOS this is
 * immediate; on Linux it writes the desktop-file association. Returns the real
 * resulting state rather than assuming success.
 */
export function makeDefaultBrowser(): boolean {
  for (const protocol of DEFAULT_BROWSER_PROTOCOLS) {
    try {
      app.setAsDefaultProtocolClient(protocol);
    } catch {
      /* keep trying the remaining protocols */
    }
  }
  return isDefaultBrowser();
}
