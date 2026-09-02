/**
 * Enhanced History Hook with Sync Support
 * Manages history fetching, syncing, and offline queuing
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { HistoryEntry } from '../../shared/types';
import { apiClient } from '../lib/apiClient';
import { offlineQueue } from '../lib/offlineQueue';
import { useSettingsStore } from '../stores/settingsStore';

export interface SyncableHistoryEntry extends HistoryEntry {
  synced?: boolean;
}

export function useHistoryWithSync() {
  const [entries, setEntries] = useState<SyncableHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [query, setQuery] = useState('');
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const requestNumber = useRef(0);
  const { account } = useSettingsStore();

  // Load local history
  const load = useCallback(async (q?: string) => {
    if (!window.browserAPI) return;
    const request = ++requestNumber.current;
    setLoading(true);
    try {
      const data = q?.trim()
        ? await window.browserAPI.history.search(q.trim())
        : await window.browserAPI.history.get();
      if (request === requestNumber.current) {
        setEntries(data || []);
      }
    } catch (error) {
      if (request === requestNumber.current) {
        console.error('[history] failed to load:', error);
        setEntries([]);
      }
    } finally {
      if (request === requestNumber.current) setLoading(false);
    }
  }, []);

  // Load from backend (if authenticated)
  const loadFromBackend = useCallback(async () => {
    if (!account) {
      console.debug('[history-sync] Skipping backend load: not authenticated');
      return;
    }

    try {
      setSyncing(true);
      setSyncError(null);

      const response = await apiClient.get<{ events?: HistoryEntry[] }>(
        '/api/v1/sync/history?limit=500',
        { requireAuth: true }
      );

      if (response.ok) {
        const backendEvents = response.data?.events ?? [];
        // Merge with local entries, marking backend entries as synced
        setEntries(prev => {
          const merged = [...prev];
          backendEvents.forEach(backendEntry => {
            if (!merged.find(e => e.id === backendEntry.id)) {
              merged.push({ ...backendEntry, synced: true });
            }
          });
          return merged.sort((a, b) => 
            new Date(b.visited_at).getTime() - new Date(a.visited_at).getTime()
          );
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

  // Sync local history to backend
  const syncToBackend = useCallback(async () => {
    if (!account) {
      console.debug('[history-sync] Skipping sync: not authenticated');
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

      // Get unsynced entries
      const unsyncedEntries = entries.filter(e => !e.synced);
      if (unsyncedEntries.length === 0) {
        console.debug('[history-sync] No entries to sync');
        return true;
      }

      // Transform to sync format
      const events = unsyncedEntries.map(entry => ({
        client_event_id: `${entry.id}`,
        url: entry.url,
        title: entry.title || '',
        visited_at: new Date(entry.visited_at || Date.now()).toISOString(),
      }));

      const response = await apiClient.post<{ inserted: number; received: number }>(
        '/api/v1/sync/history',
        { device_key: deviceKey, events },
        { requireAuth: true }
      );

      if (response.ok && response.data?.inserted) {
        console.debug('[history-sync] Synced', response.data.inserted, 'entries');
        // Mark synced entries
        setEntries(prev =>
          prev.map(e =>
            unsyncedEntries.find(ue => ue.id === e.id)
              ? { ...e, synced: true }
              : e
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
      console.error('[history-sync] Error:', error);
      return false;
    } finally {
      setSyncing(false);
    }
  }, [account, entries]);

  // Delete entry locally and queue for sync
  const deleteEntry = useCallback(async (id: number) => {
    try {
      await window.browserAPI?.history.delete(id);
      setEntries(prev => prev.filter(e => e.id !== id));

      // Queue deletion for sync
      offlineQueue.addOperation('history', 'remove', { id });
      
      if (account) {
        syncToBackend();
      }
    } catch (error) {
      console.error('[history] failed to delete entry:', error);
    }
  }, [account, syncToBackend]);

  // Clear all history
  const clearAll = useCallback(async () => {
    try {
      await window.browserAPI?.history.clear();
      setEntries([]);

      // Queue clear operation
      offlineQueue.addOperation('history', 'sync', { action: 'clear_all' });

      if (account) {
        syncToBackend();
      }
    } catch (error) {
      console.error('[history] failed to clear history:', error);
    }
  }, [account, syncToBackend]);

  // Load on mount and when query changes
  useEffect(() => {
    load(query);
  }, [query, load]);

  // Sync on mount if authenticated
  useEffect(() => {
    if (account) {
      loadFromBackend();
    }
  }, [account, loadFromBackend]);

  return {
    entries,
    loading,
    syncing,
    query,
    setQuery,
    deleteEntry,
    clearAll,
    reload: load,
    syncToBackend,
    loadFromBackend,
    lastSyncTime,
    syncError,
  };
}
