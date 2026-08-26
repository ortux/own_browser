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
// Proxy credentials must never be committed to the repository. Configure an
// optional comma-separated list through ZYPHORA_PROXY_LIST instead.
function configuredProxyList(): string[] {
  return (process.env.ZYPHORA_PROXY_LIST ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseProxy(raw: string) {
  const [ip, port, user, pass] = raw.split(':');
  return { ip, port, user, pass };
}

// ── Auth state ────────────────────────────────────────────────────────────────

let currentAuth: { user: string; pass: string } | null = null;
let lastProxyRules: string | null = null;
const credentialsByProxy = new Map<string, { user: string; pass: string }>();

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

/** Pick a random proxy from the configured list. */
export function fetchProxy(): ProxyInfo {
  const proxies = configuredProxyList();
  if (proxies.length === 0) {
    throw new Error('No proxy configured. Set ZYPHORA_PROXY_LIST to ip:port:user:password entries.');
  }
  const raw = proxies[Math.floor(Math.random() * proxies.length)];
  const { ip, port, user, pass } = parseProxy(raw);
  if (!ip || !port || !/^\d+$/.test(port)) {
    throw new Error('Invalid proxy entry. Expected ip:port:user:password.');
  }

  const ipPort = `${ip}:${port}`;
  // Keep credentials in the main process only. The renderer receives the
  // endpoint metadata but never gets a password to persist in localStorage.
  credentialsByProxy.set(ipPort, { user: user ?? '', pass: pass ?? '' });

  return {
    ip,
    port,
    ipPort,
    country: 'US',
    type: 'http',
    proxyLevel: 'anonymous',
    supportsHttps: true,
    speed: 1,
    fetchedAt: Date.now(),
  };
}

/** Apply proxy to ALL active sessions (default session + any webview partitions). */
export async function applyProxy(proxy: ProxyInfo): Promise<void> {
  const credentials = credentialsByProxy.get(proxy.ipPort);
  const user = credentials?.user ?? '';
  const pass = credentials?.pass ?? '';

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

/** Verify the proxy through Electron's session network stack. */
export async function verifyProxy(_proxy: ProxyInfo): Promise<boolean> {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 10_000);
    // Node's global fetch bypasses Electron's session proxy. `Session.fetch`
    // uses the same Chromium network stack as the webview, so this actually
    // tests the proxy the user just enabled.
    const res = await session.defaultSession.fetch('https://api.ipify.org?format=json', {
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
