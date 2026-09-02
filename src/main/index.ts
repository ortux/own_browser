import { sortPinnedFirst, reorderTabs as reorderTabList, setPinned } from '../shared/tabOrder';
import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  clipboard,
  globalShortcut,
  session,
  shell,
  webContents,
} from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Tab, BrowserState, RendererToMainMessage } from '../shared/types';
import {
  isAllowedNavigationUrl,
  isHttpNavigationUrl,
  normalizeNavigationUrl,
} from '../shared/navigation';
import { registerPexelsHandlers } from './pexels';
import { getZoomForUrl, setZoomForUrl, clearZoomLevels, flushZoomLevels } from './zoom';
import { loadWindowState, trackWindowState, flushWindowState } from './windowState';
import {
  scheduleSessionSave,
  flushSessionSave,
  loadSession,
  clearSession,
  type PersistedTab,
} from './session';
import {
  fetchProxy,
  applyProxy,
  clearProxy,
  verifyProxy,
  initProxyAutoApply,
  forgetProxySession,
} from './proxy';
import type { ProxyInfo } from '../renderer/stores/settingsStore';
import {
  addHistory,
  getHistory,
  searchHistory,
  deleteHistoryEntry,
  clearHistory,
  pruneHistory,
  addBookmark,
  removeBookmark,
  isBookmarked,
  getBookmarks,
  searchBookmarks,
  updateHistoryMetadata,
  savePassword,
  hasPassword,
  normalizeOrigin,
  getPasswordsForOrigin,
  getAllPasswords,
  getPasswordById,
  searchPasswords,
  deletePassword,
  clearPasswords,
  closeDb,
  initDb,
} from './db';
import {
  initAdblock,
  setAdblockEnabled,
  isAdblockEnabled,
  getBlockedCount,
  resetBlockedStats,
  setAllowedSites,
  isSiteAllowed,
  getSiteBlockedCount,
  getSiteBlockedRequests,
  setNetworkSecuritySettings,
  isForceHttpsEnabled,
  attachAdblockToSession,
  detachAdblockFromSession,
} from './adblock';
import { initCertificateMonitor, getCertInfo } from './certificate';
import {
  configureSessionPermissions,
  clearPermissionDecisions,
  handlePermissionResponse,
} from './permissions';
import { configureAdGuardDns } from './dns';
import {
  initDownloads,
  attachDownloadsToSession,
  setMainWindow,
  getDownloads,
  setDownloadPath,
  cancelDownload,
  retryDownload,
  removeDownload,
  clearDownloads,
  openDownload,
  showDownload,
  pickFolder,
  revealFolder,
  getDownloadPath,
} from './downloads';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Linux GPU/driver combinations can render the embedded webview as a solid
// black surface even though the guest page loaded successfully. The browser
// still works with software compositing, so prefer that stable path on Linux.
// Developers can opt back in while diagnosing a specific GPU with
// ZYPHORA_ENABLE_HARDWARE_ACCELERATION=1.
if (process.platform === 'linux' && process.env.ZYPHORA_ENABLE_HARDWARE_ACCELERATION !== '1') {
  app.disableHardwareAcceleration();
}

configureAdGuardDns();

/**
 * Keep the app's own browser context intact. We do not attempt to spoof a
 * different browser family or launch an external browser to satisfy OAuth.
 */

