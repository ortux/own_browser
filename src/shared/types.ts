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

// IPC Messages from Renderer to Main
export type RendererToMainMessage =
  | { type: 'navigate'; tabId: string; url: string }
  | { type: 'go-back'; tabId: string }
  | { type: 'go-forward'; tabId: string }
  | { type: 'reload'; tabId: string }
  | { type: 'stop'; tabId: string }
  | { type: 'create-tab' }
  | { type: 'close-tab'; tabId: string }
  | { type: 'activate-tab'; tabId: string }
  | { type: 'duplicate-tab'; tabId: string }
  | { type: 'get-state' }
  // Webview lifecycle events (sent by WebView.tsx)
  | { type: 'webview-title-updated'; tabId: string; title: string }
  | { type: 'webview-favicon-updated'; tabId: string; favicon: string }
  | { type: 'webview-loading'; tabId: string; loading: boolean }
  | { type: 'webview-nav-state'; tabId: string; url: string; canGoBack: boolean; canGoForward: boolean };

// IPC Messages from Main to Renderer
export type MainToRendererMessage =
  | { type: 'state-updated'; state: BrowserState }
  | { type: 'tab-loading'; tabId: string; loading: boolean }
  | { type: 'tab-title-updated'; tabId: string; title: string }
  | { type: 'tab-favicon-updated'; tabId: string; favicon?: string }
  | { type: 'tab-navigation-state'; tabId: string; canGoBack: boolean; canGoForward: boolean };
