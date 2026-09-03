import { useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import type { Bookmark } from '../../shared/types';

/**
 * Bookmarks are read by several components at once (the bookmarks panel, the
 * nav bar star, the command palette). Each useBookmarks() call used to keep
 * its own useState copy with no way to invalidate the others, so bookmarking a
 * page from the nav bar left the panel and the palette showing stale data
 * until they happened to remount.
 *
 * A tiny module-level store fixes that: one cached list, one fetch, and every
 * subscriber re-renders together.
 */
let cache: Bookmark[] = [];
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function setCache(next: Bookmark[]): void {
  cache = next;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): Bookmark[] {
  return cache;
}

/** Fetch from the main process, de-duplicating concurrent callers. */
function refresh(): Promise<void> {
  if (!window.browserAPI) return Promise.resolve();
  if (inflight) return inflight;
  inflight = window.browserAPI.bookmarks
    .get()
    .then((list) => {
      setCache(list ?? []);
    })
    .catch((error: unknown) => {
      console.error('[bookmarks] failed to load:', error);
      setCache([]);
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function useBookmarks() {
  const bookmarks = useSyncExternalStore(subscribe, getSnapshot);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await refresh();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const add = useCallback(async (url: string, title: string, favicon?: string) => {
    if (!window.browserAPI) return;
    const bm = await window.browserAPI.bookmarks.add(url, title, favicon);
    if (bm) setCache([bm, ...cache.filter((b) => b.url !== url)]);
  }, []);

  const remove = useCallback(async (url: string) => {
    if (!window.browserAPI) return;
    await window.browserAPI.bookmarks.remove(url);
    setCache(cache.filter((b) => b.url !== url));
  }, []);

  /** Returns true if the url is now bookmarked (after toggle). */
  const toggle = useCallback(
    async (url: string, title: string, favicon?: string): Promise<boolean> => {
      if (!window.browserAPI) return false;
      // Await the promise — the old code was using the Promise object as a
      // truthy value which always evaluated to "already bookmarked".
      const isAlready: boolean = await window.browserAPI.bookmarks.is(url);
      if (isAlready) {
        await remove(url);
        return false;
      } else {
        await add(url, title, favicon);
        return true;
      }
    },
    [add, remove]
  );

  const isBookmarked = useCallback(
    (url: string): boolean => {
      return bookmarks.some((b) => b.url === url);
    },
    [bookmarks]
  );

  return { bookmarks, loading, add, remove, toggle, isBookmarked, reload: load };
}