function canOpenInTab(value: string): boolean {
  return isHttpNavigationUrl(value);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Runtime validation is still required even though the renderer is typed. */
function isRendererMessage(value: unknown): value is RendererToMainMessage {
  if (!isRecord(value) || typeof value.type !== 'string') return false;

  switch (value.type) {
    case 'create-tab':
      return value.privateMode === undefined || typeof value.privateMode === 'boolean';
    case 'get-state':
    case 'get-closed-tabs':
      return true;
    case 'restore-closed-tab':
      return (
        value.index === undefined ||
        (typeof value.index === 'number' &&
          Number.isSafeInteger(value.index) &&
          value.index >= 0 &&
          value.index < 20)
      );
    case 'navigate':
      return isBoundedString(value.tabId, 200) && isBoundedString(value.url, 8_192);
    case 'create-tab-url':
      return (
        isBoundedString(value.url, 8_192) &&
        (value.privateMode === undefined || typeof value.privateMode === 'boolean')
      );
    case 'close-tab':
    case 'activate-tab':
    case 'duplicate-tab':
    case 'go-back':
    case 'go-forward':
    case 'reload':
    case 'stop':
      return isBoundedString(value.tabId, 200);
    case 'webview-title-updated':
      return isBoundedString(value.tabId, 200) && isBoundedString(value.title, 1_000);
    case 'webview-favicon-updated':
      return isBoundedString(value.tabId, 200) && isBoundedString(value.favicon, 8_192);
    case 'webview-loading':
      return isBoundedString(value.tabId, 200) && typeof value.loading === 'boolean';
    case 'webview-nav-state':
      return (
        isBoundedString(value.tabId, 200) &&
        isBoundedString(value.url, 8_192) &&
        typeof value.canGoBack === 'boolean' &&
        typeof value.canGoForward === 'boolean'
      );
    case 'set-tab-muted':
      return isBoundedString(value.tabId, 200) && typeof value.muted === 'boolean';
    case 'set-tab-pinned':
      return isBoundedString(value.tabId, 200) && typeof value.pinned === 'boolean';
    case 'reorder-tabs':
      return isBoundedString(value.draggedTabId, 200) && isBoundedString(value.targetTabId, 200);
    case 'webview-attached':
      return (
        isBoundedString(value.tabId, 200) &&
        typeof value.webContentsId === 'number' &&
        Number.isSafeInteger(value.webContentsId) &&
        value.webContentsId > 0
      );
    case 'security-settings':
      return typeof value.forceHttps === 'boolean' && typeof value.doNotTrack === 'boolean';
    case 'session-restore-setting':
      return typeof value.enabled === 'boolean';
    case 'history-retention':
      return (
        typeof value.days === 'number' &&
        Number.isInteger(value.days) &&
        value.days >= 0 &&
        value.days <= 3_650
      );
    case 'zoom-get':
      return isBoundedString(value.url, 8_192);
    case 'zoom-set':
      return (
        isBoundedString(value.url, 8_192) &&
        typeof value.factor === 'number' &&
        Number.isFinite(value.factor)
      );
    case 'set-tab-private':
      return isBoundedString(value.tabId, 200) && typeof value.privateMode === 'boolean';
    case 'permission-response':
      return isBoundedString(value.requestId, 200) && typeof value.allow === 'boolean';
    case 'webview-credentials':
      return (
        isBoundedString(value.tabId, 200) &&
        isBoundedString(value.origin, 2_048) &&
        isBoundedString(value.username, 512) &&
        value.username.length > 0 &&
        isBoundedString(value.password, 8_192) &&
        value.password.length > 0 &&
        isBoundedString(value.title, 1_000) &&
        (value.favicon === undefined || isBoundedString(value.favicon, 8_192))
      );
    case 'autofill-credentials':
      return (
        isBoundedString(value.tabId, 200) &&
        isBoundedString(value.username, 512) &&
        isBoundedString(value.password, 8_192)
      );
    default:
      return false;
  }
}

function isTrustedMainFrame(event: {
  sender: Electron.WebContents;
  senderFrame: Electron.WebFrameMain | null;
}): boolean {
  return event.sender === mainWindow?.webContents && event.senderFrame === event.sender.mainFrame;
}

function assertTrustedMainFrame(event: {
  sender: Electron.WebContents;
  senderFrame: Electron.WebFrameMain | null;
}): void {
  if (!isTrustedMainFrame(event)) throw new Error('Unauthorized IPC sender.');
}

function isBoundedString(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.length <= maximum && !value.includes('\0');
}

function isProxyInfo(value: unknown): value is ProxyInfo {
  if (!isRecord(value)) return false;
  return (
    isBoundedString(value.ip, 253) &&
    value.ip.length > 0 &&
    /^[a-z\d.:[\]-]+$/i.test(value.ip) &&
    isBoundedString(value.port, 5) &&
    /^\d+$/.test(value.port) &&
    isBoundedString(value.ipPort, 259) &&
    isBoundedString(value.country, 32) &&
    isBoundedString(value.type, 16) &&
    isBoundedString(value.proxyLevel, 32) &&
    typeof value.supportsHttps === 'boolean' &&
    typeof value.speed === 'number' &&
    Number.isFinite(value.speed) &&
    typeof value.fetchedAt === 'number' &&
    Number.isFinite(value.fetchedAt) &&
    value.ipPort === `${value.ip}:${value.port}`
  );
}

// Store for browser state
let mainWindow: BrowserWindow | null = null;
const tabs: Map<string, Tab> = new Map();
const closedTabs: Tab[] = [];
const managedSessions = new Set<Electron.Session>();
const tabByWebContentsId = new Map<number, string>();

/** The live guest webContents backing a tab, or null if it has not attached. */
function guestContentsForTab(tabId: string): Electron.WebContents | null {
  for (const [contentsId, id] of tabByWebContentsId) {
    if (id !== tabId) continue;
    const wc = webContents.fromId(contentsId);
    return wc && !wc.isDestroyed() ? wc : null;
  }
  return null;
}
let activeTabId: string = '';
let nextTabId = 1;

/**
 * SECURITY: Default Electron security configuration
 * - nodeIntegration: false (prevent Node.js in renderer)
 * - contextIsolation: true (separate context for preload and renderer)
 * - sandbox: true (sandbox each renderer process)
 * - preload: explicit preload script with limited IPC
 */
function createWindow() {
  const savedWindow = loadWindowState();
  mainWindow = new BrowserWindow({
    width: savedWindow.width,
    height: savedWindow.height,
    x: savedWindow.x,
    y: savedWindow.y,
    minWidth: 600,
    minHeight: 400,
    autoHideMenuBar: true,
    frame: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: true,
      preload: path.join(__dirname, '../preload/index.js'),
    },
    icon: path.join(__dirname, '../../public/icon.png'),
  });
  if (savedWindow.maximised) mainWindow.maximize();
  trackWindowState(mainWindow);
  setMainWindow(mainWindow);

  const isDev = process.env.NODE_ENV === 'development';
  const rendererUrl = process.env.ELECTRON_RENDERER_URL ?? (isDev ? 'http://localhost:5173' : '');

  if (rendererUrl) {
    void mainWindow.loadURL(rendererUrl).catch((error: unknown) => {
      console.error('[renderer] failed to load dev server:', error);
    });
  } else {
    void mainWindow
      .loadFile(path.join(__dirname, '../renderer/index.html'))
      .catch((error: unknown) => {
        console.error('[renderer] failed to load bundled UI:', error);
      });
  }

  // A shell renderer crash otherwise presents as an entirely black window with
  // no explanation. Keep the event visible in the main-process log; guest
  // webview crashes are handled by WebView.tsx and show a retry surface.
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[renderer] process exited:', details.reason, details.exitCode);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Restore the previous tab strip when the user asked for it, otherwise open
  // a single blank tab. `restoreSessionEnabled` is still false at this point —
  // the renderer pushes the setting down once it has hydrated — so the saved
  // file is consulted directly rather than through that flag.
  if (!restoreOpenTabs()) {
    createNewTab();
  }
}

/**
 * Rebuild last session's tabs. Returns false when there was nothing to
 * restore, leaving the caller to open the usual blank tab.
 */
