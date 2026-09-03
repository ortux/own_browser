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
const knownSessions = new Set<Electron.Session>();

export function forgetProxySession(ses: Electron.Session): void {
  knownSessions.delete(ses);
}

/**
 * Apply proxy config to a single session instance.
 */
async function applyToSession(ses: Electron.Session, proxyRules: string): Promise<void> {
  await ses.setProxy({
    // Credentials are handled by the app-level login event below. Chromium
    // does not accept credentials embedded in proxyRules.
    proxyRules,
    // Only loopback and LAN destinations bypass the proxy.
    //
    // Google used to be bypassed here because shared public proxies are often
    // blocked by it — but that silently routed searches, the default engine,
    // over the direct connection while the UI reported the proxy as active.
    // A privacy control that quietly exempts the largest tracker is worse than
    // no control at all; if a proxy cannot reach Google, verification fails and
    // the user is told.
    proxyBypassRules: 'localhost,127.0.0.1,<local>',
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Pick a random proxy from the configured list. */
export function fetchProxy(): ProxyInfo {
  const proxies = configuredProxyList();
  if (proxies.length === 0) {
    throw new Error(
      'No proxy configured. Set ZYPHORA_PROXY_LIST to ip:port:user:password entries.'
    );
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
  const nextAuth = credentials?.user ? { user: credentials.user, pass: credentials.pass } : null;
  const nextRules = `http://${proxy.ipPort}`;
  const previousAuth = currentAuth;
  const previousRules = lastProxyRules;

  try {
    // Keep credentials out of proxyRules. Electron requests them through the
    // `login` event when the proxy challenges the browser.
    await applyToSession(session.defaultSession, nextRules);
    knownSessions.add(session.defaultSession);
    await Promise.all(
      [...knownSessions]
        .filter((ses) => ses !== session.defaultSession)
        .map((ses) => applyToSession(ses, nextRules))
    );
    currentAuth = nextAuth;
    lastProxyRules = nextRules;
  } catch (error) {
    // Do not leave a half-applied proxy behind when one session fails.
    const rollbackRules = previousRules ?? 'direct://';
    try {
      await applyToSession(session.defaultSession, rollbackRules);
      await Promise.all(
        [...knownSessions]
          .filter((ses) => ses !== session.defaultSession)
          .map((ses) => applyToSession(ses, rollbackRules))
      );
    } catch {
      // Best effort; the caller still receives the original failure.
    }
    currentAuth = previousAuth;
    lastProxyRules = previousRules;
    throw error;
  }
}

/** Remove proxy from all sessions and restore direct connection. */
export async function clearProxy(): Promise<void> {
  currentAuth = null;
  lastProxyRules = null;

  knownSessions.add(session.defaultSession);
  await Promise.all([...knownSessions].map((ses) => ses.setProxy({ proxyRules: 'direct://' })));
}

/** Verify the proxy through Electron's session network stack. */
export async function verifyProxy(_proxy: ProxyInfo): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    // Node's global fetch bypasses Electron's session proxy. `Session.fetch`
    // uses the same Chromium network stack as the webview, so this actually
    // tests the proxy the user just enabled.
    const res = await session.defaultSession.fetch('https://api.ipify.org?format=json', {
      signal: controller.signal,
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { ip?: unknown };
    return typeof body.ip === 'string' && body.ip.length > 0;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Call once in app.on('ready') so that any new session created for a
 * webview partition automatically gets the current proxy applied.
 * Also registers the app-level login handler for proxy auth challenges.
 */
export function initProxyAutoApply() {
  knownSessions.add(session.defaultSession);

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
    knownSessions.add(ses);
    if (lastProxyRules) {
      applyToSession(ses, lastProxyRules).catch(() => {
        /* best-effort */
      });
    }
  });
}
