import { session } from 'electron';
import type { PermissionRequest } from '../shared/types';
import { DebouncedWriter, readJsonFile, isRecord } from './jsonStore';

const decisions = new Map<string, boolean>();
const configuredSessions = new WeakSet<Electron.Session>();

interface PendingRequest {
  callback: (allowed: boolean) => void;
  timer: ReturnType<typeof setTimeout>;
  key: string;
  /** The decision table this request belongs to (default or a private session). */
  table: Map<string, boolean>;
}

const pending = new Map<string, PendingRequest>();
const pendingByKey = new Map<string, string>();
let nextPermId = 1;

const PERMISSION_LABELS: Record<string, string> = {
  geolocation: 'your location',
  notifications: 'desktop notifications',
  'clipboard-read': 'your clipboard',
  'clipboard-write': 'your clipboard',
  'display-capture': 'your screen',
  fullscreen: 'fullscreen',
  pointerLock: 'pointer lock',
  midi: 'MIDI devices',
  midiSysex: 'MIDI devices',
  usb: 'USB devices',
  hid: 'HID devices',
  'persistent-storage': 'storage on this device',
};

function hostFromUrl(value: string): string {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function decisionKey(host: string, permission: string): string {
  return `${host}\0${permission}`;
}

function labelFor(permission: string, mediaTypes?: string[]): string {
  if (permission === 'media') {
    const types = mediaTypes ?? [];
    const hasVideo = types.includes('video');
    const hasAudio = types.includes('audio');
    if (hasVideo && hasAudio) return 'your camera and microphone';
    if (hasVideo) return 'your camera';
    if (hasAudio) return 'your microphone';
    return 'your camera and microphone';
  }
  return PERMISSION_LABELS[permission] ?? permission;
}

/**
 * Per-session decisions for private tabs.
 *
 * Normal tabs share the default session; a private tab gets its own `temp:`
 * partition. Keying every decision by host alone meant an "Allow camera" made
 * in a normal tab silently applied inside private tabs too, and a grant made
 * in a private tab outlived it. Private sessions get their own table, which
 * disappears with the session.
 */
const ephemeralDecisions = new WeakMap<Electron.Session, Map<string, boolean>>();

function decisionsFor(ses: Electron.Session): Map<string, boolean> {
  if (ses === session.defaultSession) return decisions;
  let table = ephemeralDecisions.get(ses);
  if (!table) {
    table = new Map<string, boolean>();
    ephemeralDecisions.set(ses, table);
  }
  return table;
}

/** Install conservative, user-visible permission handling for a session. */
export function configureSessionPermissions(
  ses: Electron.Session,
  getWindow: () => Electron.BrowserWindow | null
): void {
  if (configuredSessions.has(ses)) return;
  configuredSessions.add(ses);

  const table = decisionsFor(ses);

  ses.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
    const host = hostFromUrl(requestingOrigin || webContents?.getURL() || '');
    return table.get(decisionKey(host, permission)) === true;
  });

  ses.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const host = hostFromUrl(details.requestingUrl || webContents.getURL());
    if (
      !host ||
      permission === 'openExternal' ||
      permission === 'unknown' ||
      permission === 'fileSystem'
    ) {
      safeCallback(callback, false);
      return;
    }

    const key = decisionKey(host, permission);
    const existing = table.get(key);
    if (existing !== undefined) {
      safeCallback(callback, existing);
      return;
    }

    const window = getWindow();
    if (!window || window.isDestroyed()) {
      safeCallback(callback, false);
      return;
    }

    // `mediaTypes` only exists on the media variant of the details union.
    const mediaTypes = (details as { mediaTypes?: string[] }).mediaTypes;

    // If a prompt for this exact host+permission is already open, don't
    // duplicate it — the user's answer will apply to both requests.
    const existingId = pendingByKey.get(key);
    if (existingId) return;

    const requestId = `perm-${nextPermId++}`;
    const request: PermissionRequest = {
      requestId,
      host,
      permission,
      label: labelFor(permission, mediaTypes),
      mediaTypes,
    };

    const timer = setTimeout(() => {
      const rec = pending.get(requestId);
      if (rec) {
        clearTimeout(rec.timer);
        pending.delete(requestId);
        pendingByKey.delete(rec.key);
        rec.table.set(rec.key, false);
        safeCallback(callback, false);
      }
    }, 60_000);

    pending.set(requestId, { callback, timer, key, table });
    pendingByKey.set(key, requestId);

    try {
      // The guest has no preload of its own, so the prompt must be shown by the
      // shell window (whose preload exposes onPermissionRequest). Route it there.
      window.webContents.send('permission-request', request);
    } catch {
      clearTimeout(timer);
      pending.delete(requestId);
      pendingByKey.delete(key);
      safeCallback(callback, false);
    }
  });
}

/** Resolve a pending permission prompt from the renderer's Allow/Block choice. */
export function handlePermissionResponse(requestId: string, allow: boolean): void {
  const rec = pending.get(requestId);
  if (!rec) return;
  clearTimeout(rec.timer);
  pending.delete(requestId);
  pendingByKey.delete(rec.key);
  rec.table.set(rec.key, allow);
  safeCallback(rec.callback, allow);
}

function safeCallback(callback: (allowed: boolean) => void, allowed: boolean): void {
  try {
    callback(allowed);
  } catch {
    // The requesting webContents may already be gone; nothing to do.
  }
}

export function clearPermissionDecisions(): void {
  decisions.clear();
  persistDecisions();
}

/** Snapshot of all current host+permission decisions, grouped by host. */
export function getPermissionDecisions(): Record<string, Record<string, boolean>> {
  const out: Record<string, Record<string, boolean>> = {};
  for (const [key, allowed] of decisions) {
    const sep = key.indexOf('\0');
    if (sep < 0) continue;
    const host = key.slice(0, sep);
    const perm = key.slice(sep + 1);
    if (!out[host]) out[host] = {};
    out[host][perm] = allowed;
  }
  return out;
}

/** Set or clear (allowed=false) a single host+permission decision. */
export function setPermissionDecision(host: string, permission: string, allowed: boolean): void {
  if (!host) return;
  decisions.set(decisionKey(host, permission), allowed);
  persistDecisions();
}

/** Remove a single host+permission decision entirely (falls back to prompt). */
export function clearPermissionDecision(host: string, permission: string): void {
  decisions.delete(decisionKey(host, permission));
  persistDecisions();
}

// ── Persistence ──────────────────────────────────────────────────────────────

/**
 * Site permission grants are presented in Site Settings as saved preferences,
 * but they used to live only in memory — every "Allow camera" was forgotten on
 * restart and the site prompted again. Persist them the same way zoom levels
 * and window geometry are persisted.
 *
 * Only the default session's decisions are written; private-session grants are
 * intentionally ephemeral.
 */
const FILENAME = 'permissions.json';
const writer = new DebouncedWriter<Record<string, boolean>>(FILENAME, 1_000);

function persistDecisions(): void {
  writer.schedule(Object.fromEntries(decisions));
}

/** Write immediately, bypassing the debounce. Used on quit. */
export function flushPermissionDecisions(): void {
  writer.flush(Object.fromEntries(decisions));
}

/** Restore saved decisions. Call once during startup, before any webview. */
export function loadPermissionDecisions(): void {
  const parsed = readJsonFile(FILENAME);
  if (!isRecord(parsed)) return;
  for (const [key, allowed] of Object.entries(parsed)) {
    if (typeof allowed !== 'boolean') continue;
    if (typeof key !== 'string' || key.indexOf('\0') < 0) continue;
    decisions.set(key, allowed);
  }
}