function restoreOpenTabs(): boolean {
  const saved = loadSession();
  if (!saved) return false;

  const restoredIds: string[] = [];
  for (const entry of saved.tabs) {
    const tabId = createNewTab(entry.url);
    if (!tabId) continue;
    const tab = tabs.get(tabId);
    if (!tab) continue;
    // Show the remembered title and icon immediately. Without this the whole
    // strip reads "Loading..." until each page responds.
    tab.title = entry.title || tab.title;
    tab.favicon = entry.favicon;
    tab.pinned = entry.pinned;
    restoredIds.push(tabId);
  }

  if (!restoredIds.length) return false;

  // A session saved before pinning existed, or edited by hand, may interleave
  // pinned and unpinned tabs. Normalise before showing the strip.
  applyTabOrder(sortPinnedFirst([...tabs.values()]));

  activeTabId = restoredIds[Math.min(saved.activeIndex, restoredIds.length - 1)];
  updateRendererState();
  return true;
}

function createNewTab(rawUrl?: string, privateMode = false): string {
  const url = rawUrl ? normalizeNavigationUrl(rawUrl) : null;
  if (rawUrl && !url) {
    console.warn('[navigation] refused unsupported new-tab URL:', rawUrl);
    return '';
  }

  const tabId = `tab-${nextTabId++}`;
  // Give internal pages a friendly title up-front so the tab strip reads well.
  const isInternal = !!url && url.startsWith('zyphora://');
  const title =
    !url || url === 'about:blank'
      ? 'New Tab'
      : isInternal
        ? url === 'zyphora://downloads'
          ? 'Downloads'
          : 'Zyphora'
        : 'Loading...';
  const tab: Tab = {
    id: tabId,
    url: url || 'about:blank',
    title,
    loading: false,
    canGoBack: false,
    canGoForward: false,
    privateMode,
    muted: false,
    audible: false,
    pinned: false,
  };

  tabs.set(tabId, tab);
  activeTabId = tabId;
  updateRendererState();

  return tabId;
}

function routePopupToTab(popup: BrowserWindow, privateMode: boolean): void {
  const tabId = createNewTab(undefined, privateMode);
  if (!tabId) {
    popup.close();
    return;
  }

  const routeNavigation = (_event: Electron.Event, navigationUrl: string) => {
    if (navigationUrl === 'about:blank' || !isAllowedNavigationUrl(navigationUrl)) return;
    const tab = tabs.get(tabId);
    if (!tab) {
      popup.close();
      return;
    }
    tab.url = navigationUrl;
    tab.title = 'Loading...';
    tab.loading = true;
    updateRendererState();
    popup.close();
  };

  popup.webContents.on('did-navigate', routeNavigation);
  popup.webContents.on('did-navigate-in-page', routeNavigation);
  popup.on('closed', () => {
    popup.webContents.removeListener('did-navigate', routeNavigation);
    popup.webContents.removeListener('did-navigate-in-page', routeNavigation);
  });
}

function closeTab(tabId: string) {
  const tab = tabs.get(tabId);
  if (tab && !tab.privateMode) {
    closedTabs.unshift({ ...tab });
    closedTabs.splice(20);
  }
  tabs.delete(tabId);

  if (tabs.size === 0) {
    // No tabs left — close the browser window
    if (mainWindow) {
      mainWindow.close();
    }
    return;
  }

  if (activeTabId === tabId) {
    const remainingTabs = Array.from(tabs.keys());
    activeTabId = remainingTabs[0];
  }

  updateRendererState();
}

function restoreClosedTab(index = 0): string {
  const snapshot = closedTabs.splice(index, 1)[0];
  if (!snapshot) return '';
  return createNewTab(snapshot.url, false);
}

function getClosedTabs(): Tab[] {
  return closedTabs.map((tab) => ({ ...tab }));
}

/**
 * Rewrite the tab Map to match `ordered`. The Map's insertion order *is* the
 * tab strip order, and it is what getState() and session capture both read.
 */
function applyTabOrder(ordered: Tab[]): void {
  if (ordered.length !== tabs.size) return;
  tabs.clear();
  for (const tab of ordered) tabs.set(tab.id, tab);
}

function getState(): BrowserState {
  return {
    tabs: Array.from(tabs.values()),
    activeTabId,
  };
}

function updateRendererState() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('state-updated', getState());
  }
  captureSession();
}

// ── Session persistence ──────────────────────────────────────────────────────

/**
 * Whether the open tabs should survive a restart. Owned by the renderer's
 * settings store and pushed down on startup; defaults to off so a user who
 * never opts in leaves nothing on disk.
 */
let restoreSessionEnabled = false;

/** Days of history to keep; 0 means keep forever. Pushed from the renderer. */
let historyRetentionDays = 0;

/** Tabs worth writing to disk: real pages, never private ones or blank tabs. */
function persistableTabs(): { tabs: PersistedTab[]; activeIndex: number } {
  const ordered = [...tabs.values()].filter(
    (tab) => !tab.privateMode && tab.url && tab.url !== 'about:blank'
  );
  const activeIndex = ordered.findIndex((tab) => tab.id === activeTabId);
  return {
    tabs: ordered.map((tab) => ({
      url: tab.url,
      title: tab.title,
      favicon: tab.favicon,
      pinned: tab.pinned,
    })),
    activeIndex: activeIndex >= 0 ? activeIndex : 0,
  };
}

function captureSession() {
  if (!restoreSessionEnabled) return;
  const { tabs: persisted, activeIndex } = persistableTabs();
  scheduleSessionSave(persisted, activeIndex);
}

function setRestoreSessionEnabled(enabled: boolean) {
  if (restoreSessionEnabled === enabled) return;
  restoreSessionEnabled = enabled;
  if (enabled) {
    captureSession();
  } else {
    // Turning the setting off must also remove what was already stored,
    // otherwise a stale strip of tabs waits on disk indefinitely.
    clearSession();
  }
}

/**
 * SECURITY: Validate and handle IPC messages from renderer
 * Only allow explicitly whitelisted message types.
 */
