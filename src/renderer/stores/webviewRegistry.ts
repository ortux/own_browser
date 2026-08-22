/**
 * A simple registry mapping tabId → webview element reference.
 * This lets BrowserWindow trigger webview-level commands (back, forward,
 * reload, stop) without passing refs through the component tree.
 */

type WebviewEl = Electron.WebviewTag;

const registry = new Map<string, WebviewEl>();

export const webviewRegistry = {
  register(tabId: string, el: WebviewEl) {
    registry.set(tabId, el);
  },
  unregister(tabId: string) {
    registry.delete(tabId);
  },
  get(tabId: string): WebviewEl | undefined {
    return registry.get(tabId);
  },
};
