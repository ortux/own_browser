/**
 * A registry mapping tabId → webview element reference.
 * This lets BrowserWindow trigger webview-level commands (back, forward,
 * reload, stop, find-in-page) without passing refs through the component tree.
 */

type WebviewEl = Electron.WebviewTag;
type FoundInPageListener = (event: Electron.FoundInPageEvent) => void;

const registry = new Map<string, WebviewEl>();
const findListeners = new Map<string, Set<FoundInPageListener>>();

export const webviewRegistry = {
  register(tabId: string, el: WebviewEl) {
    registry.set(tabId, el);
  },
  unregister(tabId: string) {
    registry.delete(tabId);
    findListeners.delete(tabId);
  },
  get(tabId: string): WebviewEl | undefined {
    return registry.get(tabId);
  },
  subscribeFind(tabId: string, listener: FoundInPageListener): () => void {
    const listeners = findListeners.get(tabId) ?? new Set<FoundInPageListener>();
    listeners.add(listener);
    findListeners.set(tabId, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) findListeners.delete(tabId);
    };
  },
  emitFind(tabId: string, event: Electron.FoundInPageEvent) {
    findListeners.get(tabId)?.forEach((listener) => listener(event));
  },
};
