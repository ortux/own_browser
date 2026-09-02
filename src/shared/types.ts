/**
 * Shared types for IPC communication between Electron and Renderer
 * SECURITY: These types define the contract for all inter-process communication.
 * All IPC messages must conform to these types.
 */

export interface Tab {
  id: string;
  url: string;
  title: string;
  favicon?: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  privateMode: boolean;
  muted: boolean;
  pinned: boolean;
}

export interface BrowserState {
  tabs: Tab[];
  activeTabId: string;
}

// A background image fetched from the Pexels API
export interface PexelsImage {
  url: string;
  photographer: string;
  link: string;
  query: string;
}

// IPC Messages from Renderer to Main
export type RendererToMainMessage =
  | { type: 'navigate'; tabId: string; url: string }
  | { type: 'go-back'; tabId: string }
  | { type: 'go-forward'; tabId: string }
  | { type: 'reload'; tabId: string }
  | { type: 'stop'; tabId: string }
  | { type: 'create-tab'; privateMode?: boolean }
  | { type: 'close-tab'; tabId: string }
  | { type: 'activate-tab'; tabId: string }
  | { type: 'duplicate-tab'; tabId: string }
  | { type: 'restore-closed-tab'; index?: number }
  | { type: 'get-closed-tabs' }
  | { type: 'get-state' }
  // Webview lifecycle events (sent by WebView.tsx)
  | { type: 'webview-title-updated'; tabId: string; title: string }
  | { type: 'webview-favicon-updated'; tabId: string; favicon: string }
  | { type: 'webview-loading'; tabId: string; loading: boolean }
  | {
      type: 'webview-nav-state';
      tabId: string;
      url: string;
      canGoBack: boolean;
      canGoForward: boolean;
    }
  | { type: 'webview-attached'; tabId: string; webContentsId: number }
  // Open a new tab directly at a given URL (used for internal pages like downloads)
  | { type: 'create-tab-url'; url: string; privateMode?: boolean }
  // Synchronise network privacy settings from the renderer.
  | { type: 'security-settings'; forceHttps: boolean; doNotTrack: boolean }
  | { type: 'session-restore-setting'; enabled: boolean }
  | { type: 'zoom-get'; url: string }
  | { type: 'zoom-set'; url: string; factor: number }
  | { type: 'history-retention'; days: number }
  | { type: 'set-tab-private'; tabId: string; privateMode: boolean }
  // Respond to a permission prompt shown by the renderer (Allow / Block).
  | { type: 'permission-response'; requestId: string; allow: boolean }
  // Credentials captured from a login form inside a webview
  | {
      type: 'webview-credentials';
      tabId: string;
      origin: string;
      username: string;
      password: string;
      title: string;
      favicon?: string;
    }
  // Autofill credentials into a webview's login form
  | { type: 'autofill-credentials'; tabId: string; username: string; password: string };
// IPC Messages from Main to Renderer
export type MainToRendererMessage =
  | { type: 'state-updated'; state: BrowserState }
  | { type: 'tab-loading'; tabId: string; loading: boolean }
  | { type: 'tab-title-updated'; tabId: string; title: string }
  | { type: 'tab-favicon-updated'; tabId: string; favicon?: string }
  | { type: 'tab-navigation-state'; tabId: string; canGoBack: boolean; canGoForward: boolean }
  // Ask the renderer to show a permission prompt for a webview guest.
  | { type: 'permission-request'; request: PermissionRequest }
  // Ask the renderer to show a "Save password?" prompt.
  | {
      type: 'save-password-prompt';
      origin: string;
      username: string;
      password: string;
      title: string;
      favicon?: string;
    };

// ── Persistence types (mirrored from main/db.ts for use in renderer) ─────────

export interface HistoryEntry {
  id: number;
  url: string;
  title: string;
  favicon: string | null;
  visited_at: number; // unix ms
}

export interface Bookmark {
  id: number;
  url: string;
  title: string;
  favicon: string | null;
  created_at: number; // unix ms
}

// A tracked download in the browser
export interface BlockedRequest {
  url: string;
  type: string;
  timestamp: number;
}

// A permission request surfaced to the renderer as a custom in-app dialog.
export interface PermissionRequest {
  requestId: string;
  host: string;
  permission: string;
  label: string;
  mediaTypes?: string[];
}

export interface Download {
  id: string;
  filename: string;
  url: string;
  state: 'progressing' | 'completed' | 'interrupted' | 'canceled';
  receivedBytes: number;
  totalBytes: number;
  percent: number; // 0..1
  path: string;
  startTime: number;
  endTime: number | null;
}

// IPC channels for DB operations (all go through ipcRenderer.invoke)
export type DbChannel =
  // History
  | 'db:history:get'
  | 'db:history:search'
  | 'db:history:delete'
  | 'db:history:clear'
  // Bookmarks
  | 'db:bookmarks:get'
  | 'db:bookmarks:add'
  | 'db:bookmarks:remove'
  | 'db:bookmarks:is'
  | 'db:bookmarks:search'
  // Passwords
  | 'db:passwords:get-all'
  | 'db:passwords:get-for-origin'
  | 'db:passwords:get-by-id'
  | 'db:passwords:save'
  | 'db:passwords:delete'
  | 'db:passwords:clear'
  | 'db:passwords:search';

// ── Saved password (mirrored from main/db.ts) ─────────────────────────────────
export interface SavedPassword {
  id: number;
  origin: string;
  username: string;
  password?: string; // omitted in list views, present in get-by-id
  title: string;
  favicon: string | null;
  created_at: number;
  updated_at: number;
}

// ── Proxy IPC channels ────────────────────────────────────────────────────────
// proxy:fetch   — () => ProxyInfo           fetch a proxy from local configuration
// proxy:apply   — (proxy: ProxyInfo) => void   apply proxy to Electron session
// proxy:clear   — () => void               remove proxy, use direct connection
// proxy:verify  — (proxy: ProxyInfo) => boolean  check proxy is alive
export type ProxyChannel = 'proxy:fetch' | 'proxy:apply' | 'proxy:clear' | 'proxy:verify';

// ── Downloads IPC channels ─────────────────────────────────────────────────────
// download:list        — () => Download[]
// download:set-path    — (path: string) => void
// download:pick-folder — () => string | null   open a folder picker (main only)
// download:default-path— () => string          default OS downloads dir
// download:cancel      — (id: string) => void
// download:retry       — (id: string) => void
// download:remove      — (id: string) => void  remove from history list
// download:clear       — () => void
// download:open        — (id: string) => void  open the file
// download:show        — (id: string) => void  reveal in file manager
// download:reveal-folder — () => void          open the save folder itself
export type DownloadChannel =
  | 'download:list'
  | 'download:set-path'
  | 'download:pick-folder'
  | 'download:default-path'
  | 'download:cancel'
  | 'download:retry'
  | 'download:remove'
  | 'download:clear'
  | 'download:open'
  | 'download:show'
  | 'download:reveal-folder';
