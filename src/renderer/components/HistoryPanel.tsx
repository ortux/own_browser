import React, { useMemo } from 'react';
import { Search, Trash2, Clock, X, RotateCcw } from 'lucide-react';
import { useHistory } from '../hooks/useHistory';
import { groupHistory } from '../lib/historyGrouping';

interface HistoryPanelProps {
  onNavigate: (url: string) => void;
  onClose: () => void;
}

function timeOfDay(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function dayLabel(ms: number): string {
  const d = new Date(ms);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Today';
  const y = new Date(today);
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

export const HistoryPanel: React.FC<HistoryPanelProps> = ({ onNavigate, onClose }) => {
  const { entries, loading, query, setQuery, deleteEntry, clearAll } = useHistory();

  const groups = useMemo(() => groupHistory(entries), [entries]);
  const showGroups = !query.trim();

  return (
    <div className="flex flex-col h-full bg-[var(--surface)] border-l border-[var(--border)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] shrink-0">
        <div className="flex items-center gap-2 text-[var(--text)]">
          <Clock size={15} />
          <span className="text-sm font-semibold">History</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={clearAll}
            title="Clear all history"
            className="p-1.5 rounded hover:bg-[var(--hover)] text-[var(--text-faint)] hover:text-[var(--danger)] transition-colors"
          >
            <RotateCcw size={13} />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-[var(--hover)] text-[var(--text-faint)] transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2 shrink-0">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[var(--chrome)] border border-[var(--border)]">
          <Search size={13} className="text-[var(--text-faint)] shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search history…"
            className="flex-1 bg-transparent text-sm text-[var(--text)] placeholder-[var(--text-faint)] outline-none"
            style={{ WebkitUserSelect: 'text', userSelect: 'text' }}
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-[var(--text-faint)]">
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {loading && <p className="text-center py-8 text-xs text-[var(--text-faint)]">Loading…</p>}
        {!loading && entries.length === 0 && (
          <p className="text-center py-8 text-xs text-[var(--text-faint)]">
            {query ? 'No results' : 'No history yet'}
          </p>
        )}

        {showGroups
          ? groups.map((g) => (
              <section key={g.label} className="mb-2">
                <h3 className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">
                  {g.label}
                </h3>
                {g.entries.map((entry) => (
                  <Row
                    key={entry.id}
                    entry={entry}
                    onNavigate={onNavigate}
                    onDelete={deleteEntry}
                    secondary={timeOfDay(entry.visited_at)}
                  />
                ))}
              </section>
            ))
          : entries.map((entry) => (
              <Row
                key={entry.id}
                entry={entry}
                onNavigate={onNavigate}
                onDelete={deleteEntry}
                secondary={dayLabel(entry.visited_at)}
              />
            ))}
      </div>
    </div>
  );
};

function Row({
  entry,
  onNavigate,
  onDelete,
  secondary,
}: {
  entry: import('../../shared/types').HistoryEntry;
  onNavigate: (url: string) => void;
  onDelete: (id: number) => void;
  secondary: string;
}) {
  return (
    <div
      className="group flex items-center gap-2.5 px-3 py-2 rounded-md hover:bg-[var(--hover)] cursor-pointer transition-colors"
      onClick={() => onNavigate(entry.url)}
    >
      {entry.favicon ? (
        <img
          src={entry.favicon}
          alt=""
          className="w-4 h-4 rounded-sm shrink-0"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      ) : (
        <div className="w-4 h-4 rounded-sm bg-[var(--border)] shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[var(--text)] truncate leading-none">
          {entry.title || entry.url}
        </p>
        <p className="text-[11px] text-[var(--text-faint)] truncate mt-0.5">{entry.url}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[10px] text-[var(--text-faint)]">{secondary}</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(entry.id);
          }}
          className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:text-[var(--danger)] transition-all"
          title="Remove"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}
