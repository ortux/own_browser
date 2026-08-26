import { useState, useEffect, useCallback, useRef } from 'react';
import type { HistoryEntry } from '../../shared/types';

export function useHistory() {
  const [entries,   setEntries]   = useState<HistoryEntry[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [query,     setQuery]     = useState('');
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

  useEffect(() => { load(query); }, [query, load]);

  const deleteEntry = useCallback(async (id: number) => {
    try {
      await window.browserAPI?.history.delete(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch (error) {
      console.error('[history] failed to delete entry:', error);
    }
  }, []);

  const clearAll = useCallback(async () => {
    try {
      await window.browserAPI?.history.clear();
      setEntries([]);
    } catch (error) {
      console.error('[history] failed to clear history:', error);
    }
  }, []);

  return { entries, loading, query, setQuery, deleteEntry, clearAll, reload: load };
}
