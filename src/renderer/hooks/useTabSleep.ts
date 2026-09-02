/**
 * useTabSleep — suspend idle background tabs to reclaim renderer processes.
 *
 * The hook owns two things: when each tab was last looked at, and a periodic
 * sweep that turns that into a set of sleeping tab ids. BrowserWindow uses the
 * set to skip mounting those tabs' <webview> elements, which is what actually
 * frees the process — hiding the element does not.
 *
 * A sleeping tab keeps its entry in the tab strip with its title, favicon and
 * URL intact, and wakes on click by simply being mounted again.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Tab } from '../../shared/types';
import { selectSleepingTabs } from '../../shared/tabSleep';

/**
 * How often to re-evaluate. The idle threshold is measured in minutes, so a
 * coarse sweep is enough and costs nothing; a tab may sleep up to this long
 * after becoming eligible.
 */
const SWEEP_INTERVAL_MS = 30_000;

export interface UseTabSleepOptions {
  tabs: Tab[];
  activeTabId: string;
  enabled: boolean;
  idleMinutes: number;
}

export interface UseTabSleepResult {
  /** Tab ids whose webview should not be mounted. */
  sleeping: ReadonlySet<string>;
  /** Drop a tab from the sleeping set so it re-mounts and reloads. */
  wake: (tabId: string) => void;
}

export function useTabSleep({
  tabs,
  activeTabId,
  enabled,
  idleMinutes,
}: UseTabSleepOptions): UseTabSleepResult {
  const [sleeping, setSleeping] = useState<ReadonlySet<string>>(() => new Set<string>());

  // Kept in a ref, not state: updating it must never trigger a re-render, or
  // every tab switch would re-render the whole window twice.
  const lastActiveAt = useRef<Record<string, number>>({});

  // The sweep reads these without wanting to restart its interval each time
  // the tab list changes.
  const latest = useRef({ tabs, activeTabId, enabled, idleMinutes });
  latest.current = { tabs, activeTabId, enabled, idleMinutes };

  // Stamp the active tab continuously so "last active" means "last time it was
  // the foreground tab", not "last time it was clicked".
  useEffect(() => {
    if (!activeTabId) return;
    lastActiveAt.current[activeTabId] = Date.now();
    const id = window.setInterval(() => {
      lastActiveAt.current[activeTabId] = Date.now();
    }, 10_000);
    return () => window.clearInterval(id);
  }, [activeTabId]);

  // Seed newly-seen tabs (including ones restored from a previous session) and
  // forget closed ones, so the map cannot grow without bound.
  useEffect(() => {
    const now = Date.now();
    const seen = new Set(tabs.map((t) => t.id));
    for (const tab of tabs) {
      if (lastActiveAt.current[tab.id] === undefined) lastActiveAt.current[tab.id] = now;
    }
    for (const id of Object.keys(lastActiveAt.current)) {
      if (!seen.has(id)) delete lastActiveAt.current[id];
    }
    // A closed tab must also leave the sleeping set.
    setSleeping((current) => {
      if ([...current].every((id) => seen.has(id))) return current;
      return new Set([...current].filter((id) => seen.has(id)));
    });
  }, [tabs]);

  // The active tab is never asleep; waking it here rather than waiting for the
  // next sweep is what makes clicking a sleeping tab feel instant.
  useEffect(() => {
    setSleeping((current) => {
      if (!current.has(activeTabId)) return current;
      const next = new Set(current);
      next.delete(activeTabId);
      return next;
    });
  }, [activeTabId]);

  // Turning the feature off must wake everything immediately.
  useEffect(() => {
    if (enabled) return;
    setSleeping((current) => (current.size === 0 ? current : new Set<string>()));
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const sweep = () => {
      setSleeping((current) => {
        const config = latest.current;
        const next = selectSleepingTabs({
          tabs: config.tabs,
          activeTabId: config.activeTabId,
          lastActiveAt: lastActiveAt.current,
          sleeping: current,
          now: Date.now(),
          idleMs: config.idleMinutes * 60_000,
          enabled: config.enabled,
        });
        // Preserve identity when nothing changed, so consumers do not re-render.
        if (next.size === current.size && [...next].every((id) => current.has(id))) return current;
        return next;
      });
    };
    const id = window.setInterval(sweep, SWEEP_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [enabled]);

  const wake = useCallback((tabId: string) => {
    setSleeping((current) => {
      if (!current.has(tabId)) return current;
      const next = new Set(current);
      next.delete(tabId);
      return next;
    });
    lastActiveAt.current[tabId] = Date.now();
  }, []);

  return { sleeping, wake };
}
