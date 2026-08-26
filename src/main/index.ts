import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  clipboard,
  globalShortcut,
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
import { fetchProxy, applyProxy, clearProxy, verifyProxy, initProxyAutoApply } from './proxy';
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
  closeDb,
  initDb,
} from './db';
import { initAdblock, setAdblockEnabled, isAdblockEnabled, getBlockedCount } from './adblock';
import { initCertificateMonitor, getCertInfo } from './certificate';
import { configureAdGuardDns } from './dns';
import {
  initDownloads,
  setMainWindow,
  getDownloads,
  setDownloadPath,
  cancelDownload,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Runtime validation is still required even though the renderer is typed. */
function isRendererMessage(value: unknown): value is RendererToMainMessage {
  if (!isRecord(value) || typeof value.type !== 'string') return false;

  switch (value.type) {
    case 'create-tab':
    case 'get-state':
      return true;
    case 'navigate':
      return typeof value.tabId === 'string' && typeof value.url === 'string';
    case 'create-tab-url':
      return typeof value.url === 'string';
    case 'close-tab':
    case 'activate-tab':
    case 'duplicate-tab':
    case 'go-back':
    case 'go-forward':
    case 'reload':
    case 'stop':
      return typeof value.tabId === 'string';
    case 'webview-title-updated':
      return typeof value.tabId === 'string' && typeof value.title === 'string';
    case 'webview-favicon-updated':
      return typeof value.tabId === 'string' && typeof value.favicon === 'string';
    case 'webview-loading':
      return typeof value.tabId === 'string' && typeof value.loading === 'boolean';
    case 'webview-nav-state':
      return typeof value.tabId === 'string'
        && typeof value.url === 'string'
        && typeof value.canGoBack === 'boolean'
        && typeof value.canGoForward === 'boolean';
    default:
      return false;
  }
}

// Store for browser state
let mainWindow: BrowserWindow | null = null;
const tabs: Map<string, Tab> = new Map();
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

function createNewTab(rawUrl?: string): string {
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
    privateMode: false,
    muted: false,
    pinned: false,
  };

  tabs.set(tabId, tab);
  activeTabId = tabId;
  updateRendererState();

  return tabId;
}

