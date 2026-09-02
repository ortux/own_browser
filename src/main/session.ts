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

import { isAllowedNavigationUrl } from '../shared/navigation';
import { DebouncedWriter, readJsonFile, removeJsonFile, isRecord } from './jsonStore';

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

/** Writes are debounced: normal browsing would otherwise hit the disk constantly. */
const writer = new DebouncedWriter<PersistedSession>(FILENAME, 2_000);

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
  writer.schedule(toPersisted(tabs, activeIndex), delayMs);
}

/** Write immediately, bypassing the debounce. Used on quit. */
export function flushSessionSave(tabs?: PersistedTab[], activeIndex?: number): void {
  writer.flush(
    tabs !== undefined && activeIndex !== undefined ? toPersisted(tabs, activeIndex) : undefined
  );
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
  const parsed = readJsonFile(FILENAME);
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
  writer.cancel();
  removeJsonFile(FILENAME);
}
