import { useState, useEffect, useCallback } from 'react';
import type { Bookmark } from '../../shared/types';

export function useBookmarks() {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!window.browserAPI) return;
    setLoading(true);
    try {
      setBookmarks(await window.browserAPI.bookmarks.get());
    } catch (error) {
      console.error('[bookmarks] failed to load:', error);
      setBookmarks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const add = useCallback(async (url: string, title: string, favicon?: string) => {
    if (!window.browserAPI) return;
    const bm = await window.browserAPI.bookmarks.add(url, title, favicon);
    if (bm) setBookmarks((prev) => [bm, ...prev.filter((b) => b.url !== url)]);
  }, []);

  const remove = useCallback(async (url: string) => {
    if (!window.browserAPI) return;
    await window.browserAPI.bookmarks.remove(url);
    setBookmarks((prev) => prev.filter((b) => b.url !== url));
  }, []);

  /** Returns true if the url is now bookmarked (after toggle). */
  const toggle = useCallback(async (url: string, title: string, favicon?: string): Promise<boolean> => {
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
  }, [add, remove]);

  const isBookmarked = useCallback((url: string): boolean => {
    return bookmarks.some((b) => b.url === url);
  }, [bookmarks]);

  return { bookmarks, loading, add, remove, toggle, isBookmarked, reload: load };
}
