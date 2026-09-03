import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from 'react';
import type { HistoryEntry } from '../../shared/types';

/**
 * Each useHistory() caller keeps its own result list, because each has its own
 * search query. What they must share is *invalidation*: clearing history from
 * the history panel previously left the command palette still offering the
 * entries that no longer existed.
 *
 * A revision counter is enough — bump it on any mutation and every mounted
 * instance refetches with whatever query it currently has.
 */
let revision = 0;
const revisionListeners = new Set<() => void>();

function subscribeRevision(listener: () => void): () => void {
  revisionListeners.add(listener);
  return () => {
    revisionListeners.delete(listener);
  };
}

function getRevision(): number {
  return revision;
}

/** Tell every mounted useHistory() that the underlying data changed. */
export function invalidateHistory(): void {
  revision += 1;
  for (const listener of revisionListeners) listener();
}

export function useHistory() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const requestNumber = useRef(0);

  const load = useCallback(async (q?: string) => {
    if (!window.browserAPI) return;
    const request = ++requestNumber.current;
    setLoading(true);
    try {
      const data = q?.trim()
        ? await window.browserAPI.history.search(q.trim())
        : await window.browserAPI.history.get();
      if (request === requestNumber.current) setEntries(data);
    } catch (error) {
      if (request === requestNumber.current) {
        console.error('[history] failed to load:', error);
        setEntries([]);
      }
    } finally {
      if (request === requestNumber.current) setLoading(false);
    }
  }, []);

  const currentRevision = useSyncExternalStore(subscribeRevision, getRevision);

  useEffect(() => {
    void load(query);
  }, [query, load, currentRevision]);

  const deleteEntry = useCallback(async (id: number) => {
    try {
      await window.browserAPI?.history.delete(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
      invalidateHistory();
    } catch (error) {
      console.error('[history] failed to delete entry:', error);
    }
  }, []);

  const clearAll = useCallback(async () => {
    try {
      await window.browserAPI?.history.clear();
      setEntries([]);
      invalidateHistory();
    } catch (error) {
      console.error('[history] failed to clear history:', error);
    }
  }, []);

  return { entries, loading, query, setQuery, deleteEntry, clearAll, reload: load };
}