ipcMain.handle('browser:message', async (event, message: RendererToMainMessage) => {
  // SECURITY: Verify both the payload and its origin. TypeScript types do not
  // survive IPC, and a webview/child frame must never control the tab model.
  if (!isRendererMessage(message)) {
    return { success: false, error: 'invalid-message' };
  }
  if (!isTrustedMainFrame(event)) {
    return { success: false, error: 'unauthorized-sender' };
  }

  switch (message.type) {
    case 'navigate': {
      const url = normalizeNavigationUrl(message.url);
      if (!url) return { success: false, error: 'unsupported-url' };
      const tab = tabs.get(message.tabId);
      if (tab) {
        tab.url = url;
        if (tab.url === 'about:blank') {
          tab.title = 'New Tab';
          tab.loading = false;
          tab.favicon = undefined;
          tab.canGoBack = false;
          tab.canGoForward = false;
        } else {
          tab.title = 'Loading...';
          tab.loading = true;
          tab.favicon = undefined;
        }
        updateRendererState();
      }
      break;
    }
    case 'create-tab':
      createNewTab(undefined, message.privateMode ?? false);
      break;
    case 'create-tab-url':
      createNewTab(message.url, message.privateMode ?? false);
      break;
    case 'close-tab':
      closeTab(message.tabId);
      break;
    case 'activate-tab':
      if (tabs.has(message.tabId)) {
        activeTabId = message.tabId;
        updateRendererState();
      }
      break;
    case 'duplicate-tab': {
      const tab = tabs.get(message.tabId);
      if (tab) {
        createNewTab(tab.url, tab.privateMode);
      }
      break;
    }
    case 'restore-closed-tab':
      restoreClosedTab(message.index ?? 0);
      break;
    case 'get-closed-tabs':
      return getClosedTabs();
    case 'webview-attached': {
      const tab = tabs.get(message.tabId);
      if (tab) {
        tabByWebContentsId.set(message.webContentsId, message.tabId);
        // A muted tab that reloads (or is restored from a session) comes back
        // with a fresh webContents, which defaults to unmuted. Re-apply.
        if (tab.muted) {
          const wc = webContents.fromId(message.webContentsId);
          if (wc && !wc.isDestroyed()) wc.setAudioMuted(true);
        }
      }
      break;
    }
    case 'set-tab-pinned': {
      const tab = tabs.get(message.tabId);
      if (!tab || tab.pinned === message.pinned) break;
      applyTabOrder(setPinned([...tabs.values()], message.tabId, message.pinned));
      updateRendererState();
      break;
    }
    case 'reorder-tabs': {
      const next = reorderTabList([...tabs.values()], message.draggedTabId, message.targetTabId);
      applyTabOrder(next);
      updateRendererState();
      break;
    }
    case 'set-tab-muted': {
      const tab = tabs.get(message.tabId);
      if (!tab) break;
      tab.muted = message.muted;
      const wc = guestContentsForTab(message.tabId);
      // The tab may have no live guest yet; the flag is still recorded and
      // applied on the next attach.
      if (wc) wc.setAudioMuted(message.muted);
      updateRendererState();
      break;
    }
    case 'security-settings':
      setNetworkSecuritySettings({
        forceHttps: message.forceHttps,
        doNotTrack: message.doNotTrack,
      });
      break;
    case 'session-restore-setting':
      setRestoreSessionEnabled(message.enabled);
      break;
    case 'history-retention': {
      historyRetentionDays = message.days;
      const removed = pruneHistory(historyRetentionDays);
      if (removed > 0) console.log(`[history] pruned ${removed} entries`);
      return { removed };
    }
    case 'zoom-get':
      return { factor: getZoomForUrl(message.url) };
    case 'zoom-set':
      return { factor: setZoomForUrl(message.url, message.factor) };
    case 'set-tab-private': {
      const tab = tabs.get(message.tabId);
      if (tab && tab.url === 'about:blank' && !tab.privateMode) {
        tab.privateMode = message.privateMode;
        updateRendererState();
      }
      break;
    }
    case 'permission-response': {
      if (typeof message.requestId === 'string' && typeof message.allow === 'boolean') {
        handlePermissionResponse(message.requestId, message.allow);
      }
      break;
    }
    case 'webview-credentials': {
      // Never capture credentials typed in a private tab.
      const sourceTab = tabs.get(message.tabId);
      if (sourceTab?.privateMode) break;
      // Nothing to ask about when this exact pair is already stored.
      try {
        if (hasPassword(message.origin, message.username, message.password)) break;
      } catch (error) {
        console.error('[passwords] lookup failed:', error);
      }
      mainWindow?.webContents.send('save-password-prompt', {
        origin: normalizeOrigin(message.origin),
        username: message.username,
        password: message.password,
        title: message.title ?? '',
        favicon: message.favicon ?? sourceTab?.favicon,
      });
      break;
    }
    case 'autofill-credentials': {
      const wc = guestContentsForTab(message.tabId);
      if (!wc) return { ok: false, reason: 'tab-not-ready' };

      const u = JSON.stringify(message.username);
      const p = JSON.stringify(message.password);
      // React and other frameworks track input state internally, so setting
      // `.value` alone is silently reverted. Use the native value setter and
      // fire the events a real keystroke would produce.
      const filled = await wc
        .executeJavaScript(
          `
          (function() {
            function setValue(el, value) {
              var proto = Object.getPrototypeOf(el);
              var desc = Object.getOwnPropertyDescriptor(proto, 'value');
              if (desc && desc.set) { desc.set.call(el, value); } else { el.value = value; }
              el.dispatchEvent(new Event('input',  { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
            }
            function visible(el) {
              if (el.disabled || el.readOnly) return false;
              var r = el.getBoundingClientRect();
              return r.width > 0 && r.height > 0;
            }
            var pwds = Array.prototype.filter.call(
              document.querySelectorAll('input[type="password"]'), visible);
            if (!pwds.length) return false;
            var pwd = pwds[0];
            var form = pwd.form || document;
            var candidates = Array.prototype.filter.call(
              form.querySelectorAll('input[type="text"],input[type="email"],input[type="tel"],input:not([type])'),
              visible);
            // The username field is the last text input before the password box.
            var user = null;
            for (var i = 0; i < candidates.length; i++) {
              if (candidates[i].compareDocumentPosition(pwd) & Node.DOCUMENT_POSITION_FOLLOWING) {
                user = candidates[i];
              }
            }
            if (!user && candidates.length) user = candidates[0];
            if (user) setValue(user, ${u});
            setValue(pwd, ${p});
            pwd.focus();
            return true;
          })();
        `
        )
        .catch(() => false);
      return { ok: Boolean(filled) };
    }
    case 'get-state':
      return getState();
    case 'go-back': {
      const tab = tabs.get(message.tabId);
      if (tab) {
        tab.title = 'Loading...';
        updateRendererState();
      }
      break;
    }
    case 'go-forward': {
      const tab = tabs.get(message.tabId);
      if (tab) {
        tab.title = 'Loading...';
        updateRendererState();
      }
      break;
    }
    case 'reload': {
      const tab = tabs.get(message.tabId);
      if (tab) {
        tab.loading = true;
        updateRendererState();
      }
      break;
    }
    case 'stop': {
      const tab = tabs.get(message.tabId);
      if (tab) {
        tab.loading = false;
        updateRendererState();
      }
      break;
    }
    case 'webview-title-updated': {
      const tab = tabs.get(message.tabId);
      if (tab) {
        tab.title = message.title || tab.title;
        if (!tab.privateMode) updateHistoryMetadata(tab.url, tab.title, tab.favicon);
        updateRendererState();
      }
      break;
    }
    case 'webview-favicon-updated': {
      const tab = tabs.get(message.tabId);
      if (tab) {
        tab.favicon = message.favicon;
        if (!tab.privateMode) updateHistoryMetadata(tab.url, tab.title, tab.favicon);
        updateRendererState();
      }
      break;
    }
    case 'webview-loading': {
      const tab = tabs.get(message.tabId);
      if (tab) {
        tab.loading = message.loading;
        updateRendererState();
      }
      break;
    }
    case 'webview-nav-state': {
      const tab = tabs.get(message.tabId);
      if (tab) {
        // Chromium reports chrome-error://chromewebdata/ after DNS, TLS, or
        // connection failures. Never copy that internal URL into our tab
        // model; doing so makes the next render try to load the error page
        // itself and can leave a black/empty webview.
        if (!isAllowedNavigationUrl(message.url)) {
          tab.loading = false;
          tab.canGoBack = message.canGoBack;
          tab.canGoForward = message.canGoForward;
          updateRendererState();
          break;
        }

        const urlChanged = tab.url !== message.url;
        tab.url = message.url;
        tab.canGoBack = message.canGoBack;
        tab.canGoForward = message.canGoForward;
        tab.loading = false;
        // Only record a history entry when navigating to a new page.
        if (urlChanged && message.url !== 'about:blank' && !tab.privateMode) {
          addHistory(message.url, tab.title, tab.favicon);
        }
        updateRendererState();
      }
      break;
    }
  }

  return { success: true };
});

