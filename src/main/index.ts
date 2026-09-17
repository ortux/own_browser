import { sortPinnedFirst, reorderTabs as reorderTabList, setPinned } from '../shared/tabOrder';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  clipboard,
  powerMonitor,
  session,
  shell,
  webContents,
} from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Tab, BrowserState, RendererToMainMessage } from '../shared/types';
import {
  isAllowedNavigationUrl,
  isPdfUrl,
  isHttpNavigationUrl,
  normalizeNavigationUrl,
  INTERNAL_PAGES,
  INTERNAL_PAGE_TITLES,
} from '../shared/navigation';
import { stripTrackingParams } from '../shared/trackingParams';
import { isRecord } from '../shared/utils';
import {
  loadClosedTabs,
  scheduleClosedTabsSave,
  flushClosedTabsSave,
  removeClosedTabsFile,
  MAX_CLOSED_TABS,
  type ClosedTabRecord,
} from './closedTabs';
import { registerPexelsHandlers } from './pexels';
import { scheduleStartupBootstrap } from './startup';
import {
  applyGuestPreferences,
  applyStartupSwitches,
  configureSession as configureGeneralSession,
  getLaunchAtLogin,
  getMainGeneralSettings,
  isDefaultBrowser,
  makeDefaultBrowser,
  setLaunchAtLogin,
  setMainGeneralSettings,
} from './generalSettings';
import type { MainGeneralSettings } from '../shared/generalSettings';
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
  flushDb,
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
  isStripTrackingEnabled,
  attachAdblockToSession,
  detachAdblockFromSession,
} from './adblock';
import {
  initCertificateMonitor,
  attachCertificateMonitorToSession,
  getCertInfo,
} from './certificate';
import {
  configureSessionPermissions,
  clearPermissionDecisions,
  handlePermissionResponse,
  getPermissionDecisions,
  setPermissionDecision,
  clearPermissionDecision,
  loadPermissionDecisions,
  flushPermissionDecisions,
} from './permissions';
import { configureAdGuardDns, getDnsMode, setDnsMode } from './dns';
import { getReaderScript } from './readerScript';
import { type AgentEvent, type AgentProfileField } from '../shared/agent';
import type { AgentConfig } from '../shared/agentConfig';
import {
  getAgentConfig,
  updateAgentConfig,
  resetAgentConfig,
  addMemory,
  updateMemory,
  deleteMemory,
  clearMemories,
  clearActivity,
  dropSessionMemories,
} from './agentConfigStore';
import { startScheduler, stopScheduler, setTaskRunner, runTaskNow } from './agentScheduler';
import { setNotifyWindow } from './agentNotify';
import {
  getProfileForDisplay,
  setProfile,
  setApiKey,
  hasApiKey,
  clearAgentProfile,
  AgentSecretUnavailableError,
} from './agentProfile';
import {
  initAgentRunner,
  runAgent,
  stopAgent,
  respondToAgent,
  isAgentRunning,
  pauseAgent,
  resumeAgent,
} from './agentRunner';
import {
  initDownloads,
  attachDownloadsToSession,
  setMainWindow,
  getDownloads,
  setDownloadPath,
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
import { startEngine, stopEngine } from './engine/EngineStartup';
import { applicationEngine } from './engine/ApplicationEngine';
import { MockIntegration } from './engine/integrations/MockIntegration';
import { GmailAdapter } from './engine/integrations/GmailAdapter';
import { WhatsAppAdapter } from './engine/integrations/WhatsAppAdapter';
import { registerEngineHandlers } from './engine/engineIPC';
import { createUpdateManager } from './updateManager';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Linux GPU/driver combinations can render the embedded webview as a solid
// black surface even though the guest page loaded successfully. The browser
// still works with software compositing, so prefer that stable path on Linux.
// Developers can opt back in while diagnosing a specific GPU with
// ZYPHORA_ENABLE_HARDWARE_ACCELERATION=1.
const lightweightMode = process.env.ZYPHORA_LIGHTWEIGHT === '1' || process.env.ZYPHORA_ENABLE_HARDWARE_ACCELERATION !== '1';
if (lightweightMode) {
  app.disableHardwareAcceleration();
}

configureAdGuardDns();

/**
 * Keep the app's own browser context intact. We do not attempt to spoof a
 * different browser family or launch an external browser to satisfy OAuth.
 */

function canOpenInTab(value: string): boolean {
  return isHttpNavigationUrl(value) || isPdfUrl(value);
}

/**
 * Hosts that legitimately have no HTTPS endpoint. Upgrading these breaks local
 * development servers and appliances on the LAN for no security benefit.
 */
function isHttpsUpgradeExempt(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host.endsWith('.local') ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  );
}

function upgradeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:') return null;
    if (isHttpsUpgradeExempt(url.hostname)) return null;
    url.protocol = 'https:';
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * URLs we already tried to upgrade, per guest.
 *
 * A site that redirects https back to http would otherwise ping-pong forever:
 * will-navigate upgrades, the server 302s back down, will-navigate upgrades
 * again. Remembering the attempt lets the second pass through fall back to the
 * plain http URL instead of looping.
 */
const httpsUpgradeAttempts = new Map<number, Set<string>>();

