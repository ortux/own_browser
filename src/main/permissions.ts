import type { PermissionRequest } from '../shared/types';

const decisions = new Map<string, boolean>();
const configuredSessions = new WeakSet<Electron.Session>();

interface PendingRequest {
  callback: (allowed: boolean) => void;
  timer: ReturnType<typeof setTimeout>;
  key: string;
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
  try { return new URL(value).hostname.toLowerCase(); } catch { return ''; }
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

/** Install conservative, user-visible permission handling for a session. */
export function configureSessionPermissions(
  ses: Electron.Session,
  getWindow: () => Electron.BrowserWindow | null,
): void {
  if (configuredSessions.has(ses)) return;
  configuredSessions.add(ses);

  ses.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
    const host = hostFromUrl(requestingOrigin || webContents?.getURL() || '');
    return decisions.get(decisionKey(host, permission)) === true;
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
    const existing = decisions.get(key);
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
        decisions.set(rec.key, false);
        safeCallback(callback, false);
      }
    }, 60_000);

    pending.set(requestId, { callback, timer, key });
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
  decisions.set(rec.key, allow);
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
}
