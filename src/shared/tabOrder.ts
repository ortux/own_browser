/**
 * tabOrder.ts — ordering rules for the tab strip.
 *
 * Pinned tabs always occupy a contiguous block at the front. That single
 * invariant is what makes pinning feel stable: a pinned tab cannot be dragged
 * into the middle of the unpinned tabs, and unpinning a tab drops it at the
 * boundary rather than leaving it stranded among the pinned ones.
 *
 * These helpers are pure and operate on ids so both the main-process tab Map
 * and any renderer-side list can share them.
 */

export interface OrderableTab {
  id: string;
  pinned: boolean;
}

/**
 * Stable partition: pinned tabs first, each group keeping its relative order.
 *
 * Used after any pin change, so the strip never shows a pinned tab sitting
 * below an unpinned one.
 */
export function sortPinnedFirst<T extends OrderableTab>(tabs: T[]): T[] {
  const pinned: T[] = [];
  const unpinned: T[] = [];
  for (const tab of tabs) (tab.pinned ? pinned : unpinned).push(tab);
  return [...pinned, ...unpinned];
}

/**
 * Move `draggedId` to `targetId`'s slot, refusing moves that would break the
 * pinned/unpinned partition.
 *
 * Returns a new array, or the original when the move is a no-op or not
 * allowed — letting callers skip a pointless re-render.
 */
export function reorderTabs<T extends OrderableTab>(
  tabs: T[],
  draggedId: string,
  targetId: string
): T[] {
  if (draggedId === targetId) return tabs;

  const from = tabs.findIndex((tab) => tab.id === draggedId);
  const to = tabs.findIndex((tab) => tab.id === targetId);
  if (from < 0 || to < 0) return tabs;

  // Dragging across the pin boundary would either strand a pinned tab among
  // unpinned ones or silently change its pinned state. Neither is what the
  // drag gesture asked for, so the move is simply refused.
  if (tabs[from].pinned !== tabs[to].pinned) return tabs;

  const next = [...tabs];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * Apply a pin change and re-sort in one step.
 *
 * A newly pinned tab moves to the end of the pinned block; a newly unpinned
 * one to the front of the unpinned block. Both fall out of the stable
 * partition, so no special-casing is needed here.
 */
export function setPinned<T extends OrderableTab>(tabs: T[], tabId: string, pinned: boolean): T[] {
  const target = tabs.find((tab) => tab.id === tabId);
  if (!target || target.pinned === pinned) return tabs;
  return sortPinnedFirst(tabs.map((tab) => (tab.id === tabId ? { ...tab, pinned } : tab)));
}