app.on('ready', async () => {
  initProxyAutoApply(); // must be before createWindow so session-created fires
  initCertificateMonitor();
  managedSessions.add(session.defaultSession);
  initAdblock(() => mainWindow?.webContents ?? null);
  configureSessionPermissions(session.defaultSession, () => mainWindow);
  initDownloads(); // session will-download handler — before any webview exists
  try {
    await initDb();
  } catch (error) {
    // The UI can still browse if local persistence is unavailable. Individual
    // database IPC calls will reject and the renderer displays empty state
    // instead of losing the entire browser window at startup.
    console.error('[db] initialization failed; continuing without persistence:', error);
  }
  registerPexelsHandlers(isTrustedMainFrame);
  registerDbHandlers();
  registerPrivacyHandlers();
  registerProxyHandlers();
  registerAdblockHandlers();
  registerCertHandlers();
  registerShellHandlers();
  registerDownloadHandlers();
  createWindow();

  // Global shortcut — opens the Downloads page as a new tab (zyphora://downloads).
  // Registered at the OS level so it fires even when a webview has keyboard focus.
  globalShortcut.register('CommandOrControl+J', () => {
    createNewTab('zyphora://downloads');
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  flushWindowState();
  flushZoomLevels();
  // Write synchronously before the process goes away; the debounced timer
  // would otherwise be discarded along with the event loop.
  if (restoreSessionEnabled) {
    const { tabs: persisted, activeIndex } = persistableTabs();
    flushSessionSave(persisted, activeIndex);
  }
  closeDb();
});

// ── Password-capture preload path ────────────────────────────────────────────

/** Absolute path of the guest preload that captures logins inside webviews. */
const capturePreloadPath = path.join(__dirname, '../preload/passwordCapture.js');

// Answered synchronously so the renderer has the path before the first
// <webview> mounts. Only the trusted shell frame may ask.
ipcMain.on('passwords:capture-preload-path', (event) => {
  event.returnValue = isTrustedMainFrame(event) ? capturePreloadPath : '';
});

// ── DB IPC handlers ──────────────────────────────────────────────────────────

function registerDbHandlers() {
  ipcMain.handle('db:history:get', (event) => {
    assertTrustedMainFrame(event);
    return getHistory();
  });
  ipcMain.handle('db:history:search', (event, query: unknown) => {
    assertTrustedMainFrame(event);
    if (!isBoundedString(query, 500)) throw new Error('Invalid history query.');
    return searchHistory(query);
  });
  ipcMain.handle('db:history:delete', (event, id: unknown) => {
    assertTrustedMainFrame(event);
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1) {
      throw new Error('Invalid history ID.');
    }
    return deleteHistoryEntry(id);
  });
  ipcMain.handle('db:history:clear', (event) => {
    assertTrustedMainFrame(event);
    return clearHistory();
  });

  ipcMain.handle('db:bookmarks:get', (event) => {
    assertTrustedMainFrame(event);
    return getBookmarks();
  });
  ipcMain.handle('db:bookmarks:search', (event, query: unknown) => {
    assertTrustedMainFrame(event);
    if (!isBoundedString(query, 500)) throw new Error('Invalid bookmark query.');
    return searchBookmarks(query);
  });
  ipcMain.handle('db:bookmarks:add', (event, url: unknown, title: unknown, favicon?: unknown) => {
    assertTrustedMainFrame(event);
    if (
      !isBoundedString(url, 8_192) ||
      !isAllowedNavigationUrl(url) ||
      url.startsWith('zyphora://')
    ) {
      throw new Error('Invalid bookmark URL.');
    }
    if (!isBoundedString(title, 1_000)) throw new Error('Invalid bookmark title.');
    if (favicon !== undefined && !isBoundedString(favicon, 8_192)) {
      throw new Error('Invalid bookmark favicon.');
    }
    return addBookmark(url, title, favicon as string | undefined);
  });
  ipcMain.handle('db:bookmarks:remove', (event, url: unknown) => {
    assertTrustedMainFrame(event);
    if (!isBoundedString(url, 8_192)) throw new Error('Invalid bookmark URL.');
    return removeBookmark(url);
  });
  ipcMain.handle('db:bookmarks:is', (event, url: unknown) => {
    assertTrustedMainFrame(event);
    if (!isBoundedString(url, 8_192)) throw new Error('Invalid bookmark URL.');
    return isBookmarked(url);
  });

  // ── Passwords ──────────────────────────────────────────────────────────────

  ipcMain.handle('db:passwords:get-all', (event) => {
    assertTrustedMainFrame(event);
    return getAllPasswords();
  });
  ipcMain.handle('db:passwords:get-for-origin', (event, origin: unknown) => {
    assertTrustedMainFrame(event);
    if (!isBoundedString(origin, 2_048)) throw new Error('Invalid origin.');
    return getPasswordsForOrigin(origin);
  });
  ipcMain.handle('db:passwords:get-by-id', (event, id: unknown) => {
    assertTrustedMainFrame(event);
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1)
      throw new Error('Invalid password ID.');
    return getPasswordById(id);
  });
  ipcMain.handle(
    'db:passwords:save',
    (
      event,
      origin: unknown,
      username: unknown,
      password: unknown,
      title: unknown,
      favicon?: unknown
    ) => {
      assertTrustedMainFrame(event);
      if (!isBoundedString(origin, 2_048)) throw new Error('Invalid origin.');
      if (!isBoundedString(username, 512)) throw new Error('Invalid username.');
      if (!isBoundedString(password, 8_192)) throw new Error('Invalid password.');
      if (!isBoundedString(title, 1_000)) throw new Error('Invalid title.');
      if (favicon !== undefined && !isBoundedString(favicon, 8_192))
        throw new Error('Invalid favicon.');
      return savePassword(
        origin,
        username,
        password,
        title as string,
        favicon as string | undefined
      );
    }
  );
  ipcMain.handle('db:passwords:delete', (event, id: unknown) => {
    assertTrustedMainFrame(event);
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1)
      throw new Error('Invalid password ID.');
    return deletePassword(id);
  });
  ipcMain.handle('db:passwords:clear', (event) => {
    assertTrustedMainFrame(event);
    return clearPasswords();
  });
  ipcMain.handle('db:passwords:search', (event, query: unknown) => {
    assertTrustedMainFrame(event);
    if (!isBoundedString(query, 500)) throw new Error('Invalid password search query.');
    return searchPasswords(query);
  });
}

