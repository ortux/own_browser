import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  clipboard,
  dialog,
  globalShortcut,
  session,
  shell,
  webContents as webContentsModule,
} from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import type { Tab, BrowserState, RendererToMainMessage, ProxyInfo } from '../shared/types';
import {
  isAllowedNavigationUrl,
  isHttpNavigationUrl,
  isExternalProtocolUrl,
  internalPageTitle,
  normalizeNavigationUrl,
} from '../shared/navigation';
import { stripTrackingParams } from '../shared/urlClean';
import { registerPexelsHandlers } from './pexels';
import {
  fetchProxy,
  applyProxy,
  clearProxy,
  verifyProxy,
  initProxyAutoApply,
  forgetProxySession,
  getProxyStatus,
} from './proxy';
import {
  addHistory,
  getHistory,
  searchHistory,
  deleteHistoryEntry,
  deleteHistorySince,
  clearHistory,
  addBookmark,
  removeBookmark,
  isBookmarked,
  getBookmarks,
  searchBookmarks,
  updateHistoryMetadata,
  closeDb,
  initDb,
  saveSessionTabs,
  loadSessionTabs,
  clearSessionTabs,
  getSetting,
  setSetting,
  getDbDiagnostics,
  clearDownloadRecords,
  pruneDownloadRecords,
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
  isStripTrackingParamsEnabled,
  getAdblockDiagnostics,
  attachAdblockToSession,
  detachAdblockFromSession,
} from './adblock';
import { initCertificateMonitor, getCertInfo } from './certificate';
import {
  configureSessionPermissions,
  clearPermissionDecisions,
  clearPermissionDecisionsForHost,
  listPermissionDecisions,
} from './permissions';
import { getCookieSummary, clearCookiesForHost } from './siteData';
import { configureAdGuardDns, getDnsMode, getAdGuardDnsEndpoint } from './dns';
import { applyStartupPolicyCommandLine, readStartupPolicy, writeStartupPolicy } from './startupPolicy';
import { initAutoUpdate, getUpdateStatus } from './update';
import { bookmarksToHtml, parseBookmarksHtml } from './bookmarksHtml';
import {
  initDownloads,
  attachDownloadsToSession,
  setMainWindow,
  getDownloads,
  setDownloadPath,
  setDownloadRetention,
  loadPersistedDownloads,
  cancelDownload,
  pauseDownload,
  resumeDownload,
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
const STARTED_AT = Date.now();

// Linux GPU/driver combinations can render the embedded webview as a solid
// black surface even though the guest page loaded successfully. The browser
// still works with software compositing, so prefer that stable path on Linux.
// Developers can opt back in while diagnosing a specific GPU with
// ZYPHORA_ENABLE_HARDWARE_ACCELERATION=1.
if (process.platform === 'linux' && process.env.ZYPHORA_ENABLE_HARDWARE_ACCELERATION !== '1') {
  app.disableHardwareAcceleration();
}

configureAdGuardDns();
// WebRTC IP-leak protection + third-party-cookie blocking are Chromium
// command-line switches and must be applied before app ready.
applyStartupPolicyCommandLine();

/**
 * Present web content as the Chromium version it actually runs on, without the
 * Electron/application tokens that cause some sites to serve a restricted or
 * non-interactive client. We retain the real Chrome version and platform rather
 * than hard-coding a newer browser version.
 */
function makeWebCompatibleUserAgent(userAgent: string): string {
  return userAgent
    .replace(/\sElectron\/[\w.-]+/gi, '')
    .replace(/\sown-browser\/[\w.-]+/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

app.userAgentFallback = makeWebCompatibleUserAgent(app.userAgentFallback);

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
      return value.index === undefined
        || (typeof value.index === 'number' && Number.isSafeInteger(value.index) && value.index >= 0 && value.index < 20);
    case 'navigate':
      return isBoundedString(value.tabId, 200)
        && isBoundedString(value.url, 8_192);
    case 'create-tab-url':
      return isBoundedString(value.url, 8_192)
        && (value.privateMode === undefined || typeof value.privateMode === 'boolean');
    case 'close-tab':
    case 'activate-tab':
    case 'duplicate-tab':
    case 'go-back':
    case 'go-forward':
    case 'reload':
    case 'stop':
      return isBoundedString(value.tabId, 200);
    case 'webview-title-updated':
      return isBoundedString(value.tabId, 200)
        && isBoundedString(value.title, 1_000);
    case 'webview-favicon-updated':
      return isBoundedString(value.tabId, 200)
        && isBoundedString(value.favicon, 8_192);
    case 'webview-loading':
      return isBoundedString(value.tabId, 200) && typeof value.loading === 'boolean';
    case 'webview-nav-state':
      return isBoundedString(value.tabId, 200)
        && isBoundedString(value.url, 8_192)
        && typeof value.canGoBack === 'boolean'
        && typeof value.canGoForward === 'boolean';
    case 'webview-attached':
      return isBoundedString(value.tabId, 200)
        && typeof value.webContentsId === 'number'
        && Number.isSafeInteger(value.webContentsId)
        && value.webContentsId > 0;
    case 'security-settings':
      return typeof value.forceHttps === 'boolean'
        && typeof value.doNotTrack === 'boolean'
        && (value.globalPrivacyControl === undefined || typeof value.globalPrivacyControl === 'boolean')
        && (value.stripTrackingParams === undefined || typeof value.stripTrackingParams === 'boolean')
        && (value.webrtcPolicy === undefined
          || value.webrtcPolicy === 'default'
          || value.webrtcPolicy === 'public-only'
          || value.webrtcPolicy === 'disable')
        && (value.blockThirdPartyCookies === undefined || typeof value.blockThirdPartyCookies === 'boolean');
    case 'set-tab-private':
      return isBoundedString(value.tabId, 200) && typeof value.privateMode === 'boolean';
    case 'set-tab-pinned':
      return isBoundedString(value.tabId, 200) && typeof value.pinned === 'boolean';
    case 'set-tab-muted':
      return isBoundedString(value.tabId, 200) && typeof value.muted === 'boolean';
    case 'cycle-tab':
      return value.forward === undefined || typeof value.forward === 'boolean';
    case 'set-session-restore':
      return typeof value.enabled === 'boolean';
    default:
      return false;
  }
}

function isTrustedMainFrame(event: {
  sender: Electron.WebContents;
  senderFrame: Electron.WebFrameMain | null;
}): boolean {
  return event.sender === mainWindow?.webContents
    && event.senderFrame === event.sender.mainFrame;
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
  return isBoundedString(value.ip, 253)
    && value.ip.length > 0
    && /^[a-z\d.:[\]-]+$/i.test(value.ip)
    && isBoundedString(value.port, 5)
    && /^\d+$/.test(value.port)
    && isBoundedString(value.ipPort, 259)
    && isBoundedString(value.country, 32)
    && isBoundedString(value.type, 16)
    && isBoundedString(value.proxyLevel, 32)
    && typeof value.supportsHttps === 'boolean'
    && typeof value.speed === 'number'
    && Number.isFinite(value.speed)
    && typeof value.fetchedAt === 'number'
    && Number.isFinite(value.fetchedAt)
    && value.ipPort === `${value.ip}:${value.port}`;
}

// Store for browser state
let mainWindow: BrowserWindow | null = null;
const tabs: Map<string, Tab> = new Map();
const closedTabs: Tab[] = [];
const managedSessions = new Set<Electron.Session>();
const tabByWebContentsId = new Map<number, string>();
const webContentsIdByTabId = new Map<string, number>();
let activeTabId: string = '';
let nextTabId = 1;

/** Apply the opt-in tracking-parameter stripper at navigation boundaries. */
function cleanNavigationUrl(url: string): string {
  return isStripTrackingParamsEnabled() ? stripTrackingParams(url) : url;
}

// Debounced session persistence — updateRendererState fires often.
let sessionSaveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSessionSave(): void {
  if (sessionSaveTimer) return;
  sessionSaveTimer = setTimeout(() => {
    sessionSaveTimer = null;
    if (getSetting('restoreSession') === 'false') return;
    const rows = Array.from(tabs.values())
      .filter((tab) => !tab.privateMode && tab.url !== 'about:blank')
      .map((tab) => ({
        tabId: tab.id,
        url: tab.url,
        title: tab.title,
        pinned: tab.pinned,
        muted: tab.muted,
      }));
    try {
      saveSessionTabs(rows, activeTabId);
    } catch {
      // Persistence unavailable — session restore silently degrades.
    }
  }, 1_500);
}

function cycleTab(forward: boolean): void {
  const ids = Array.from(tabs.keys());
  if (ids.length < 2) return;
  const current = ids.indexOf(activeTabId);
  if (current === -1) {
    activeTabId = ids[0];
  } else {
    const next = forward ? (current + 1) % ids.length : (current - 1 + ids.length) % ids.length;
    activeTabId = ids[next];
  }
  updateRendererState();
}

function setTabMutedState(tab: Tab, muted: boolean): void {
  tab.muted = muted;
  const wcId = webContentsIdByTabId.get(tab.id);
  const contents = wcId !== undefined ? webContentsModule.fromId(wcId) : null;
  try {
    contents?.setAudioMuted(muted);
  } catch {
    // Guest may not be attached yet; the flag re-applies on attach.
  }
  updateRendererState();
}

/**
 * SECURITY: Default Electron security configuration
 * - nodeIntegration: false (prevent Node.js in renderer)
 * - contextIsolation: true (separate context for preload and renderer)
 * - sandbox: true (sandbox each renderer process)
 * - preload: explicit preload script with limited IPC
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
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
  setMainWindow(mainWindow);

  const isDev = process.env.NODE_ENV === 'development';
  const rendererUrl = process.env.ELECTRON_RENDERER_URL
    ?? (isDev ? 'http://localhost:5173' : '');

  if (rendererUrl) {
    void mainWindow.loadURL(rendererUrl).catch((error: unknown) => {
      console.error('[renderer] failed to load dev server:', error);
    });
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html')).catch((error: unknown) => {
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

  // Initialize with the first tab — either a fresh New Tab or the tabs saved
  // by session restore ("Continue where you left off").
  const restored = initialSession?.tabs ?? [];
  if (restored.length > 0) {
    for (const row of restored) {
      const tabId = createNewTab(row.url, false, row.pinned, row.muted);
      if (!tabId) continue;
      const tab = tabs.get(tabId);
      if (tab && row.title && row.title !== 'Loading...') tab.title = row.title;
    }
    const savedActive = initialSession?.activeTabId;
    if (savedActive && tabs.has(savedActive)) {
      activeTabId = savedActive;
    } else {
      activeTabId = Array.from(tabs.keys()).pop() ?? activeTabId;
    }
    updateRendererState();
  } else {
    createNewTab();
  }
}

function createNewTab(
  rawUrl?: string,
  privateMode = false,
  pinned = false,
  muted = false,
): string {
  const normalized = rawUrl ? normalizeNavigationUrl(cleanNavigationUrl(rawUrl)) : null;
  if (rawUrl && !normalized) {
    console.warn('[navigation] refused unsupported new-tab URL:', rawUrl);
    return '';
  }
  const url = normalized;

  const tabId = `tab-${nextTabId++}`;
  // Give internal pages a friendly title up-front so the tab strip reads well.
  const internalTitle = url ? internalPageTitle(url) : null;
  const title = !url || url === 'about:blank'
    ? 'New Tab'
    : internalTitle
      ? internalTitle
      : 'Loading...';
  const tab: Tab = {
    id: tabId,
    url: url || 'about:blank',
    title,
    loading: false,
    canGoBack: false,
    canGoForward: false,
    privateMode,
    muted,
    pinned,
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
  webContentsIdByTabId.delete(tabId);

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

function getState(): BrowserState {
  return {
    tabs: Array.from(tabs.values()),
    activeTabId,
  };
}

/** Session snapshot consumed by createWindow on startup (null = fresh start). */
let initialSession: ReturnType<typeof loadSessionTabs> | null = null;

function updateRendererState() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('state-updated', getState());
  }
  if (initialSession !== null) {
    // Only start persisting once the startup restore has been consumed.
    scheduleSessionSave();
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
        const url = normalizeNavigationUrl(cleanNavigationUrl(message.url));
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
        if (tabs.has(message.tabId)) {
          tabByWebContentsId.set(message.webContentsId, message.tabId);
          webContentsIdByTabId.set(message.tabId, message.webContentsId);
          // Re-apply a restored mute state to the freshly attached guest.
          const attachedTab = tabs.get(message.tabId);
          if (attachedTab?.muted) {
            try { webContentsModule.fromId(message.webContentsId)?.setAudioMuted(true); } catch { /* guest not ready */ }
          }
        }
        break;
      }
      case 'security-settings': {
        setNetworkSecuritySettings({
          forceHttps: message.forceHttps,
          doNotTrack: message.doNotTrack,
          globalPrivacyControl: message.globalPrivacyControl,
          stripTrackingParams: message.stripTrackingParams,
        });
        // Startup-only Chromium policies persist to disk for the next launch.
        if (message.webrtcPolicy !== undefined || message.blockThirdPartyCookies !== undefined) {
          writeStartupPolicy({
            ...(message.webrtcPolicy !== undefined ? { webrtcPolicy: message.webrtcPolicy } : {}),
            ...(message.blockThirdPartyCookies !== undefined
              ? { blockThirdPartyCookies: message.blockThirdPartyCookies }
              : {}),
          });
        }
        break;
      }
      case 'set-tab-pinned': {
        const tab = tabs.get(message.tabId);
        if (tab) {
          tab.pinned = message.pinned;
          updateRendererState();
        }
        break;
      }
      case 'set-tab-muted': {
        const tab = tabs.get(message.tabId);
        if (tab) setTabMutedState(tab, message.muted);
        break;
      }
      case 'cycle-tab':
        cycleTab(message.forward !== false);
        break;
      case 'set-session-restore':
        try {
          setSetting('restoreSession', message.enabled ? 'true' : 'false');
          if (!message.enabled) clearSessionTabs();
        } catch {
          // DB unavailable; the renderer keeps its own flag.
        }
        break;
      case 'set-tab-private': {
        const tab = tabs.get(message.tabId);
        if (tab && tab.url === 'about:blank' && !tab.privateMode) {
          tab.privateMode = message.privateMode;
          updateRendererState();
        }
        break;
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
    loadPersistedDownloads();
    // Session restore: "Continue where you left off" (default on). Private
    // tabs are never saved; a disabled setting starts completely fresh.
    initialSession = getSetting('restoreSession') === 'false'
      ? { tabs: [], activeTabId: null }
      : loadSessionTabs();
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
  registerDownloadHandlers();
  registerSiteDataHandlers();
  registerDiagnosticsHandler();
  initAutoUpdate(() => mainWindow, isTrustedMainFrame);
  createWindow();

  // Global shortcut — opens the Downloads page as a new tab (zyphora://downloads).
  // Registered at the OS level so it fires even when a webview has keyboard focus.
  globalShortcut.register('CommandOrControl+J', () => {
    createNewTab('zyphora://downloads');
  });
  // Startup timing marker (see README performance targets).
  console.log(`[perf] app ready in ${Date.now() - STARTED_AT}ms`);
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  closeDb();
});

