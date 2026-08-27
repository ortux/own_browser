import { dialog } from 'electron';

const decisions = new Map<string, boolean>();
const configuredSessions = new WeakSet<Electron.Session>();

const LABELS: Record<string, string> = {
  media: 'camera and microphone',
  geolocation: 'your location',
  notifications: 'desktop notifications',
  'clipboard-read': 'your clipboard',
  'display-capture': 'screen sharing',
  fullscreen: 'fullscreen mode',
  pointerLock: 'pointer lock',
  midi: 'MIDI devices',
  usb: 'USB devices',
  hid: 'HID devices',
};

function hostFromUrl(value: string): string {
  try { return new URL(value).hostname.toLowerCase(); } catch { return ''; }
}

function decisionKey(host: string, permission: string): string {
  return `${host}\0${permission}`;
}

/** Install conservative, user-visible permission handling for a session. */
export function configureSessionPermissions(ses: Electron.Session, getWindow: () => Electron.BrowserWindow | null): void {
  if (configuredSessions.has(ses)) return;
  configuredSessions.add(ses);

  ses.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
    const host = hostFromUrl(requestingOrigin || webContents?.getURL() || '');
    return decisions.get(decisionKey(host, permission)) === true;
  });

  ses.setPermissionRequestHandler(async (webContents, permission, callback, details) => {
    const host = hostFromUrl(details.requestingUrl || webContents.getURL());
    if (!host || permission === 'openExternal' || permission === 'unknown' || permission === 'fileSystem') {
      callback(false);
      return;
    }

    const key = decisionKey(host, permission);
    const existing = decisions.get(key);
    if (existing !== undefined) {
      callback(existing);
      return;
    }

    const window = getWindow();
    if (!window || window.isDestroyed()) {
      callback(false);
      return;
    }

    const label = LABELS[permission] ?? permission;
    try {
      const result = await dialog.showMessageBox(window, {
        type: 'question',
        title: 'Site permission request',
        message: `${host} wants to access ${label}.`,
        buttons: ['Allow', 'Block'],
        defaultId: 1,
        cancelId: 1,
        noLink: true,
      });
      const allowed = result.response === 0;
      decisions.set(key, allowed);
      callback(allowed);
    } catch {
      callback(false);
    }
  });
}

export function clearPermissionDecisions(): void {
  decisions.clear();
}

export interface PermissionDecision {
  host: string;
  permission: string;
  allowed: boolean;
}

/** All remembered permission decisions (for the Site settings surface). */
export function listPermissionDecisions(): PermissionDecision[] {
  const out: PermissionDecision[] = [];
  for (const [key, allowed] of decisions) {
    const separator = key.indexOf('\0');
    if (separator <= 0) continue;
    out.push({ host: key.slice(0, separator), permission: key.slice(separator + 1), allowed });
  }
  return out.sort((a, b) => a.host.localeCompare(b.host) || a.permission.localeCompare(b.permission));
}

/** Forget every decision recorded for one host. Returns how many were removed. */
export function clearPermissionDecisionsForHost(host: string): number {
  const prefix = `${host.toLowerCase()}\0`;
  let removed = 0;
  for (const key of [...decisions.keys()]) {
    if (key.startsWith(prefix)) {
      decisions.delete(key);
      removed++;
    }
  }
  return removed;
}