// ── Proxy IPC handlers ───────────────────────────────────────────────────────

function registerPrivacyHandlers() {
  ipcMain.handle('privacy:clear-data', async (event) => {
    assertTrustedMainFrame(event);
    clearHistory();
    resetBlockedStats();
    clearPermissionDecisions();
    clearZoomLevels();
    for (const ses of managedSessions) {
      await ses.clearStorageData({
        storages: [
          'cookies',
          'filesystem',
          'indexdb',
          'localstorage',
          'shadercache',
          'serviceworkers',
          'cachestorage',
        ],
      });
      await ses.clearCache();
    }
  });
}

function registerProxyHandlers() {
  // fetchProxy is synchronous — no async needed
  ipcMain.handle('proxy:fetch', (event) => {
    assertTrustedMainFrame(event);
    return fetchProxy();
  });
  ipcMain.handle('proxy:apply', async (event, proxy: unknown) => {
    assertTrustedMainFrame(event);
    if (!isProxyInfo(proxy)) throw new Error('Invalid proxy configuration.');
    return applyProxy(proxy);
  });
  ipcMain.handle('proxy:clear', async (event) => {
    assertTrustedMainFrame(event);
    return clearProxy();
  });
  ipcMain.handle('proxy:verify', async (event, proxy: unknown) => {
    assertTrustedMainFrame(event);
    if (!isProxyInfo(proxy)) throw new Error('Invalid proxy configuration.');
    return verifyProxy(proxy);
  });
}

// ── Ad blocker IPC handlers ──────────────────────────────────────────────────

