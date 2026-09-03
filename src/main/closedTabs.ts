/**
 * closedTabs.ts — persist the recently-closed tab list across restarts.
 *
 * "Reopen closed tab" (Ctrl+Shift+T) used to be backed by a plain in-memory
 * array, so the one moment a user most wants it — after a crash or an
 * accidental quit — was exactly when it was empty.
 *
 * Kept in its own JSON file rather than the sql.js database for the same
 * reason as session.ts: the database rewrites itself in full on every write,
 * and this list changes on every tab close. It is also recoverable state, so a
 * corrupt file should mean "no closed tabs", never an error.
 */

import { isAllowedNavigationUrl } from '../shared/navigation';
import { DebouncedWriter, readJsonFile, removeJsonFile, isRecord } from './jsonStore';

/** Only what is needed to reopen a tab; runtime flags are not persisted. */
export interface ClosedTabRecord {
  url: string;
  title: string;
  favicon?: string;
  pinned: boolean;
  muted: boolean;
  closedAt: number;
}

const FILENAME = 'closed-tabs.json';

/** Matches the in-memory cap the tab model already enforced. */
export const MAX_CLOSED_TABS = 20;

const MAX_URL_LENGTH = 8_192;
const MAX_TITLE_LENGTH = 1_000;

const writer = new DebouncedWriter<ClosedTabRecord[]>(FILENAME, 2_000);

function sanitize(value: unknown): ClosedTabRecord | null {
  if (!isRecord(value)) return null;
  const { url, title, favicon, pinned, muted, closedAt } = value;
  if (typeof url !== 'string' || url.length > MAX_URL_LENGTH) return null;
  // Never resurrect an internal error page or a scheme we would refuse to
  // navigate to anyway.
  if (!isAllowedNavigationUrl(url) || url === 'about:blank') return null;
  return {
    url,
    title: typeof title === 'string' ? title.slice(0, MAX_TITLE_LENGTH) : '',
    favicon: typeof favicon === 'string' ? favicon.slice(0, MAX_URL_LENGTH) : undefined,
    pinned: pinned === true,
    muted: muted === true,
    closedAt: typeof closedAt === 'number' && Number.isFinite(closedAt) ? closedAt : 0,
  };
}

/** Read the persisted list. Returns an empty array when absent or corrupt. */
export function loadClosedTabs(): ClosedTabRecord[] {
  const parsed = readJsonFile(FILENAME);
  if (!Array.isArray(parsed)) return [];
  const out: ClosedTabRecord[] = [];
  for (const entry of parsed) {
    const record = sanitize(entry);
    if (record) out.push(record);
    if (out.length >= MAX_CLOSED_TABS) break;
  }
  return out;
}

/** Queue a write. Safe to call on every tab close. */
export function scheduleClosedTabsSave(records: ClosedTabRecord[]): void {
  writer.schedule(records.slice(0, MAX_CLOSED_TABS));
}

/** Write immediately — used on quit, where the debounce would be discarded. */
export function flushClosedTabsSave(records: ClosedTabRecord[]): void {
  writer.flush(records.slice(0, MAX_CLOSED_TABS));
}

/** Delete the file outright, for "clear browsing data". */
export function removeClosedTabsFile(): void {
  writer.cancel();
  removeJsonFile(FILENAME);
}