// ── DB IPC handlers ──────────────────────────────────────────────────────────

function registerDbHandlers() {
  ipcMain.handle('db:history:get', (event, limit?: unknown) => {
    assertTrustedMainFrame(event);
    if (limit !== undefined
      && (typeof limit !== 'number' || !Number.isSafeInteger(limit) || limit < 1 || limit > 500)) {
      throw new Error('Invalid history limit.');
    }
    return getHistory(limit === undefined ? 200 : limit);
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
    if (!isBoundedString(url, 8_192) || !isAllowedNavigationUrl(url) || url.startsWith('zyphora://')) {
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

  // ── Bookmark import / export (Netscape HTML, compatible with all major browsers)

  ipcMain.handle('db:bookmarks:export', async (event) => {
    assertTrustedMainFrame(event);
    if (!mainWindow) throw new Error('No window available.');
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export bookmarks',
      defaultPath: 'zyphora-bookmarks.html',
      filters: [{ name: 'HTML', extensions: ['html', 'htm'] }],
    });
    if (result.canceled || !result.filePath) return { success: false, canceled: true, count: 0 };
    const items = getBookmarks().map((bookmark) => ({
      url: bookmark.url,
      title: bookmark.title,
      createdAt: bookmark.created_at,
    }));
    await fs.promises.writeFile(result.filePath, bookmarksToHtml(items), 'utf-8');
    return { success: true, canceled: false, count: items.length };
  });

  ipcMain.handle('db:bookmarks:import', async (event) => {
    assertTrustedMainFrame(event);
    if (!mainWindow) throw new Error('No window available.');
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Import bookmarks',
      properties: ['openFile'],
      filters: [{ name: 'HTML', extensions: ['html', 'htm'] }],
    });
    if (result.canceled || !result.filePaths[0]) return { success: false, canceled: true, imported: 0, skipped: 0 };
    const html = await fs.promises.readFile(result.filePaths[0], 'utf-8');
    if (html.length > 20_000_000) throw new Error('Bookmark file too large.');
    const items = parseBookmarksHtml(html);
    let imported = 0;
    let skipped = 0;
    for (const item of items) {
      if (!isAllowedNavigationUrl(item.url) || item.url.startsWith('zyphora://')) {
        skipped++;
        continue;
      }
      try {
        addBookmark(item.url, item.title.slice(0, 1000), undefined, item.createdAt);
        imported++;
      } catch {
        skipped++;
      }
    }
    return { success: true, canceled: false, imported, skipped };
  });
}

