import { useState, useEffect, useCallback } from 'react';
import type { HistoryEntry } from '../../shared/types';

export function useHistory() {
  const [entries, setEntries]   = useState<HistoryEntry[]>([]);
  const [loading, setLoading]   = useState(false);
  const [query,   setQuery]     = useState('');

  const load = useCallback(async (q?: string) => {
    if (!window.browserAPI) return;
    setLoading(true);
    try {
      const data = q?.trim()
        ? await window.browserAPI.history.search(q.trim())
        : await window.browserAPI.history.get();
      setEntries(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(query); }, [query, load]);

  const deleteEntry = useCallback(async (id: number) => {
    await window.browserAPI?.history.delete(id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const clearAll = useCallback(async () => {
    await window.browserAPI?.history.clear();
    setEntries([]);
  }, []);

  return { entries, loading, query, setQuery, deleteEntry, clearAll, reload: load };
}
