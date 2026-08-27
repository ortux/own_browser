import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Search as SearchIcon,
  Trash2,
  Globe,
  History as HistoryIcon,
  X,
} from 'lucide-react';
import type { HistoryEntry } from '../../shared/types';
import { ClearBrowsingDataDialog } from './ClearBrowsingDataDialog';

interface HistoryPageProps {
  onBack: () => void;
  onNavigate: (url: string) => void;
}

function dayLabel(timestamp: number): string {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(date, today)) return 'Today';
  if (sameDay(date, yesterday)) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

export const HistoryPage: React.FC<HistoryPageProps> = ({ onBack, onNavigate }) => {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [showClear, setShowClear] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async (q: string) => {
    try {
      const data = q.trim()
        ? await window.browserAPI.history.search(q.trim())
        : await window.browserAPI.history.get(500);
      setEntries(data);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => void load(query), 150);
    return () => clearTimeout(timer);
  }, [query, load]);

  const grouped = useMemo(() => {
    const groups: { day: string; items: HistoryEntry[] }[] = [];
    for (const entry of entries) {
      const day = dayLabel(entry.visited_at);
      const last = groups[groups.length - 1];
      if (last && last.day === day) last.items.push(entry);
      else groups.push({ day, items: [entry] });
    }
    return groups;
  }, [entries]);

  const removeEntry = async (id: number) => {
    setEntries((current) => current.filter((entry) => entry.id !== id));
    try {
      await window.browserAPI.history.delete(id);
    } catch {
      void load(query);
    }
  };

  return (
    <div className="h-full w-full overflow-y-auto bg-[var(--bg)] text-[var(--text)]" data-testid="history-page">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={onBack}
            className="p-2 rounded-lg hover:bg-[var(--hover)] text-[var(--text-muted)] transition-colors"
            title="Back"
            aria-label="Back"
          >
            <ArrowLeft size={18} />
          </button>
          <HistoryIcon size={20} className="text-[var(--text-muted)]" />
          <h1 className="text-xl font-semibold">History</h1>
          <div className="flex-1" />
          <button
            onClick={() => setShowClear(true)}
            className="flex items-center gap-2 rounded-xl border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-muted)] hover:bg-[var(--hover)] hover:text-[var(--text)] transition-colors"
          >
            <Trash2 size={14} />
            Clear browsing data…
          </button>
        </div>

        {notice && (
          <div className="mb-4 flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm text-[var(--text-muted)]">
            <span>{notice}</span>
            <button onClick={() => setNotice('')} aria-label="Dismiss"><X size={14} /></button>
          </div>
        )}

        <div className="flex items-center gap-2 px-4 py-2.5 mb-6 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] focus-within:border-[var(--accent)] transition-colors">
          <SearchIcon size={15} className="text-[var(--text-faint)] shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search history…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--text-faint)]"
            spellCheck={false}
            autoFocus
          />
          {query && (
            <button onClick={() => setQuery('')} aria-label="Clear search"><X size={13} className="text-[var(--text-faint)]" /></button>
          )}
        </div>

        {loading && <p className="text-sm text-[var(--text-faint)]">Loading…</p>}
        {!loading && entries.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-20 text-[var(--text-faint)]">
            <HistoryIcon size={36} />
            <p className="text-sm">{query ? 'No matching history entries.' : 'No history yet — pages you visit will appear here.'}</p>
          </div>
        )}

        {grouped.map((group) => (
          <section key={group.day} className="mb-6">
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[var(--text-faint)]">{group.day}</h2>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
              {group.items.map((entry, index) => (
                <div
                  key={entry.id}
                  className={`group flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--hover)] transition-colors ${
                    index > 0 ? 'border-t border-[var(--border)]' : ''
                  }`}
                >
                  <span className="text-[11px] tabular-nums text-[var(--text-faint)] w-12 shrink-0">
                    {new Date(entry.visited_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {entry.favicon ? (
                    <img src={entry.favicon} alt="" className="h-4 w-4 shrink-0 rounded-sm" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                  ) : (
                    <Globe size={14} className="shrink-0 text-[var(--text-faint)]" />
                  )}
                  <button
                    className="min-w-0 flex-1 text-left"
                    onClick={() => onNavigate(entry.url)}
                    title={entry.url}
                  >
                    <span className="block truncate text-sm">{entry.title || entry.url}</span>
                    <span className="block truncate text-xs text-[var(--text-faint)]">{entry.url}</span>
                  </button>
                  <button
                    onClick={() => void removeEntry(entry.id)}
                    className="shrink-0 p-1.5 rounded-lg text-[var(--text-faint)] opacity-0 group-hover:opacity-100 hover:bg-[var(--border-strong)] hover:text-[var(--text)] transition-all"
                    title="Remove entry"
                    aria-label={`Remove ${entry.title || entry.url} from history`}
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {showClear && (
        <ClearBrowsingDataDialog
          onClose={() => setShowClear(false)}
          onDone={(cleared) => {
            setShowClear(false);
            setNotice(cleared.length > 0 ? `Cleared: ${cleared.join(', ')}.` : 'Nothing selected was cleared.');
            void load(query);
          }}
        />
      )}
    </div>
  );
};
