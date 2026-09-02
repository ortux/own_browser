/**
 * Enhanced Bookmarks Hook with Sync Support
 * Manages bookmarks fetching, syncing, and offline queuing
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '../lib/apiClient';
import { offlineQueue } from '../lib/offlineQueue';
import { useSettingsStore } from '../stores/settingsStore';

export interface SyncableBookmark {
  id?: string;
  bookmark_id?: string;
  title: string;
  url: string;
  created_at?: string;
  updated_at?: string;
  synced?: boolean;
  device_id?: number;
}

export function useBookmarksWithSync() {
  const [bookmarks, setBookmarks] = useState<SyncableBookmark[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const requestNumber = useRef(0);
  const { account } = useSettingsStore();

  // Load local bookmarks
  const load = useCallback(async (q?: string) => {
    if (!window.browserAPI?.bookmarks?.get) return;
    const request = ++requestNumber.current;
    setLoading(true);
    try {
      let data = await window.browserAPI.bookmarks.get();
      if (q?.trim()) {
        const query = q.toLowerCase();
        data = data.filter(
          b => b.title.toLowerCase().includes(query) || b.url.toLowerCase().includes(query)
        );
      }
      if (request === requestNumber.current) {
        setBookmarks((data as unknown as SyncableBookmark[]) || []);
      }
    } catch (error) {
      if (request === requestNumber.current) {
        console.error('[bookmarks] failed to load:', error);
        setBookmarks([]);
      }
    } finally {
      if (request === requestNumber.current) setLoading(false);
    }
  }, []);

  // Load bookmarks from backend
  const loadFromBackend = useCallback(async () => {
    if (!account) {
      console.debug('[bookmarks-sync] Skipping backend load: not authenticated');
      return;
    }

    try {
      setSyncing(true);
      setSyncError(null);

      const response = await apiClient.get<{ bookmarks?: SyncableBookmark[] }>(
        '/api/v1/sync/bookmarks?limit=1000',
        { requireAuth: true }
      );

      if (response.ok) {
        const backendBookmarks = response.data?.bookmarks ?? [];
        // Merge with local bookmarks
        setBookmarks(prev => {
          const localIds = new Set(prev.map(b => b.url));
          const merged = [...prev];
          backendBookmarks.forEach(backendBookmark => {
            if (!localIds.has(backendBookmark.url)) {
              merged.push({ ...backendBookmark, synced: true });
            }
          });
          return merged;
        });
        setLastSyncTime(Date.now());
      } else if (response.error) {
        setSyncError(response.error);
      }
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }, [account]);

  // Sync bookmarks to backend
  const syncToBackend = useCallback(async () => {
    if (!account) {
      console.debug('[bookmarks-sync] Skipping sync: not authenticated');
      return false;
    }

    const deviceKey = useSettingsStore.getState().deviceKey;
    if (!deviceKey) {
      setSyncError('Device key not found');
      return false;
    }

    try {
      setSyncing(true);
      setSyncError(null);

      // Transform to sync format
      const syncBookmarks = bookmarks
        .filter(b => !b.synced)
        .map(b => ({
          bookmark_id: b.bookmark_id || b.id || `bm-${Date.now()}-${Math.random()}`,
          title: b.title || '',
          url: b.url || '',
        }));

      if (syncBookmarks.length === 0) {
        console.debug('[bookmarks-sync] No bookmarks to sync');
        return true;
      }

      const response = await apiClient.post<{ inserted: number; received: number }>(
        '/api/v1/sync/bookmarks',
        { device_key: deviceKey, bookmarks: syncBookmarks },
        { requireAuth: true }
      );

      if (response.ok) {
        console.debug('[bookmarks-sync] Synced', response.data?.inserted, 'bookmarks');
        // Mark synced
        setBookmarks(prev =>
          prev.map(b =>
            syncBookmarks.find(sb => sb.url === b.url)
              ? { ...b, synced: true }
              : b
          )
        );
        setLastSyncTime(Date.now());
        return true;
      } else {
        setSyncError(response.error || 'Sync failed');
        return false;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sync failed';
      setSyncError(message);
      console.error('[bookmarks-sync] Error:', error);
      return false;
    } finally {
      setSyncing(false);
    }
  }, [account, bookmarks]);

  // Add bookmark
  const addBookmark = useCallback(
    async (url: string, title?: string) => {
      try {
        const newBookmark: SyncableBookmark = {
          title: title || new URL(url).hostname,
          url,
          synced: false,
        };

        // Add to local storage
        await window.browserAPI?.bookmarks?.add?.(newBookmark.url, newBookmark.title);
        setBookmarks(prev => [...prev, newBookmark]);

        // Queue for sync
        offlineQueue.addOperation('bookmark', 'add', newBookmark);

        if (account) {
          await syncToBackend();
        }

        return newBookmark;
      } catch (error) {
        console.error('[bookmarks] failed to add bookmark:', error);
        throw error;
      }
    },
    [account, syncToBackend]
  );

  // Remove bookmark
  const removeBookmark = useCallback(
    async (bookmarkId: string | undefined) => {
      if (!bookmarkId) return false;

      try {
        await window.browserAPI?.bookmarks?.remove?.(bookmarkId);
        setBookmarks(prev => prev.filter(b => b.id !== bookmarkId && b.bookmark_id !== bookmarkId));

        // Queue for sync
        offlineQueue.addOperation('bookmark', 'remove', { id: bookmarkId });

        if (account) {
          await syncToBackend();
        }

        return true;
      } catch (error) {
        console.error('[bookmarks] failed to remove bookmark:', error);
        return false;
      }
    },
    [account, syncToBackend]
  );

  // Load on mount and when search changes
  useEffect(() => {
    load(searchQuery);
  }, [searchQuery, load]);

  // Load from backend when authenticated
  useEffect(() => {
    if (account) {
      loadFromBackend();
    }
  }, [account, loadFromBackend]);

  return {
    bookmarks,
    loading,
    syncing,
    searchQuery,
    setSearchQuery,
    addBookmark,
    removeBookmark,
    reload: load,
    syncToBackend,
    loadFromBackend,
    lastSyncTime,
    syncError,
  };
}