function registerAdblockHandlers() {
  ipcMain.handle('adblock:set', (event, value: unknown) => {
    assertTrustedMainFrame(event);
    if (typeof value !== 'boolean') throw new Error('Invalid ad-blocker setting.');
    setAdblockEnabled(value);
    return isAdblockEnabled();
  });
  ipcMain.handle('adblock:get', (event) => {
    assertTrustedMainFrame(event);
    return isAdblockEnabled();
  });
  ipcMain.handle('adblock:stats', (event) => {
    assertTrustedMainFrame(event);
    return { enabled: isAdblockEnabled(), blocked: getBlockedCount() };
  });
  ipcMain.handle('adblock:set-allowlist', (event, sites: unknown) => {
    assertTrustedMainFrame(event);
    if (
      !Array.isArray(sites) ||
      sites.length > 500 ||
      !sites.every((site) => isBoundedString(site, 253))
    ) {
      throw new Error('Invalid ad-blocker allowlist.');
    }
    setAllowedSites(sites);
  });
  ipcMain.handle('adblock:site-status', (event, site: unknown) => {
    assertTrustedMainFrame(event);
    if (!isBoundedString(site, 253)) throw new Error('Invalid site hostname.');
    return { allowed: isSiteAllowed(site), blocked: getSiteBlockedCount(site) };
  });
  ipcMain.handle('adblock:site-details', (event, site: unknown) => {
    assertTrustedMainFrame(event);
    if (!isBoundedString(site, 253)) throw new Error('Invalid site hostname.');
    return getSiteBlockedRequests(site);
  });
}

// ── Certificate IPC handlers ─────────────────────────────────────────────────

function registerCertHandlers() {
  ipcMain.handle('cert:get', (event, hostname: unknown) => {
    assertTrustedMainFrame(event);
    if (!isBoundedString(hostname, 253) || !/^[a-z\d.-]+$/i.test(hostname)) {
      throw new Error('Invalid certificate hostname.');
    }
    return getCertInfo(hostname);
  });
}

// ── Shell IPC handlers ────────────────────────────────────────────────────────

function registerShellHandlers() {
  ipcMain.handle('shell:open-external', async (event, url: unknown) => {
    assertTrustedMainFrame(event);
    if (!isBoundedString(url, 4_096)) throw new Error('Invalid URL.');
    try {
      new URL(url as string);
    } catch {
      throw new Error('Invalid URL format.');
    }
    return shell.openExternal(url as string);
  });
}

// ── Downloads IPC handlers ────────────────────────────────────────────────────

function registerDownloadHandlers() {
  function assertDownloadId(id: unknown): asserts id is string {
    if (!isBoundedString(id, 200) || !id) throw new Error('Invalid download ID.');
  }

  ipcMain.handle('download:list', (event) => {
    assertTrustedMainFrame(event);
    return getDownloads();
  });
  ipcMain.handle('download:set-path', (event, p: unknown) => {
    assertTrustedMainFrame(event);
    if (!isBoundedString(p, 4_096)) throw new Error('Invalid download path.');
    return setDownloadPath(p);
  });
  ipcMain.handle('download:default-path', (event) => {
    assertTrustedMainFrame(event);
    return getDownloadPath();
  });
  ipcMain.handle('download:pick-folder', async (event) => {
    assertTrustedMainFrame(event);
    return pickFolder();
  });
  ipcMain.handle('download:cancel', (event, id: unknown) => {
    assertTrustedMainFrame(event);
    assertDownloadId(id);
    return cancelDownload(id);
  });
  ipcMain.handle('download:retry', (event, id: unknown) => {
    assertTrustedMainFrame(event);
    assertDownloadId(id);
    return retryDownload(id);
  });
  ipcMain.handle('download:remove', (event, id: unknown) => {
    assertTrustedMainFrame(event);
    assertDownloadId(id);
    return removeDownload(id);
  });
  ipcMain.handle('download:clear', (event) => {
    assertTrustedMainFrame(event);
    return clearDownloads();
  });
  ipcMain.handle('download:open', (event, id: unknown) => {
    assertTrustedMainFrame(event);
    assertDownloadId(id);
    return openDownload(id);
  });
  ipcMain.handle('download:show', (event, id: unknown) => {
    assertTrustedMainFrame(event);
    assertDownloadId(id);
    return showDownload(id);
  });
  ipcMain.handle('download:reveal-folder', (event) => {
    assertTrustedMainFrame(event);
    return revealFolder();
  });
}