// ── Proxy IPC handlers ───────────────────────────────────────────────────────

function registerPrivacyHandlers() {
  ipcMain.handle('privacy:clear-data', async (event) => {
    assertTrustedMainFrame(event);
    clearHistory();
    resetBlockedStats();
    clearPermissionDecisions();
    for (const ses of managedSessions) {
      await ses.clearStorageData({
        storages: ['cookies', 'filesystem', 'indexdb', 'localstorage', 'shadercache', 'serviceworkers', 'cachestorage'],
      });
      await ses.clearCache();
    }
  });

  /**
   * Selective "Clear browsing data" — validated targets + optional time
   * range. History respects `since`; site storage clears globally (Chromium
   * provides no timestamped variant), which the dialog states explicitly.
   */
  ipcMain.handle('privacy:clear-data-selective', async (event, options: unknown) => {
    assertTrustedMainFrame(event);
    if (!isRecord(options)) throw new Error('Invalid clear-data options.');
    const targets = options.targets;
    const since = typeof options.since === 'number' && Number.isFinite(options.since) && options.since >= 0
      ? options.since
      : 0;
    if (!isRecord(targets)) throw new Error('Invalid clear-data targets.');
    const want = (key: string): boolean =>
      Object.prototype.hasOwnProperty.call(targets, key) && targets[key] === true;

    const cleared: string[] = [];
    if (want('history')) {
      try {
        if (since > 0) deleteHistorySince(since);
        else clearHistory();
        cleared.push('history');
      } catch { /* DB unavailable */ }
    }
    if (want('downloads')) {
      try {
        pruneDownloadRecords(0);
        cleared.push('downloads');
      } catch { /* DB unavailable */ }
    }
    if (want('permissions')) {
      clearPermissionDecisions();
      cleared.push('permissions');
    }
    if (want('cookies') || want('cache')) {
      type Storages = NonNullable<Parameters<Electron.Session['clearStorageData']>[0]>['storages'];
      const storages: Storages = [
        ...(want('cookies')
          ? (['cookies', 'localstorage', 'indexdb', 'serviceworkers', 'cachestorage', 'filesystem'] as NonNullable<Storages>)
          : []),
        ...(want('cache') ? (['shadercache'] as NonNullable<Storages>) : []),
      ];
      for (const ses of managedSessions) {
        if (want('cookies')) {
          await ses.clearStorageData({ storages });
        }
        if (want('cache')) await ses.clearCache();
      }
      if (want('cookies')) cleared.push('cookies');
      if (want('cache')) cleared.push('cache');
    }
    if (want('blockedStats')) {
      resetBlockedStats();
      cleared.push('blockedStats');
    }
    return { success: true, cleared };
  });
}

