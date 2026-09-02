/**
 * session.ts — persist the open tab set across restarts.
 *
 * Quitting the browser used to discard every open tab. This module writes the
 * tab strip to a small JSON file in userData and reads it back on launch.
 *
 * Deliberately a plain file rather than a row in the sql.js database: the
 * database rewrites itself in full on every write, and the session is written
 * on a debounce during normal browsing. It is also recoverable state — if the
 * file is corrupt the correct behaviour is to start with a fresh tab, not to
 * surface an error, so it does not belong alongside data the user would miss.
 */

import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import { isAllowedNavigationUrl } from '../shared/navigation';

/** Only the fields needed to rebuild a tab. Runtime flags are not persisted. */
export interface PersistedTab {
  url: string;
  title: string;
  favicon?: string;
  pinned: boolean;
}

export interface PersistedSession {
  version: 1;
  tabs: PersistedTab[];
  activeIndex: number;
  savedAt: number;
}

const FILENAME = 'session.json';
const CURRENT_VERSION = 1;

/**
 * An upper bound on what is written back. Restoring hundreds of tabs would
 * spawn hundreds of renderer processes at launch; the excess is dropped rather
 * than shipped to the user as a hang.
 */
const MAX_TABS = 100;
const MAX_URL_LENGTH = 8_192;
const MAX_TITLE_LENGTH = 1_000;

function sessionPath(): string {
  return path.join(app.getPath('userData'), FILENAME);
}

/** Writes are debounced: normal browsing would otherwise hit the disk constantly. */
let writeTimer: NodeJS.Timeout | null = null;
let pending: PersistedSession | null = null;

function writeNow(session: PersistedSession): void {
  const target = sessionPath();
  const temp = `${target}.tmp-${process.pid}`;
  try {
    fs.writeFileSync(temp, JSON.stringify(session));
    // Rename is atomic on the same filesystem, so a crash mid-write cannot
    // leave a half-written session behind.
    fs.renameSync(temp, target);
  } catch (error) {
    try {
      fs.rmSync(temp, { force: true });
    } catch {
      /* best effort */
    }
    console.error('[session] could not persist open tabs:', error);
  }
}

function toPersisted(tabs: PersistedTab[], activeIndex: number): PersistedSession {
  return {
    version: CURRENT_VERSION,
    tabs: tabs.slice(0, MAX_TABS),
    activeIndex,
    savedAt: Date.now(),
  };
}

/**
 * Queue a session write. Safe to call on every tab change; the disk write
 * happens at most once per `delayMs`.
 */
export function scheduleSessionSave(
  tabs: PersistedTab[],
  activeIndex: number,
  delayMs = 2_000
): void {
  pending = toPersisted(tabs, activeIndex);
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    if (pending) {
      writeNow(pending);
      pending = null;
    }
  }, delayMs);
}

/** Write immediately, bypassing the debounce. Used on quit. */
export function flushSessionSave(tabs?: PersistedTab[], activeIndex?: number): void {
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  const session =
    tabs !== undefined && activeIndex !== undefined ? toPersisted(tabs, activeIndex) : pending;
  pending = null;
  if (session) writeNow(session);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Validate one entry from disk. The file lives in a user-writable directory,
 * so it is treated as untrusted input: a hand-edited `javascript:` URL must
 * never reach a webview.
 */
function parseTab(value: unknown): PersistedTab | null {
  if (!isRecord(value)) return null;

  const { url, title, favicon, pinned } = value;
  if (typeof url !== 'string' || url.length > MAX_URL_LENGTH) return null;
  if (!isAllowedNavigationUrl(url)) return null;
  // A restored strip of blank tabs is noise, not state worth keeping.
  if (url === 'about:blank') return null;

  return {
    url,
    title: typeof title === 'string' ? title.slice(0, MAX_TITLE_LENGTH) : '',
    favicon: typeof favicon === 'string' && favicon.length <= MAX_URL_LENGTH ? favicon : undefined,
    pinned: pinned === true,
  };
}

/**
 * Read the previous session. Returns null when there is nothing usable to
 * restore — a missing file, an unreadable one, or a version this build does
 * not understand.
 */
export function loadSession(): PersistedSession | null {
  const target = sessionPath();
  let raw: string;
  try {
    if (!fs.existsSync(target)) return null;
    raw = fs.readFileSync(target, 'utf8');
  } catch (error) {
    console.error('[session] could not read saved tabs:', error);
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.error('[session] saved tabs were not valid JSON; ignoring:', error);
    return null;
  }

  if (!isRecord(parsed) || parsed.version !== CURRENT_VERSION) return null;
  if (!Array.isArray(parsed.tabs)) return null;

  const tabs = parsed.tabs
    .map(parseTab)
    .filter((tab): tab is PersistedTab => tab !== null)
    .slice(0, MAX_TABS);

  if (!tabs.length) return null;

  const rawIndex = parsed.activeIndex;
  const activeIndex =
    typeof rawIndex === 'number' && Number.isInteger(rawIndex) && rawIndex >= 0
      ? Math.min(rawIndex, tabs.length - 1)
      : 0;

  return {
    version: CURRENT_VERSION,
    tabs,
    activeIndex,
    savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : 0,
  };
}

/** Forget the saved session (used when the user turns restore off). */
export function clearSession(): void {
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  pending = null;
  try {
    fs.rmSync(sessionPath(), { force: true });
  } catch (error) {
    console.error('[session] could not clear saved tabs:', error);
  }
}
