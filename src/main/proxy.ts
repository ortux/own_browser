/**
 * proxy.ts — Proxy management for Zyphora
 *
 * Applies an authenticated HTTP proxy to ALL Electron sessions so that
 * <webview> tags (which run in their own session) also route through it.
 *
 * Proxy credentials are supplied through Electron's app-level login event.
 */

import { session, app } from 'electron';
import type { ProxyInfo } from '../renderer/stores/settingsStore';

// ── Proxy list (ip:port:user:pass) ────────────────────────────────────────────

const PROXY_LIST = [
  '31.59.20.176:6754:jltrbfmt:xreeygxmp44q',
  '31.56.127.193:7684:jltrbfmt:xreeygxmp44q',
  '45.38.107.97:6014:jltrbfmt:xreeygxmp44q',
  '198.105.121.200:6462:jltrbfmt:xreeygxmp44q',
  '64.137.96.74:6641:jltrbfmt:xreeygxmp44q',
  '198.23.243.226:6361:jltrbfmt:xreeygxmp44q',
  '38.154.185.97:6370:jltrbfmt:xreeygxmp44q',
  '84.247.60.125:6095:jltrbfmt:xreeygxmp44q',
  '142.111.67.146:5611:jltrbfmt:xreeygxmp44q',
  '191.96.254.138:6185:jltrbfmt:xreeygxmp44q',
];

function parseProxy(raw: string) {
  const [ip, port, user, pass] = raw.split(':');
  return { ip, port, user, pass };
}

// ── Auth state ────────────────────────────────────────────────────────────────

let currentAuth: { user: string; pass: string } | null = null;
let lastProxyRules: string | null = null;

/**
 * Apply proxy config to a single session instance.
 */
async function applyToSession(
  ses: Electron.Session,
  proxyRules: string
): Promise<void> {
  await ses.setProxy({
    // Credentials are handled by the app-level login event below. Chromium
    // does not accept credentials embedded in proxyRules.
    proxyRules,
    // Shared public proxies are commonly blocked by Google. Keep Google on
    // the user's direct connection so normal searches remain usable.
    proxyBypassRules: 'localhost,127.0.0.1,<local>,google.com,*.google.com',
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Pick a random proxy from the built-in list. */
export function fetchProxy(): ProxyInfo {
  const raw = PROXY_LIST[Math.floor(Math.random() * PROXY_LIST.length)];
  const { ip, port, user, pass } = parseProxy(raw);

  return {
    ip,
    port,
    ipPort: `${ip}:${port}`,
    country: 'US',
    type: 'http',
    proxyLevel: 'anonymous',
    supportsHttps: true,
    speed: 1,
    fetchedAt: Date.now(),
    username: user,
    password: pass,
  } as ProxyInfo;
}

/** Apply proxy to ALL active sessions (default session + any webview partitions). */
export async function applyProxy(
  proxy: ProxyInfo & { username?: string; password?: string }
): Promise<void> {
  const user = proxy.username ?? '';
  const pass = proxy.password ?? '';

  // Store for login event handlers
  currentAuth = user ? { user, pass } : null;

  // Keep credentials out of proxyRules. Electron requests them through the
  // `login` event when the proxy challenges the browser.
  const proxyRules = `http://${proxy.ipPort}`;
  lastProxyRules = proxyRules;

  // Apply to the default session (main window)
  await applyToSession(session.defaultSession, proxyRules);

  // Apply to all existing named sessions (webview partitions created so far)
  const allSessions = getAllSessions();
  await Promise.all(allSessions.map((ses) => applyToSession(ses, proxyRules)));
}

/** Remove proxy from all sessions and restore direct connection. */
export async function clearProxy(): Promise<void> {
  currentAuth = null;
  lastProxyRules = null;

  const allSessions = [session.defaultSession, ...getAllSessions()];
  await Promise.all(
    allSessions.map((ses) => ses.setProxy({ proxyRules: 'direct://' }))
  );
}

/**
 * Get all named/partitioned sessions that Electron has created.
 * Electron doesn't expose a "list all sessions" API, so we use the
 * fromPartition helper for known partition names. Webviews without
 * an explicit partition use the default session (already handled).
 */
function getAllSessions(): Electron.Session[] {
  const sessions: Electron.Session[] = [];
  // Try common partition names used by webviews
  for (const name of ['persist:default', 'webview']) {
    try {
      const ses = session.fromPartition(name, { cache: false });
      if (ses && ses !== session.defaultSession) sessions.push(ses);
    } catch { /* partition doesn't exist yet */ }
  }
  return sessions;
}

/** Verify the proxy is working by fetching through the already-applied session. */
export async function verifyProxy(_proxy: ProxyInfo): Promise<boolean> {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch('http://ipv4.webshare.io/', {
      signal: controller.signal,
    });
    clearTimeout(id);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Call once in app.on('ready') so that any new session created for a
 * webview partition automatically gets the current proxy applied.
 * Also registers the app-level login handler for proxy auth challenges.
 */
export function initProxyAutoApply() {
  // Proxy auth challenges are fired on app, not on session.
  // This single handler covers ALL webcontents including webview tags.
  app.on('login', (_event, _webContents, _req, authInfo, callback) => {
    if (authInfo.isProxy && currentAuth) {
      callback(currentAuth.user, currentAuth.pass);
    } else {
      callback('', '');
    }
  });

  // When Electron creates a new session for a webview partition,
  // apply the current proxy config to it automatically.
  app.on('session-created', (ses) => {
    if (lastProxyRules) {
      applyToSession(ses, lastProxyRules).catch(() => { /* best-effort */ });
    }
  });
}
