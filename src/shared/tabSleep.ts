/**
 * tabSleep.ts — decide which background tabs may be suspended.
 *
 * BrowserWindow mounts every tab's <webview> at once and only toggles
 * visibility with `display: none`, so thirty open tabs means thirty live
 * renderer processes. Unmounting the element is the only thing that actually
 * reclaims that memory; hiding it does nothing.
 *
 * The selection rules live here, separate from React, because "which tab is
 * safe to discard" is the part that is easy to get subtly wrong and worth
 * testing directly.
 */

import type { Tab } from './types';

/** Default idle period before a background tab is suspended. */
export const DEFAULT_SLEEP_MINUTES = 30;

/** Bounds for the user-facing setting. */
export const MIN_SLEEP_MINUTES = 5;
export const MAX_SLEEP_MINUTES = 720;

export interface SleepSelectionInput {
  tabs: Tab[];
  activeTabId: string;
  /** tabId → epoch ms when the tab was last focused (or created). */
  lastActiveAt: Record<string, number>;
  /** Tabs already asleep, so they are not re-reported as newly sleeping. */
  sleeping: ReadonlySet<string>;
  now: number;
  idleMs: number;
  enabled: boolean;
}

/**
 * True when a tab must stay awake regardless of how long it has been idle.
 *
 * Discarding a tab destroys its webContents, so anything with state the user
 * would not expect to lose — or that is doing something audible right now —
 * is excluded.
 */
export function isSleepExempt(tab: Tab, activeTabId: string): boolean {
  // The tab the user is looking at.
  if (tab.id === activeTabId) return true;
  // Playing audio. Suspending this is the single most user-hostile thing tab
  // sleeping can do: the sound stops for no visible reason.
  if (tab.audible) return true;
  // Pinned tabs are pinned precisely because the user wants them ready.
  if (tab.pinned) return true;
  // Mid-navigation; discarding now would throw away the in-flight load.
  if (tab.loading) return true;
  // Nothing to restore from: a blank or internal page has no URL to reload,
  // so suspending it saves a trivial amount and loses the tab's identity.
  if (!tab.url || tab.url === 'about:blank') return true;
  if (tab.url.startsWith('zyphora://')) return true;
  return false;
}

/**
 * The set of tabs that should be asleep right now.
 *
 * Returns the full desired set rather than a delta so the caller can simply
 * replace its state; callers that need to know what changed can diff against
 * `sleeping`.
 */
export function selectSleepingTabs(input: SleepSelectionInput): Set<string> {
  const { tabs, activeTabId, lastActiveAt, sleeping, now, idleMs, enabled } = input;
  const next = new Set<string>();
  if (!enabled) return next;

  for (const tab of tabs) {
    if (isSleepExempt(tab, activeTabId)) continue;

    // Already asleep and still eligible: stay asleep. Re-checking the idle
    // clock here would wake it up, since a sleeping tab stops being "recently
    // active" in any meaningful way.
    if (sleeping.has(tab.id)) {
      next.add(tab.id);
      continue;
    }

    // A tab with no recorded timestamp has never been focused this session
    // (e.g. restored from a previous run). Treat it as idle since session
    // start rather than never-idle, but the caller seeds these on load.
    const since = lastActiveAt[tab.id];
    if (since === undefined) continue;
    if (now - since >= idleMs) next.add(tab.id);
  }

  return next;
}

/** Clamp the user-configured idle period to a sane range. */
export function clampSleepMinutes(minutes: number): number {
  if (!Number.isFinite(minutes)) return DEFAULT_SLEEP_MINUTES;
  return Math.min(MAX_SLEEP_MINUTES, Math.max(MIN_SLEEP_MINUTES, Math.round(minutes)));
}