function closeTab(tabId: string) {
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

function getState(): BrowserState {
  return {
    tabs: Array.from(tabs.values()),
    activeTabId,
  };
}

function updateRendererState() {
  if (mainWindow) {
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
  if (
    event.sender !== mainWindow?.webContents
    || event.senderFrame !== event.sender.mainFrame
  ) {
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
        createNewTab();
        break;
      case 'create-tab-url':
        createNewTab(message.url);
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
          createNewTab(tab.url);
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
          updateRendererState();
        }
        break;
      }
      case 'webview-favicon-updated': {
        const tab = tabs.get(message.tabId);
        if (tab) {
          tab.favicon = message.favicon;
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
          if (urlChanged && message.url !== 'about:blank') {
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
  initAdblock(() => mainWindow?.webContents ?? null);
  initDownloads(); // session will-download handler — before any webview exists
  await initDb();
  registerPexelsHandlers();
  registerDbHandlers();
  registerProxyHandlers();
  registerAdblockHandlers();
  registerCertHandlers();
  registerDownloadHandlers();
  createWindow();
  setMainWindow(mainWindow);

  // Global shortcut — opens the Downloads page as a new tab (zyphora://downloads).
  // Registered at the OS level so it fires even when a webview has keyboard focus.
  globalShortcut.register('CommandOrControl+J', () => {
    createNewTab('zyphora://downloads');
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// ── DB IPC handlers ──────────────────────────────────────────────────────────

function registerDbHandlers() {
  ipcMain.handle('db:history:get',    () => getHistory());
  ipcMain.handle('db:history:search', (_e, query: string) => searchHistory(query));
  ipcMain.handle('db:history:delete', (_e, id: number)    => deleteHistoryEntry(id));
  ipcMain.handle('db:history:clear',  ()                  => clearHistory());

  ipcMain.handle('db:bookmarks:get',    ()                                    => getBookmarks());
  ipcMain.handle('db:bookmarks:search', (_e, query: string)                   => searchBookmarks(query));
  ipcMain.handle('db:bookmarks:add',    (_e, url: string, title: string, favicon?: string) => addBookmark(url, title, favicon));
  ipcMain.handle('db:bookmarks:remove', (_e, url: string)                     => removeBookmark(url));
  ipcMain.handle('db:bookmarks:is',     (_e, url: string)                     => isBookmarked(url));
}

// ── Proxy IPC handlers ───────────────────────────────────────────────────────

function registerProxyHandlers() {
  // fetchProxy is synchronous — no async needed
  ipcMain.handle('proxy:fetch',  () => fetchProxy());
  ipcMain.handle('proxy:apply',  async (_e, proxy) => applyProxy(proxy));
  ipcMain.handle('proxy:clear',  async () => clearProxy());
  ipcMain.handle('proxy:verify', async (_e, proxy) => verifyProxy(proxy));
}

// ── Ad blocker IPC handlers ──────────────────────────────────────────────────

function registerAdblockHandlers() {
  ipcMain.handle('adblock:set',  (_e, value: boolean) => {
    setAdblockEnabled(Boolean(value));
    return isAdblockEnabled();
  });
  ipcMain.handle('adblock:get',  () => isAdblockEnabled());
  ipcMain.handle('adblock:stats', () => ({ enabled: isAdblockEnabled(), blocked: getBlockedCount() }));
}

// ── Certificate IPC handlers ─────────────────────────────────────────────────

function registerCertHandlers() {
  ipcMain.handle('cert:get', (_e, hostname: string) => getCertInfo(hostname));
}

// ── Downloads IPC handlers ────────────────────────────────────────────────────

function registerDownloadHandlers() {
  ipcMain.handle('download:list',         () => getDownloads());
  ipcMain.handle('download:set-path',     (_e, p: string) => setDownloadPath(p));
  ipcMain.handle('download:default-path', () => getDownloadPath());
  ipcMain.handle('download:pick-folder',  async () => pickFolder());
  ipcMain.handle('download:cancel',       (_e, id: string) => cancelDownload(id));
  ipcMain.handle('download:remove',       (_e, id: string) => removeDownload(id));
  ipcMain.handle('download:clear',        () => clearDownloads());
  ipcMain.handle('download:open',         (_e, id: string) => openDownload(id));
  ipcMain.handle('download:show',         (_e, id: string) => showDownload(id));
  ipcMain.handle('download:reveal-folder', () => revealFolder());
}

// Window control IPC (used by custom title bar buttons)
ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window:close', () => mainWindow?.close());

app.on('window-all-closed', () => {
  closeDb();
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

  // Only restrict the top-level renderer (not embedded webviews).
  if (contentsType === 'window') {
    contents.on('will-navigate', (event, navigationUrl) => {
      const allowed =
        navigationUrl.startsWith('http://localhost') ||
        navigationUrl.startsWith('https://localhost') ||
        navigationUrl.startsWith('file://');
      if (!allowed) {
        event.preventDefault();
      }
    });
  }

  if (contentsType === 'webview') {
    // Use the sanitized, Chrome-compatible UA from the very first request.
    // Some Google/YouTube clients detect the Electron token and return a page
    // shell whose player and interactive API calls are restricted.
    contents.setUserAgent(app.userAgentFallback);
  }

  // A browser must support target=_blank/window.open, but untrusted pages must
  // not create unmanaged Electron BrowserWindows. Route safe web URLs into our
  // own tab model and deny the native popup. This restores links and controls
  // that previously appeared to do nothing while preserving the sandbox.
  contents.setWindowOpenHandler(({ url }) => {
    if (contentsType === 'webview' && canOpenInTab(url)) {
      createNewTab(url);
    }
    return { action: 'deny' };
  });

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

    if (items.length === 0) {
      items.push({ role: 'selectAll' });
    }

    Menu.buildFromTemplate(items).popup();
  });
});