function shouldAttemptHttpsUpgrade(webContentsId: number, url: string): boolean {
  let attempted = httpsUpgradeAttempts.get(webContentsId);
  if (!attempted) {
    attempted = new Set<string>();
    httpsUpgradeAttempts.set(webContentsId, attempted);
  }
  if (attempted.has(url)) return false;
  // Bound the set so a long-lived tab cannot grow it without limit.
  if (attempted.size > 100) attempted.clear();
  attempted.add(url);
  return true;
}

/**
 * Same one-shot guard as the HTTPS upgrade, for tracking-param stripping: the
 * loadURL() below re-enters will-navigate, so without a memo a site that
 * re-adds the parameter on redirect would ping-pong forever.
 */
const paramStripAttempts = new Map<number, Set<string>>();

function shouldAttemptParamStrip(webContentsId: number, url: string): boolean {
  let attempted = paramStripAttempts.get(webContentsId);
  if (!attempted) {
    attempted = new Set<string>();
    paramStripAttempts.set(webContentsId, attempted);
  }
  if (attempted.has(url)) return false;
  if (attempted.size > 100) attempted.clear();
  attempted.add(url);
  return true;
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
      return (
        typeof value.forceHttps === 'boolean' &&
        typeof value.doNotTrack === 'boolean' &&
        (value.stripTracking === undefined || typeof value.stripTracking === 'boolean')
      );
    case 'private-by-default':
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
    case 'reader-toggle':
      return isBoundedString(value.tabId, 200);
    case 'reader-is-active':
      return isBoundedString(value.tabId, 200);
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
let updateManager = createUpdateManager(() => mainWindow);
const tabs: Map<string, Tab> = new Map();
const closedTabs: Tab[] = [];

/** Rebuild the persisted view of `closedTabs`. */
function closedTabRecords(): ClosedTabRecord[] {
  return closedTabs.map((tab) => ({
    url: tab.url,
    title: tab.title,
    favicon: tab.favicon,
    pinned: tab.pinned,
    muted: tab.muted,
    closedAt: Date.now(),
  }));
}

/** Seed the in-memory list from disk so Ctrl+Shift+T survives a restart. */
function hydrateClosedTabs(): void {
  if (closedTabs.length) return;
  for (const record of loadClosedTabs()) {
    closedTabs.push({
      id: `closed-${nextTabId++}`,
      url: record.url,
      title: record.title || record.url,
      favicon: record.favicon,
      loading: false,
      canGoBack: false,
      canGoForward: false,
      privateMode: false,
      muted: record.muted,
      audible: false,
      pinned: record.pinned,
    });
  }
}
const managedSessions = new Set<Electron.Session>();
const tabByWebContentsId = new Map<number, string>();

/** The live guest webContents backing a tab, or null if it has not attached. */
function guestContentsForTab(tabId: string): Electron.WebContents | null {
  for (const [contentsId, id] of tabByWebContentsId) {
    if (id !== tabId) continue;
    const wc = webContents.fromId(contentsId);
    // A destroyed webContents is not a page: returning it as a "fallback"
    // made callers blow up with "Object has been destroyed" instead of
    // waiting for the live guest or reporting that there is none.
    if (wc && !wc.isDestroyed()) return wc;
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
      plugins: true,
      preload: path.join(__dirname, '../preload/index.js'),
    },
    // Must resolve inside dist/, which is all electron-builder packages.
    // ../../public/icon.png pointed outside the bundle, so packaged builds
    // launched with no window icon at all.
    icon: path.join(__dirname, '../renderer/icon.png'),
  });
  if (savedWindow.maximised) mainWindow.maximize();
  trackWindowState(mainWindow);
  setMainWindow(mainWindow);
  setNotifyWindow(mainWindow);

  // Keep the custom title bar's maximize/restore icon truthful. Without these
  // the button always rendered the "maximize" glyph, including when the window
  // was already maximized (or was maximized by the OS, not by our button).
  const sendMaximizedState = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send('window:maximized-changed', mainWindow.isMaximized());
  };
  mainWindow.on('maximize', sendMaximizedState);
  mainWindow.on('unmaximize', sendMaximizedState);
  mainWindow.webContents.on('did-finish-load', sendMaximizedState);

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

  // "Warn before closing multiple tabs": a window holding several tabs is a
  // whole working session, so confirm before discarding it.
  let closeConfirmed = false;
  mainWindow.on('close', (event) => {
    if (closeConfirmed || !mainWindow || mainWindow.isDestroyed()) return;
    if (!getMainGeneralSettings().warnClosingMultipleTabs) return;
    const openTabs = tabs.size;
    if (openTabs < 2) return;

    event.preventDefault();
    const { response } = dialog.showMessageBoxSync
      ? {
          response: dialog.showMessageBoxSync(mainWindow, {
            type: 'question',
            buttons: [`Close ${openTabs} tabs`, 'Cancel'],
            defaultId: 0,
            cancelId: 1,
            title: 'Close window',
            message: `Close ${openTabs} tabs?`,
            detail: 'The tabs you have open will be closed.',
          }),
        }
      : { response: 0 };
    if (response === 0) {
      closeConfirmed = true;
      mainWindow.close();
    }
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

/**
 * Mirrors the renderer's `security.privateByDefault`. Held in main because
 * tabs are created here for popups, restored sessions and the launch tab, none
 * of which pass through the renderer's create-tab call.
 */
let privateByDefault = false;

function createNewTab(rawUrl?: string, privateMode = privateByDefault): string {
  const url = rawUrl ? normalizeNavigationUrl(rawUrl) : null;
  if (rawUrl && !url) {
    console.warn('[navigation] refused unsupported new-tab URL:', rawUrl);
    return '';
  }

  const tabId = `tab-${nextTabId++}`;
  // Give internal pages a friendly title up-front so the tab strip reads well.
  const title =
    !url || url === 'about:blank'
      ? 'New Tab'
      : (INTERNAL_PAGE_TITLES[url] ?? (url.startsWith('zyphora://') ? 'Zyphora' : 'Loading...'));
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

  // "Open new tabs next to the current tab": rebuild the order with the new
  // tab immediately after the opener rather than at the end of the strip.
  const { openTabsNextToCurrent, switchToNewTab } = getMainGeneralSettings();
  if (openTabsNextToCurrent && activeTabId && tabs.has(activeTabId)) {
    const ordered = [...tabs.values()].filter((entry) => entry.id !== tabId);
    const openerIndex = ordered.findIndex((entry) => entry.id === activeTabId);
    if (openerIndex >= 0) {
      ordered.splice(openerIndex + 1, 0, tab);
      applyTabOrder(sortPinnedFirst(ordered));
    }
  }

  // "Switch to a new tab immediately". When off, the tab opens in the
  // background and focus stays where the user was working.
  if (switchToNewTab || !activeTabId || !tabs.has(activeTabId)) activeTabId = tabId;
  updateRendererState();

  return tabId;
}

function routePopupToTab(popup: BrowserWindow, privateMode: boolean, initialUrl = ''): void {
  const tabId = createNewTab(canOpenInTab(initialUrl) ? initialUrl : undefined, privateMode);
  if (!tabId) {
    popup.close();
    return;
  }

  if (canOpenInTab(initialUrl)) {
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

  // An about:blank popup that never navigates would otherwise sit around as a
  // hidden, unmanaged BrowserWindow with a blank tab shadowing it. Give the
  // opener a short window to perform its redirect, then reclaim both.
  const abandonTimer = setTimeout(() => {
    if (popup.isDestroyed()) return;
    const tab = tabs.get(tabId);
    if (tab && tab.url === 'about:blank') {
      tabs.delete(tabId);
      if (activeTabId === tabId) {
        activeTabId = Array.from(tabs.keys())[0] ?? activeTabId;
      }
      updateRendererState();
    }
    popup.close();
  }, 30_000);

  popup.on('closed', () => {
    clearTimeout(abandonTimer);
    if (!popup.webContents.isDestroyed()) {
      popup.webContents.removeListener('did-navigate', routeNavigation);
      popup.webContents.removeListener('did-navigate-in-page', routeNavigation);
    }
  });
}

function closeTab(tabId: string) {
  const tab = tabs.get(tabId);
  // "Reopen closed tabs" off means Ctrl+Shift+T has nothing to restore, so
  // there is no reason to keep a record of what was closed either.
  if (tab && !tab.privateMode && getMainGeneralSettings().reopenClosedTabs) {
    closedTabs.unshift({ ...tab });
    closedTabs.splice(MAX_CLOSED_TABS);
    scheduleClosedTabsSave(closedTabRecords());
  }
  tabs.delete(tabId);

  if (tabs.size === 0) {
    // "Keep browser open when the last tab is closed" (on by default): leave
    // an empty new tab rather than quitting. When the user turned it off,
    // closing the last tab closes the window, as they asked.
    if (getMainGeneralSettings().keepOpenOnLastTabClose) {
      createNewTab();
    } else {
      mainWindow?.close();
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
  scheduleClosedTabsSave(closedTabRecords());

  // Only non-private tabs are ever recorded, so the restored tab is non-private
  // by construction. Carry the pinned and muted flags across: reopening a tab
  // that comes back unpinned and unmuted is a silent loss of user intent.
  const tabId = createNewTab(snapshot.url, false);
  if (!tabId) return '';

  const restored = tabs.get(tabId);
  if (restored) {
    restored.pinned = snapshot.pinned;
    restored.muted = snapshot.muted;
    restored.title = snapshot.title || restored.title;
    restored.favicon = snapshot.favicon;
    if (restored.pinned) applyTabOrder(sortPinnedFirst(Array.from(tabs.values())));
    updateRendererState();
  }
  return tabId;
}

function getClosedTabs(): Tab[] {
  return closedTabs.map((tab) => ({ ...tab }));
}

/**
 * Forget the recently-closed list.
 *
 * These records hold the URL and title of every non-private tab closed this
 * session, so leaving them intact meant Ctrl+Shift+T could resurrect the exact
 * pages the user had just erased with "clear browsing data".
 */
function clearClosedTabs(): void {
  closedTabs.length = 0;
  removeClosedTabsFile();
  updateRendererState();
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
      // `undefined` (no explicit choice) falls through to privateByDefault.
      createNewTab(undefined, message.privateMode);
      break;
    case 'create-tab-url':
      createNewTab(message.url, message.privateMode);
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
        // Purge any stale entry for this tab so guestContentsForTab never
        // hits a destroyed webContents before the live one.
        for (const [oldId, oldTabId] of tabByWebContentsId) {
          if (oldTabId === message.tabId && oldId !== message.webContentsId) {
            tabByWebContentsId.delete(oldId);
          }
        }
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
    case 'private-by-default':
      privateByDefault = message.enabled;
      break;
    case 'security-settings':
      setNetworkSecuritySettings({
        forceHttps: message.forceHttps,
        doNotTrack: message.doNotTrack,
        stripTracking: message.stripTracking,
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
    case 'reader-toggle': {
      const wc = guestContentsForTab(message.tabId);
      if (!wc || wc.isDestroyed()) return { ok: false, reason: 'tab-not-ready' };
      // SECURITY: the script is read from our own bundle here rather than
      // accepted over IPC. Taking a script string from the renderer made
      // `executeJavaScript` a general-purpose code-execution sink in every
      // guest page — harmless while the only caller was the trusted shell,
      // but an unacceptable primitive to leave lying around once model output
      // can influence renderer state.
      const activated = await wc.executeJavaScript(getReaderScript()).catch(() => false);
      return { ok: true, activated: Boolean(activated) };
    }
    case 'reader-is-active': {
      // Read the flag the injected script sets, so the toolbar reflects the
      // page's actual state after an in-page navigation rather than a stale
      // renderer-side guess.
      const wc = guestContentsForTab(message.tabId);
      if (!wc || wc.isDestroyed()) return false;
      return wc.executeJavaScript('!!window.__zyphoraReaderActive').catch(() => false);
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

// Chromium reads a few of these from command-line switches, so they must be
// appended before the app becomes ready.
applyStartupSwitches();

app.on('ready', async () => {
  initProxyAutoApply(); // must be before createWindow so session-created fires
  initCertificateMonitor();
  managedSessions.add(session.defaultSession);
  configureSessionPermissions(session.defaultSession, () => mainWindow);
  initDownloads(); // session will-download handler — before any webview exists
  registerPexelsHandlers(isTrustedMainFrame);
  registerDbHandlers();
  registerPrivacyHandlers();
  registerProxyHandlers();
  registerUpdaterHandlers();
  registerAdblockHandlers();
  registerCertHandlers();
  registerDnsHandlers();
  registerAgentHandlers();
  registerGeneralSettingsHandlers();
  configureGeneralSession(session.defaultSession);

  // Scheduled tasks reuse the ordinary agent run loop, so a task behaves
  // exactly as if the user had typed its prompt into the sidebar.
  setTaskRunner(async (task) => {
    const config = getAgentConfig();
    if (isAgentRunning()) return { ok: false, summary: 'The agent was busy.' };
    try {
      await runAgent(task.prompt, config);
      return { ok: true, summary: 'Completed.' };
    } catch (error) {
      return { ok: false, summary: error instanceof Error ? error.message : 'Failed.' };
    }
  });
  // Keep the browser lightweight on first launch: defer scheduled background work
  // until the app has already opened and the user is actively browsing.
  setTimeout(() => {
    startScheduler();
  }, 20_000);
  registerPermissionHandlers();
  registerShellHandlers();
  registerDownloadHandlers();

  // The window is shown first so the browser feels instant. Expensive tasks
  // that power the UI (DB, ad-block, engine startup, permission cache) are
  // completed in the background after the browser shell is already visible.
  await scheduleStartupBootstrap({
    openWindow: createWindow,
    tasks: [
      async () => {
        initAdblock(() => mainWindow?.webContents ?? null);
      },
      async () => {
        try {
          await initDb();
        } catch (error) {
          // The UI can still browse if local persistence is unavailable. Individual
          // database IPC calls will reject and the renderer displays empty state
          // instead of losing the entire browser window at startup.
          console.error('[db] initialization failed; continuing without persistence:', error);
        }
      },
      async () => {
        loadPermissionDecisions();
        hydrateClosedTabs();
      },
      async () => {
        // ── Application / Notification Engine ─────────────────────────────────────
        // Register adapter factories — add more providers here as they are built.
        applicationEngine.register('mock', (account) => new MockIntegration(account, 20_000));
        applicationEngine.register('gmail', (account) => new GmailAdapter(account));
        applicationEngine.register('whatsapp', (account) => new WhatsAppAdapter(account));
        // Start the engine (restores saved accounts, starts network/power monitors)
        await startEngine();
        // Register engine IPC handlers
        registerEngineHandlers(assertTrustedMainFrame);
      },
    ],
    onError: (error, index) => {
      console.error(`[startup:${index}] background bootstrap failed:`, error);
    },
  });

  void updateManager.initialize().catch((error) => {
    console.error('[updater] background initialization failed:', error);
  });

  // Ctrl/Cmd+J opens the Downloads page. This was a globalShortcut, which
  // registers at the OS level and stole the key from every other application
  // even when Zyphora was not focused. A Menu accelerator still fires while a
  // webview holds keyboard focus, without the system-wide grab.
  const downloadsMenu = Menu.buildFromTemplate([
    {
      label: 'Zyphora',
      submenu: [
        {
          label: 'Downloads',
          accelerator: 'CommandOrControl+J',
          click: () => createNewTab(INTERNAL_PAGES.downloads),
        },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
  ]);
  Menu.setApplicationMenu(downloadsMenu);
});

// A laptop suspending (or an OS-initiated shutdown that never reaches
// will-quit) would otherwise lose up to a second of debounced database writes.
powerMonitor.on('suspend', () => {
  flushDb();
});

app.on('will-quit', () => {
  stopScheduler();
  updateManager.dispose();
  void stopEngine().catch(() => { /* best effort */ });
  // Session-scoped memories are promised not to outlive the session.
  dropSessionMemories();
  flushWindowState();
  flushZoomLevels();
  flushPermissionDecisions();
  flushClosedTabsSave(closedTabRecords());
  // Write synchronously before the process goes away; the debounced timer
  // would otherwise be discarded along with the event loop.
  if (restoreSessionEnabled) {
    const { tabs: persisted, activeIndex } = persistableTabs();
    flushSessionSave(persisted, activeIndex);
  }
  closeDb();
});

// ── Webview preload path ──────────────────────────────────────────────────────

/** Absolute path of the guest preload for webviews (password capture + link handling). */
const capturePreloadPath = path.join(__dirname, '../preload/webviewPreload.js');

// Answered synchronously so the renderer has the path before the first
// <webview> mounts. Only the trusted shell frame may ask.
ipcMain.on('passwords:capture-preload-path', (event) => {
  event.returnValue = isTrustedMainFrame(event) ? capturePreloadPath : '';
});

// ── DB IPC handlers ──────────────────────────────────────────────────────────

function registerDbHandlers() {
  ipcMain.handle('db:history:get', (event, limit: unknown) => {
    assertTrustedMainFrame(event);
    // Sync needs a deeper window than the History page does. getHistory()
    // clamps to its own maximum, so an oversized request is harmless.
    const requested =
      typeof limit === 'number' && Number.isSafeInteger(limit) && limit > 0 ? limit : undefined;
    return getHistory(requested);
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
    clearClosedTabs();
    clearAgentProfile();
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

function registerUpdaterHandlers() {
  ipcMain.handle('updater:get-state', (event) => {
    assertTrustedMainFrame(event);
    return updateManager.getState();
  });
  ipcMain.handle('updater:check', async (event) => {
    assertTrustedMainFrame(event);
    await updateManager.checkForUpdates();
    return updateManager.getState();
  });
  ipcMain.handle('updater:download', async (event) => {
    assertTrustedMainFrame(event);
    await updateManager.downloadUpdate();
    return updateManager.getState();
  });
  ipcMain.handle('updater:install', (event) => {
    assertTrustedMainFrame(event);
    updateManager.installUpdate();
    return updateManager.getState();
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

function registerAgentHandlers() {
  initAgentRunner({
    guestForTab: (tabId) => guestContentsForTab(tabId),
    activeTabId: () => activeTabId,
    listTabs: () =>
      Array.from(tabs.values()).map((tab) => ({
        tabId: tab.id,
        title: tab.title,
        url: tab.url,
        active: tab.id === activeTabId,
      })),
    createTab: (url) => createNewTab(url),
    activateTab: (tabId) => {
      if (tabs.has(tabId)) {
        activeTabId = tabId;
        updateRendererState();
      }
    },
    closeTab: (tabId) => closeTab(tabId),
    navigate: (tabId, url) => {
      const normalized = normalizeNavigationUrl(url);
      if (!normalized) return;
      const wc = guestContentsForTab(tabId);
      if (wc && !wc.isDestroyed()) void wc.loadURL(normalized);
      const tab = tabs.get(tabId);
      if (tab) {
        tab.url = normalized;
        tab.loading = true;
        updateRendererState();
      }
    },
    emit: (event: AgentEvent) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('agent:event', event);
      }
    },
  });

  // ── Config ────────────────────────────────────────────────────────────────
  // The renderer is a view over main's config; every write goes through the
  // store so the policy floor is re-applied and the change is persisted.

  ipcMain.handle('agent:config:get', (event) => {
    assertTrustedMainFrame(event);
    return { config: getAgentConfig(), hasApiKey: hasApiKey() };
  });

  ipcMain.handle('agent:config:update', (event, patch: unknown) => {
    assertTrustedMainFrame(event);
    if (!isRecord(patch)) throw new Error('Invalid config patch.');
    // The store validates and clamps; a bad key simply loses to the default.
    return updateAgentConfig(patch as Partial<AgentConfig>);
  });

  ipcMain.handle('agent:config:reset', (event) => {
    assertTrustedMainFrame(event);
    return resetAgentConfig();
  });

  // ── Memory ────────────────────────────────────────────────────────────────

  ipcMain.handle('agent:memory:add', (event, content: unknown) => {
    assertTrustedMainFrame(event);
    if (!isBoundedString(content, 2_000)) throw new Error('Invalid memory.');
    return addMemory(content);
  });

  ipcMain.handle('agent:memory:update', (event, value: unknown) => {
    assertTrustedMainFrame(event);
    if (
      !isRecord(value) ||
      !isBoundedString(value.id, 100) ||
      !isBoundedString(value.content, 2_000)
    ) {
      throw new Error('Invalid memory.');
    }
    updateMemory(value.id, value.content);
    return getAgentConfig().memory;
  });

  ipcMain.handle('agent:memory:delete', (event, id: unknown) => {
    assertTrustedMainFrame(event);
    if (!isBoundedString(id, 100)) throw new Error('Invalid memory id.');
    deleteMemory(id);
    return getAgentConfig().memory;
  });

  ipcMain.handle('agent:memory:clear', (event) => {
    assertTrustedMainFrame(event);
    clearMemories();
    return getAgentConfig().memory;
  });

  // ── Activity ──────────────────────────────────────────────────────────────

  ipcMain.handle('agent:activity:clear', (event) => {
    assertTrustedMainFrame(event);
    clearActivity();
    return [];
  });

  // ── Files ─────────────────────────────────────────────────────────────────

  ipcMain.handle('agent:files:pick-folder', async (event) => {
    assertTrustedMainFrame(event);
    if (!mainWindow || mainWindow.isDestroyed()) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose a folder the agent may use',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
  });

  // ── Scheduled tasks ───────────────────────────────────────────────────────

  ipcMain.handle('agent:task:run-now', async (event, id: unknown) => {
    assertTrustedMainFrame(event);
    if (!isBoundedString(id, 100)) throw new Error('Invalid task id.');
    return runTaskNow(id);
  });

  /**
   * Ask Gemini which models this key can use. Runs here because the key never
   * leaves the main process; the renderer only ever sees the resulting list.
   */
  ipcMain.handle('agent:models:list', async (event) => {
    assertTrustedMainFrame(event);
    try {
      const { listModels } = await import('./agentModel');
      return { ok: true as const, models: await listModels() };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : 'Could not load the model list.',
      };
    }
  });

  ipcMain.handle('agent:key:set', (event, key: unknown) => {
    assertTrustedMainFrame(event);
    if (!isBoundedString(key, 500)) throw new Error('Invalid API key.');
    try {
      setApiKey(key);
      return { ok: true };
    } catch (error) {
      if (error instanceof AgentSecretUnavailableError) {
        return { ok: false, reason: 'keychain-unavailable' };
      }
      throw error;
    }
  });

  ipcMain.handle('agent:profile:get', (event) => {
    assertTrustedMainFrame(event);
    return getProfileForDisplay();
  });

  ipcMain.handle('agent:profile:set', (event, fields: unknown) => {
    assertTrustedMainFrame(event);
    if (!Array.isArray(fields) || fields.length > 100) throw new Error('Invalid profile.');
    const clean: AgentProfileField[] = [];
    for (const field of fields) {
      if (!isRecord(field)) continue;
      if (!isBoundedString(field.key, 100) || !isBoundedString(field.label, 200)) continue;
      if (!isBoundedString(field.value, 5_000)) continue;
      clean.push({
        key: field.key,
        label: field.label,
        value: field.value,
        secret: field.secret === true,
      });
    }
    try {
      setProfile(clean);
      return { ok: true };
    } catch (error) {
      if (error instanceof AgentSecretUnavailableError) {
        return { ok: false, reason: 'keychain-unavailable' };
      }
      throw error;
    }
  });

  ipcMain.handle('agent:run', async (event, goal: unknown) => {
    assertTrustedMainFrame(event);
    const config = getAgentConfig();
    if (config.autonomy === 'stopped') throw new Error('The agent is stopped.');
    if (!isBoundedString(goal, 10_000)) throw new Error('Invalid goal.');
    if (isAgentRunning()) throw new Error('The agent is already running.');
    void runAgent(goal, config);
    return { ok: true };
  });

  ipcMain.handle('agent:pause', (event) => {
    assertTrustedMainFrame(event);
    pauseAgent();
    return { ok: true };
  });

  ipcMain.handle('agent:resume', (event) => {
    assertTrustedMainFrame(event);
    resumeAgent();
    return { ok: true };
  });

  ipcMain.handle('agent:stop', (event) => {
    assertTrustedMainFrame(event);
    stopAgent();
    return { ok: true };
  });

  ipcMain.handle('agent:respond', (event, value: unknown) => {
    assertTrustedMainFrame(event);
    if (typeof value !== 'boolean' && !isBoundedString(value, 10_000)) {
      throw new Error('Invalid response.');
    }
    respondToAgent(value);
    return { ok: true };
  });
}

function registerDnsHandlers() {
  ipcMain.handle('dns:get-mode', (event) => {
    assertTrustedMainFrame(event);
    return getDnsMode();
  });
  ipcMain.handle('dns:set-mode', (event, mode: unknown) => {
    assertTrustedMainFrame(event);
    if (mode !== 'automatic' && mode !== 'secure') throw new Error('Invalid DNS mode.');
    setDnsMode(mode);
    return mode;
  });
}

/**
 * General settings the main process must enforce.
 *
 * The renderer store stays the single source of truth — these handlers only
 * receive its values and translate them into OS/Chromium state.
 */
function registerGeneralSettingsHandlers() {
  ipcMain.handle('general:apply', (event, value: unknown) => {
    assertTrustedMainFrame(event);
    if (!isRecord(value)) throw new Error('Invalid general settings.');
    const incoming = value as Record<string, unknown>;
    const merged: MainGeneralSettings = { ...getMainGeneralSettings(), ...incoming };

    // Field-by-field validation for security-critical settings.
    if (!isBoundedString(merged.acceptLanguages, 200)) {
      throw new Error('Invalid Accept-Language value.');
    }
    for (const key of ['defaultFontSize', 'minimumFontSize', 'defaultZoom'] as const) {
      if (typeof merged[key] !== 'number' || !Number.isFinite(merged[key])) {
        throw new Error(`Invalid ${key}.`);
      }
    }
    // Validate boolean fields.
    for (const key of [
      'askWhereToSave',
      'downloadNotifications',
      'autoOpenDownloads',
      'clearCompletedDownloads',
      'smoothScrolling',
      'keepOpenOnLastTabClose',
      'openTabsNextToCurrent',
      'switchToNewTab',
      'warnClosingMultipleTabs',
      'reopenClosedTabs',
      'caretBrowsing',
    ] as const) {
      if (typeof merged[key] !== 'boolean') {
        throw new Error(`Invalid ${key}.`);
      }
    }
    // Validate externalLinkTarget enum.
    if (
      merged.externalLinkTarget !== 'tab' &&
      merged.externalLinkTarget !== 'window'
    ) {
      throw new Error('Invalid externalLinkTarget.');
    }
    setMainGeneralSettings(merged);
    return merged;
  });

  ipcMain.handle('general:launch-at-login:get', (event) => {
    assertTrustedMainFrame(event);
    return getLaunchAtLogin();
  });

  ipcMain.handle('general:launch-at-login:set', (event, enabled: unknown) => {
    assertTrustedMainFrame(event);
    if (typeof enabled !== 'boolean') throw new Error('Invalid launch-at-login value.');
    return setLaunchAtLogin(enabled);
  });

  ipcMain.handle('general:default-browser:get', (event) => {
    assertTrustedMainFrame(event);
    return isDefaultBrowser();
  });

  ipcMain.handle('general:default-browser:set', (event) => {
    assertTrustedMainFrame(event);
    return makeDefaultBrowser();
  });
}

function registerCertHandlers() {
  ipcMain.handle('cert:get', (event, hostname: unknown) => {
    assertTrustedMainFrame(event);
    if (!isBoundedString(hostname, 253) || !/^[a-z\d.-]+$/i.test(hostname)) {
      throw new Error('Invalid certificate hostname.');
    }
    return getCertInfo(hostname);
  });
}

// ── Per-site permission IPC handlers ─────────────────────────────────────────

const PERMISSION_KEYS: ReadonlySet<string> = new Set([
  'media',
  'geolocation',
  'notifications',
  'clipboard-read',
  'clipboard-write',
  'display-capture',
  'fullscreen',
  'pointerLock',
  'midi',
  'midiSysex',
  'usb',
  'hid',
  'persistent-storage',
]);

function registerPermissionHandlers() {
  ipcMain.handle('permissions:list', (event) => {
    assertTrustedMainFrame(event);
    return getPermissionDecisions();
  });
  ipcMain.handle(
    'permissions:set',
    (event, host: unknown, permission: unknown, allowed: unknown) => {
      assertTrustedMainFrame(event);
      if (!isBoundedString(host, 253) || !/^[a-z\d.-]+$/i.test(host)) {
        throw new Error('Invalid host.');
      }
      if (!isBoundedString(permission, 64) || !PERMISSION_KEYS.has(permission)) {
        throw new Error('Invalid permission.');
      }
      if (typeof allowed !== 'boolean') throw new Error('Invalid allowed value.');
      setPermissionDecision(host, permission, allowed);
    }
  );
  ipcMain.handle('permissions:clear', (event, host: unknown, permission: unknown) => {
    assertTrustedMainFrame(event);
    if (!isBoundedString(host, 253) || !/^[a-z\d.-]+$/i.test(host)) {
      throw new Error('Invalid host.');
    }
    if (!isBoundedString(permission, 64) || !PERMISSION_KEYS.has(permission)) {
      throw new Error('Invalid permission.');
    }
    clearPermissionDecision(host, permission);
  });
  ipcMain.handle('permissions:reset-all', (event) => {
    assertTrustedMainFrame(event);
    clearPermissionDecisions();
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

// ── Search suggestions (Google Autocomplete) ────────────────────────────────
const suggestionCache = new Map<string, string[]>();
let suggestionAbort: AbortController | null = null;

ipcMain.handle('search-suggestions', async (_event, query: unknown) => {
  if (typeof query !== 'string' || !query.trim()) return [];
  const q = query.trim();
  const cached = suggestionCache.get(q);
  if (cached) return cached;

  suggestionAbort?.abort();
  suggestionAbort = new AbortController();
  try {
    const url = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { signal: suggestionAbort.signal });
    const data = await res.json();
    const suggestions: string[] = Array.isArray(data[1]) ? data[1] : [];
    suggestionCache.set(q, suggestions);
    if (suggestionCache.size > 200) {
      const first = suggestionCache.keys().next().value!;
      suggestionCache.delete(first);
    }
    return suggestions;
  } catch {
    return [];
  }
});

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
  if (process.platform === 'darwin') return;

  // "Let tasks run when the browser is closed" keeps the process alive after
  // the last window so the scheduler can still fire. Only honoured when there
  // is actually an active task to run — otherwise a user who enabled this once
  // would have an invisible process they cannot get rid of.
  const config = getAgentConfig();
  const hasPendingTasks =
    config.runWhenClosed &&
    config.autonomy !== 'stopped' &&
    config.tasks.some((task) => task.status === 'active');

  if (hasPendingTasks) {
    console.log('[agent] staying alive in the background for scheduled tasks');
    return;
  }

  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// ── OAuth navigation allowlist ───────────────────────────────────────────────

/**
 * Identity providers the auth flow is allowed to navigate to.
 *
 * SECURITY: these are matched against the parsed hostname, never with
 * `url.includes(...)`. Substring matching accepted `https://evil.com/?x=
 * google.com` and `https://google.com.attacker.net` as trusted providers.
 */
const OAUTH_PROVIDER_HOSTS = [
  'accounts.google.com',
  'github.com',
  'login.microsoftonline.com',
  'login.live.com',
];

/** The backend that issues and receives the OAuth redirect. */
function authApiHost(): string {
  const configured =
    process.env.VITE_API_BASE_URL || process.env.API_BASE_URL || 'https://api-zyphora.obliqllc.xyz';
  try {
    return new URL(configured).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/** True when `value`'s host is exactly `host` or a subdomain of it. */
function hostMatches(value: string, host: string): boolean {
  if (!host) return false;
  try {
    const hostname = new URL(value).hostname.toLowerCase().replace(/\.$/, '');
    return hostname === host || hostname.endsWith(`.${host}`);
  } catch {
    return false;
  }
}

/**
 * A URL that belongs to the sign-in flow: an identity provider, or the
 * Zyphora backend that mints the callback. Only https is accepted for remote
 * hosts; localhost is allowed over http for local backend development.
 */
function isOAuthFlowUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }

  const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if (isLocalhost) return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  if (parsed.protocol !== 'https:') return false;

  if (OAUTH_PROVIDER_HOSTS.some((host) => hostMatches(value, host))) return true;
  return hostMatches(value, authApiHost());
}

function isAuthCallbackUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'file:' && /\/auth-callback\.html$/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

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
      const allowed = isShell
        ? navigationUrl.startsWith('http://localhost') ||
          navigationUrl.startsWith('https://localhost') ||
          navigationUrl.startsWith('file://') ||
          isOAuthFlowUrl(navigationUrl)
        : isHttpNavigationUrl(navigationUrl) ||
          navigationUrl === 'about:blank' ||
          (isOAuthFlowUrl(navigationUrl) && contentsType === 'window') ||
          (isAuthCallbackUrl(navigationUrl) && contentsType === 'window');
      if (!allowed) event.preventDefault();
    });
  }

  if (contentsType === 'webview') {
    managedSessions.add(contents.session);
    attachAdblockToSession(contents.session);
    configureSessionPermissions(contents.session, () => mainWindow);
    attachDownloadsToSession(contents.session);
    configureGeneralSession(contents.session);
    // Webviews each get their own session, so the padlock needs a verify proc
    // installed here too — not just on the default session.
    attachCertificateMonitorToSession(contents.session);
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
      httpsUpgradeAttempts.delete(webviewId);
      paramStripAttempts.delete(webviewId);
    });

    // A remote page must not be able to navigate a guest into an internal or
    // local-file URL. Address-bar navigation is performed programmatically by
    // the trusted shell and is not affected by this event.
    contents.on('will-navigate', (event, navigationUrl) => {
      // Strip tracking parameters here, not just in the address bar. Most
      // utm_*/fbclid junk arrives via a link click or a redirect, neither of
      // which goes through the renderer's handleNavigate().
      if (isStripTrackingEnabled() && isHttpNavigationUrl(navigationUrl)) {
        const cleaned = stripTrackingParams(navigationUrl);
        if (cleaned !== navigationUrl && shouldAttemptParamStrip(contents.id, navigationUrl)) {
          event.preventDefault();
          void contents.loadURL(cleaned).catch((error: unknown) => {
            console.warn('[navigation] tracking-param strip failed:', error);
          });
          return;
        }
      }
      if (isForceHttpsEnabled()) {
        const upgraded = upgradeHttpUrl(navigationUrl);
        // Only upgrade a given URL once per guest. Without this an
        // https→http redirect chain loops forever, because loadURL() re-enters
        // this very handler.
        if (upgraded && shouldAttemptHttpsUpgrade(contents.id, navigationUrl)) {
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

    // Allow OAuth popups: the identity providers themselves and the Zyphora
    // backend that issues the auth URL and receives the callback redirect.
    // Only the trusted shell may open these; a webview asking for a provider
    // popup is a phishing vector, not a sign-in.
    const isOAuthPopup = contentsType === 'window' && isOAuthFlowUrl(url);

    if (isTrustedAuthPortal || isOAuthPopup) {
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
      // Accessibility font sizes and default zoom, from General settings.
      applyGuestPreferences(webPreferences);
    });
  }

  if (contentsType === 'webview') {
    contents.on('did-create-window', (popup, details) => {
      const openerTabId = tabByWebContentsId.get(contents.id);
      routePopupToTab(
        popup,
        openerTabId ? tabs.get(openerTabId)?.privateMode === true : false,
        details.url
      );
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
