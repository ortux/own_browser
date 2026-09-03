/**
 * Bookmarks Sync Service
 * Manages bookmark sync to backend
 */

import { apiClient } from './apiClient';
import { useSettingsStore } from '../stores/settingsStore';
import { log } from './logger';

export interface BookmarkEntry {
  bookmark_id: string;
  title: string;
  url: string;
  created_at?: string;
  updated_at?: string;
}

export interface SyncBookmarksResponse {
  ok: boolean;
  inserted: number;
  received: number;
}

/**
 * Sync bookmarks to backend
 */
export async function syncBookmarksWithDevice() {
  try {
    const store = useSettingsStore.getState();
    const { deviceKey } = store;

    if (!deviceKey) {
      if (import.meta.env.DEV) log.debug('[bookmarks-sync] Skipping: no device key');
      return null;
    }

    // Get bookmarks from browser API
    const bookmarks = await window.browserAPI.bookmarks.get?.();
    if (!bookmarks || bookmarks.length === 0) {
      if (import.meta.env.DEV) log.debug('[bookmarks-sync] No bookmarks to sync');
      return null;
    }

    // Transform to sync format
    const syncBookmarks = bookmarks.map((bm) => ({
      bookmark_id: bm.id || `bm-${Date.now()}-${Math.random()}`,
      title: bm.title || '',
      url: bm.url || '',
    }));

    const response = await apiClient.post<SyncBookmarksResponse>(
      '/api/v1/sync/bookmarks',
      {
        device_key: deviceKey,
        bookmarks: syncBookmarks,
      },
      { requireAuth: true }
    );

    if (response.ok && response.data) {
      if (import.meta.env.DEV) log.debug('[bookmarks-sync] Synced:', response.data);
      return response.data;
    }

    throw new Error(response.error || 'Bookmarks sync failed');
  } catch (error) {
    console.error('[bookmarks-sync] Error:', error);
    return null;
  }
}

/**
 * Get bookmarks from backend
 */
export async function getBookmarksFromBackend(
  limit: number = 500
): Promise<BookmarkEntry[] | null> {
  try {
    const response = await apiClient.get(`/api/v1/sync/bookmarks?limit=${limit}`, {
      requireAuth: true,
    });

    if (response.ok && response.data) {
      const data = response.data as { bookmarks: BookmarkEntry[] };
      return data.bookmarks || [];
    }

    return null;
  } catch (error) {
    console.error('[bookmarks-sync] Failed to fetch bookmarks:', error);
    return null;
  }
}

/**
 * Add bookmark locally (synced to backend separately)
 */
export async function addBookmark(url: string, title: string): Promise<BookmarkEntry | null> {
  try {
    // Add to browser API
    const bookmark = await window.browserAPI.bookmarks?.add?.(url, title || new URL(url).hostname);

    if (!bookmark) {
      throw new Error('Failed to add bookmark');
    }

    // Queue sync
    setTimeout(() => syncBookmarksWithDevice(), 100);

    return {
      bookmark_id: String(bookmark.id ?? `bm-${Date.now()}`),
      title: bookmark.title || title,
      url: bookmark.url || url,
    };
  } catch (error) {
    console.error('[bookmarks] Failed to add bookmark:', error);
    return null;
  }
}

/**
 * Remove bookmark locally
 */
export async function removeBookmark(url: string): Promise<boolean> {
  try {
    // browserAPI.bookmarks.remove is keyed by URL, not by row id. This was
    // being called with a bookmark id, so it silently deleted nothing.
    await window.browserAPI.bookmarks?.remove?.(url);
    // Queue sync
    setTimeout(() => syncBookmarksWithDevice(), 100);
    return true;
  } catch (error) {
    console.error('[bookmarks] Failed to remove bookmark:', error);
    return false;
  }
}

/**
 * Initialize bookmarks sync timer
 */
export function initBookmarksSync(interval: number = 5 * 60 * 1000): () => void {
  const syncInterval = setInterval(() => {
    syncBookmarksWithDevice().catch((error) => {
      console.warn('[bookmarks-sync] Auto-sync error:', error);
    });
  }, interval);

  return () => clearInterval(syncInterval);
}
