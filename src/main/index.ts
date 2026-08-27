import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  clipboard,
  globalShortcut,
  session,
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
  addBookmark,
  removeBookmark,
  isBookmarked,
  getBookmarks,
  searchBookmarks,
  updateHistoryMetadata,
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
import { configureSessionPermissions, clearPermissionDecisions, handlePermissionResponse } from './permissions';
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
      return typeof value.forceHttps === 'boolean' && typeof value.doNotTrack === 'boolean';
    case 'set-tab-private':
      return isBoundedString(value.tabId, 200) && typeof value.privateMode === 'boolean';
    case 'permission-response':
      return isBoundedString(value.requestId, 200) && typeof value.allow === 'boolean';
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

  // Initialize with first tab
  createNewTab();

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
  const title = !url || url === 'about:blank'
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
        if (tabs.has(message.tabId)) {
          tabByWebContentsId.set(message.webContentsId, message.tabId);
        }
        break;
      }
      case 'security-settings':
        setNetworkSecuritySettings({
          forceHttps: message.forceHttps,
          doNotTrack: message.doNotTrack,
        });
        break;
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
  closeDb();
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
    const webviewSession = contents.session;
    const webviewId = contents.id;
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