// Window control IPC (used by custom title bar buttons)
ipcMain.on('window:minimize', (event) => {
  if (isTrustedMainFrame(event)) mainWindow?.minimize();
});
ipcMain.on('window:maximize', (event) => {
  if (!isTrustedMainFrame(event)) return;
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window:close', (event) => {
  if (isTrustedMainFrame(event)) mainWindow?.close();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// SECURITY: Prevent dangerous protocols in the main renderer window only.
// Webview tags manage their own navigation separately.
app.on('web-contents-created', (_event, contents) => {
  const contentsType = contents.getType();

  // Keep the app in its own browser context; do not spoof a different browser
  // family or rely on an external browser for the OAuth flow.

  // Restrict the application shell. OAuth provider redirects must be permitted
  // during the auth flow while still blocking arbitrary external sites.
  if (contentsType === 'window') {
    contents.on('will-navigate', (event, navigationUrl) => {
      const isShell = contents === mainWindow?.webContents;
      const isTrustOAuthProvider =
        navigationUrl.includes('accounts.google.com') ||
        navigationUrl.includes('google.com') ||
        navigationUrl.includes('github.com') ||
        navigationUrl.includes('login.microsoft.com') ||
        navigationUrl.includes('live.com') ||
        navigationUrl.includes('githubusercontent.com');
      const allowed = isShell
        ? navigationUrl.startsWith('http://localhost') ||
          navigationUrl.startsWith('https://localhost') ||
          navigationUrl.startsWith('file://') ||
          isTrustOAuthProvider
        : isHttpNavigationUrl(navigationUrl) || navigationUrl === 'about:blank';
      if (!allowed) event.preventDefault();
    });
  }

  if (contentsType === 'webview') {
    managedSessions.add(contents.session);
    attachAdblockToSession(contents.session);
    configureSessionPermissions(contents.session, () => mainWindow);
    attachDownloadsToSession(contents.session);
    const webviewSession = contents.session;
    const webviewId = contents.id;

    // Chromium reports when a page starts or stops producing sound. This is
    // the only reliable signal for "which tab is making that noise?".
    contents.on('audio-state-changed', (event) => {
      const tabId = tabByWebContentsId.get(webviewId);
      const tab = tabId ? tabs.get(tabId) : undefined;
      if (!tab || tab.audible === event.audible) return;
      tab.audible = event.audible;
      updateRendererState();
    });
    contents.once('destroyed', () => {
      forgetProxySession(webviewSession);
      if (webviewSession !== session.defaultSession) {
        detachAdblockFromSession(webviewSession);
        managedSessions.delete(webviewSession);
      }
      tabByWebContentsId.delete(webviewId);
    });

    // A remote page must not be able to navigate a guest into an internal or
    // local-file URL. Address-bar navigation is performed programmatically by
    // the trusted shell and is not affected by this event.
    contents.on('will-navigate', (event, navigationUrl) => {
      if (isForceHttpsEnabled()) {
        const upgraded = upgradeHttpUrl(navigationUrl);
        if (upgraded) {
          event.preventDefault();
          void contents.loadURL(upgraded).catch((error: unknown) => {
            console.warn('[navigation] HTTPS upgrade failed:', error);
          });
          return;
        }
      }
      if (!isHttpNavigationUrl(navigationUrl) && navigationUrl !== 'about:blank') {
        event.preventDefault();
      }
    });

    contents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown' || !input.control) return;
      if (input.shift && input.key.toLowerCase() === 'i') {
        event.preventDefault();
        if (!contents.isDevToolsOpened()) contents.openDevTools({ mode: 'detach' });
      } else if (!input.shift && input.key.toLowerCase() === 'f') {
        event.preventDefault();
        mainWindow?.webContents.send('open-find');
      }
    });
  }

  // A browser must support target=_blank/window.open, but untrusted pages must
  // not create unmanaged Electron BrowserWindows. Route safe web URLs into our
  // own tab model and deny the native popup. The dedicated auth portal is an
  // explicit, trusted route that should be allowed to open in its own window.
  contents.setWindowOpenHandler(({ url }) => {
    const isTrustedAuthPortal =
      /^https?:\/\/localhost(?::\d+)?\/auth\.html(?:\?.*)?$/.test(url) ||
      /^file:\/\/\/.*\/auth\.html(?:\?.*)?$/.test(url);

    // Allow OAuth provider popups (backend redirects and external providers)
    const isOAuthProvider =
      /^https:\/\/(accounts\.google\.com|github\.com|login\.microsoft\.com)/.test(url) ||
      /^https?:\/\/localhost(?::\d+)?\/auth\/social\//.test(url) ||
      /^https?:\/\/localhost(?::\d+)?\/auth\/social\/[^/]+\/callback/.test(url);

    if (isTrustedAuthPortal || isOAuthProvider) {
      return { action: 'allow' };
    }

    if (contentsType === 'webview' && canOpenInTab(url)) {
      createNewTab(url);
      return { action: 'deny' };
    }
    if (contentsType === 'webview' && url === 'about:blank') {
      // OAuth/payment flows often open a blank window and navigate it later.
      // Keep it hidden and route its first safe navigation into a managed tab.
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          show: false,
          width: 900,
          height: 700,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
          },
        },
      };
    }
    return { action: 'deny' };
  });

  if (contentsType === 'window') {
    // SECURITY: a renderer can put any path in <webview preload>. Only the
    // password-capture preload we ship is ever allowed to load in a guest.
    contents.on('will-attach-webview', (_e, webPreferences) => {
      const requested = webPreferences.preload;
      if (requested && path.resolve(requested) !== path.resolve(capturePreloadPath)) {
        delete webPreferences.preload;
      }
      webPreferences.nodeIntegration = false;
      webPreferences.contextIsolation = true;
    });
  }

  if (contentsType === 'webview') {
    contents.on('did-create-window', (popup) => {
      const openerTabId = tabByWebContentsId.get(contents.id);
      routePopupToTab(popup, openerTabId ? tabs.get(openerTabId)?.privateMode === true : false);
    });
  }

  // Build a context menu for right-click (Electron shows none by default)
  contents.on('context-menu', (_event, params) => {
    const { selectionText, linkURL, srcURL, mediaType, isEditable, x, y } = params;
    const items: Electron.MenuItemConstructorOptions[] = [];

    if (isEditable) {
      items.push({ role: 'undo' }, { role: 'redo' }, { type: 'separator' });
    }
    if (isEditable) {
      items.push({ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { type: 'separator' });
    } else if (selectionText) {
      items.push({ role: 'copy' }, { type: 'separator' });
    }

    if (linkURL) {
      items.push(
        {
          label: 'Open link in new tab',
          click: () => createNewTab(linkURL),
        },
        {
          label: 'Copy link address',
          click: () => clipboard.writeText(linkURL),
        },
        { type: 'separator' }
      );
    }

    if (srcURL && mediaType === 'image') {
      items.push(
        {
          label: 'Open image in new tab',
          click: () => createNewTab(srcURL),
        },
        {
          label: 'Copy image',
          click: () => contents.copyImageAt(x, y),
        },
        { type: 'separator' }
      );
    }

    if (!isEditable) {
      items.push({ role: 'selectAll' });
    }

    if (contentsType === 'webview') {
      items.push(
        { type: 'separator' },
        {
          label: 'Inspect element',
          click: () => {
            if (contents.isDestroyed()) return;
            if (!contents.isDevToolsOpened()) {
              contents.openDevTools({ mode: 'detach' });
            }
            contents.inspectElement(x, y);
          },
        },
        {
          label: contents.isDevToolsOpened() ? 'Close developer tools' : 'Open developer tools',
          click: () => {
            if (contents.isDestroyed()) return;
            if (contents.isDevToolsOpened()) contents.closeDevTools();
            else contents.openDevTools({ mode: 'detach' });
          },
        }
      );
    }

    if (items.length === 0) {
      items.push({ role: 'selectAll' });
    }

    Menu.buildFromTemplate(items).popup();
  });
});