// ── Per-site data IPC (Site settings) ────────────────────────────────────────

function isHostString(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z\d.-]+$/i.test(value.trim()) && value.trim().length <= 253;
}

function registerSiteDataHandlers() {
  ipcMain.handle('sites:permissions', (event) => {
    assertTrustedMainFrame(event);
    return listPermissionDecisions();
  });
  ipcMain.handle('sites:clear-permissions', (event, host: unknown) => {
    assertTrustedMainFrame(event);
    if (!isHostString(host)) throw new Error('Invalid host.');
    return { removed: clearPermissionDecisionsForHost(host.trim().toLowerCase()) };
  });
  ipcMain.handle('sites:cookies', (event) => {
    assertTrustedMainFrame(event);
    return getCookieSummary();
  });
  ipcMain.handle('sites:clear-cookies', async (event, host: unknown) => {
    assertTrustedMainFrame(event);
    if (!isHostString(host)) throw new Error('Invalid host.');
    return { removed: await clearCookiesForHost(host.trim().toLowerCase()) };
  });
}

// ── Diagnostics IPC ──────────────────────────────────────────────────────────

function registerDiagnosticsHandler() {  ipcMain.handle('diag:get', (event) => {
    assertTrustedMainFrame(event);
    const policy = readStartupPolicy();
    let dbInfo = { sizeBytes: 0, path: 'unavailable' };
    try { dbInfo = getDbDiagnostics(); } catch { /* DB unavailable */ }
    return {
      versions: {
        app: app.getVersion(),
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        node: process.versions.node,
        platform: `${process.platform} ${process.arch}`,
      },
      dns: { mode: getDnsMode(), endpoint: getAdGuardDnsEndpoint() },
      adblock: getAdblockDiagnostics(),
      proxy: getProxyStatus(),
      startupPolicy: policy,
      db: dbInfo,
      updates: getUpdateStatus(),
    };
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
    if (!Array.isArray(sites) || sites.length > 500 || !sites.every((site) => isBoundedString(site, 253))) {
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

// ── Downloads IPC handlers ────────────────────────────────────────────────────

function registerDownloadHandlers() {
  function assertDownloadId(id: unknown): asserts id is string {
    if (!isBoundedString(id, 200) || !id) throw new Error('Invalid download ID.');
  }

  ipcMain.handle('download:list', (event) => {
    assertTrustedMainFrame(event);
    return getDownloads();
  });
  ipcMain.handle('download:pause', (event, id: unknown) => {
    assertTrustedMainFrame(event);
    assertDownloadId(id);
    return pauseDownload(id);
  });
  ipcMain.handle('download:resume', (event, id: unknown) => {
    assertTrustedMainFrame(event);
    assertDownloadId(id);
    return resumeDownload(id);
  });
  ipcMain.handle('download:set-retention', (event, days: unknown) => {
    assertTrustedMainFrame(event);
    if (typeof days !== 'number' || !Number.isSafeInteger(days) || days < 0 || days > 365) {
      throw new Error('Invalid retention (days).');
    }
    setDownloadRetention(days);
    return { success: true };
  });
  ipcMain.handle('download:clear-history', (event) => {
    assertTrustedMainFrame(event);
    try { clearDownloadRecords(); } catch { /* DB unavailable */ }
    return { success: true };
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
ipcMain.on('window:fullscreen', (event) => {
  if (!isTrustedMainFrame(event)) return;
  if (mainWindow?.isFullScreen()) mainWindow.setFullScreen(false);
  else mainWindow?.setFullScreen(true);
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

  // Restrict the application shell. A hidden managed popup is allowed to reach
  // normal web URLs so OAuth/payment flows can be routed into a tab.
  if (contentsType === 'window') {
    contents.on('will-navigate', (event, navigationUrl) => {
      const isShell = contents === mainWindow?.webContents;
      const allowed = isShell
        ? navigationUrl.startsWith('http://localhost')
          || navigationUrl.startsWith('https://localhost')
          || navigationUrl.startsWith('file://')
        : isHttpNavigationUrl(navigationUrl) || navigationUrl === 'about:blank';
      if (!allowed) event.preventDefault();
    });
  }

  if (contentsType === 'webview') {
    // Use the sanitized, Chrome-compatible UA from the very first request.
    // Some Google/YouTube clients detect the Electron token and return a page
    // shell whose player and interactive API calls are restricted.
    contents.setUserAgent(app.userAgentFallback);
    managedSessions.add(contents.session);
    attachAdblockToSession(contents.session);
    configureSessionPermissions(contents.session, () => mainWindow);
    attachDownloadsToSession(contents.session);
    contents.once('destroyed', () => {
      forgetProxySession(contents.session);
      if (contents.session !== session.defaultSession) {
        detachAdblockFromSession(contents.session);
        managedSessions.delete(contents.session);
      }
      const tabId = tabByWebContentsId.get(contents.id);
      tabByWebContentsId.delete(contents.id);
      if (tabId) webContentsIdByTabId.delete(tabId);
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
      if (isExternalProtocolUrl(navigationUrl)) {
        // mailto:/tel:/magnet:… belong to OS handlers, not a browser tab.
        event.preventDefault();
        shell.openExternal(navigationUrl).catch((error: unknown) => {
          console.warn('[navigation] external protocol handler failed:', error);
        });
        return;
      }
      if (!isHttpNavigationUrl(navigationUrl) && navigationUrl !== 'about:blank') {
        event.preventDefault();
      }
    });

    // Track per-tab audio state for the sidebar speaker indicator.
    const setAudible = (audible: boolean) => {
      const tabId = tabByWebContentsId.get(contents.id);
      if (!tabId) return;
      const tab = tabs.get(tabId);
      if (!tab || tab.audible === audible) return;
      tab.audible = audible;
      updateRendererState();
    };
    contents.on('media-started-playing', () => setAudible(true));
    contents.on('media-paused', () => setAudible(false));

    contents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return;

      // Tab cycling works even while a webview holds keyboard focus.
      if (input.control && input.key === 'Tab') {
        event.preventDefault();
        cycleTab(!input.shift);
        return;
      }
      // F11 fullscreen from within page content.
      if (input.key === 'F11') {
        event.preventDefault();
        if (mainWindow?.isFullScreen()) mainWindow.setFullScreen(false);
        else mainWindow?.setFullScreen(true);
        return;
      }
      if (!input.control) return;
      if (input.shift && input.key.toLowerCase() === 'i') {
        event.preventDefault();
        if (!contents.isDevToolsOpened()) contents.openDevTools({ mode: 'detach' });
      } else if (!input.shift && input.key.toLowerCase() === 'f') {
        event.preventDefault();
        mainWindow?.webContents.send('open-find');
      } else if (!input.shift && input.key.toLowerCase() === 'l') {
        // Focus the address bar (the renderer listens for this event).
        event.preventDefault();
        mainWindow?.webContents.send('focus-address');
      } else if (!input.shift && input.key.toLowerCase() === 'k') {
        event.preventDefault();
        mainWindow?.webContents.send('open-palette');
      } else if (/^[1-9]$/.test(input.key)) {
        // Ctrl+1..8 jumps to tab N; Ctrl+9 to the last tab.
        event.preventDefault();
        const ids = Array.from(tabs.keys());
        const index = input.key === '9' ? ids.length - 1 : Number(input.key) - 1;
        if (ids[index]) {
          activeTabId = ids[index];
          updateRendererState();
        }
      }
    });
  }

  // A browser must support target=_blank/window.open, but untrusted pages must
  // not create unmanaged Electron BrowserWindows. Route safe web URLs into our
  // own tab model and deny the native popup. This restores links and controls
  // that previously appeared to do nothing while preserving the sandbox.
  contents.setWindowOpenHandler(({ url }) => {
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
      items.push(
        { role: 'copy' },
        {
          label: `Search for "${selectionText.slice(0, 24)}${selectionText.length > 24 ? '…' : ''}"`,
          click: () => {
            // The renderer resolves the query with the user's search engine.
            mainWindow?.webContents.send('context-search', selectionText.slice(0, 500));
          },
        },
        { type: 'separator' },
      );
    }

    if (linkURL) {
      items.push(
        {
          label: 'Open link in new tab',
          click: () => createNewTab(linkURL),
        },
        {
          label: 'Open link in new private tab',
          click: () => createNewTab(linkURL, true),
        },
        {
          label: 'Copy link address',
          click: () => clipboard.writeText(linkURL),
        },
        {
          label: 'Copy clean link',
          click: () => clipboard.writeText(stripTrackingParams(linkURL)),
        },
        { type: 'separator' },
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
        {
          label: 'Copy image address',
          click: () => clipboard.writeText(srcURL),
        },
        {
          label: 'Save image as…',
          click: () => {
            if (isHttpNavigationUrl(srcURL)) contents.downloadURL(srcURL);
          },
        },
        { type: 'separator' },
      );
    }

    if (contentsType === 'webview') {
      if (contents.canGoBack() || contents.canGoForward()) {
        if (contents.canGoBack()) {
          items.push({ label: 'Back', click: () => { try { contents.goBack(); } catch { /* destroyed */ } } });
        }
        if (contents.canGoForward()) {
          items.push({ label: 'Forward', click: () => { try { contents.goForward(); } catch { /* destroyed */ } } });
        }
        items.push({ type: 'separator' });
      }
      items.push(
        { role: 'reload' },
        { type: 'separator' },
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
        },
      );
    }

    if (items.length === 0) {
      items.push({ role: 'selectAll' });
    }

    Menu.buildFromTemplate(items).popup();
  });
});
