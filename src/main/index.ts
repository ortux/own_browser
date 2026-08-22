import {
  app,
  BrowserWindow,
  ipcMain,
} from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Tab, BrowserState, RendererToMainMessage } from '../shared/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Store for browser state
let mainWindow: BrowserWindow | null = null;
let tabs: Map<string, Tab> = new Map();
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
  const url = isDev
    ? 'http://localhost:5173'
    : `file://${path.join(__dirname, '../renderer/index.html')}`;

  mainWindow.loadURL(url);

  // Open DevTools in development
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Initialize with first tab
  createNewTab();
}

function createNewTab(url?: string): string {
  const tabId = `tab-${nextTabId++}`;
  const tab: Tab = {
    id: tabId,
    url: url || 'about:blank',
    title: url ? 'Loading...' : 'New Tab',
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
  // SECURITY: Verify sender is the main window
  if (event.senderFrame.parent === null) {
    // This is a top-level frame
    switch (message.type) {
      case 'navigate': {
        const tab = tabs.get(message.tabId);
        if (tab) {
          tab.url = normalizeUrl(message.url);
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
      case 'close-tab':
        closeTab(message.tabId);
        break;
      case 'activate-tab':
        activeTabId = message.tabId;
        updateRendererState();
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
          tab.url = message.url;
          tab.canGoBack = message.canGoBack;
          tab.canGoForward = message.canGoForward;
          tab.loading = false;
          updateRendererState();
        }
        break;
      }
    }
  }

  return { success: true };
});

/**
 * URL normalization: Convert user input to valid URL.
 * The renderer now sends pre-built search URLs, so this function
 * only needs to handle bare domain inputs.
 * "google.com" → "https://google.com"
 * "https://example.com" → unchanged
 */
function normalizeUrl(input: string): string {
  const trimmed = input.trim();

  // Already a full URL (http/https/file/about)
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('file://') ||
    trimmed.startsWith('about:')
  ) {
    return trimmed;
  }

  // Bare domain — add https://
  return `https://${trimmed}`;
}

app.on('ready', createWindow);

// Window control IPC (used by custom title bar buttons)
ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window:close', () => mainWindow?.close());

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
  // Only restrict the top-level renderer (not embedded webviews)
  if (contents.getType() === 'window') {
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

  // Prevent web content from opening new OS windows
  contents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });
});
