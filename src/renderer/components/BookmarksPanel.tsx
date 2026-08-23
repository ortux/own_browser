import React, { useState } from 'react';
import { Bookmark, Search, Trash2, X, ExternalLink } from 'lucide-react';
import { useBookmarks } from '../hooks/useBookmarks';
import type { Bookmark as BookmarkType } from '../../shared/types';

interface BookmarksPanelProps {
  onNavigate: (url: string) => void;
  onClose: () => void;
}

export const BookmarksPanel: React.FC<BookmarksPanelProps> = ({ onNavigate, onClose }) => {
  const { bookmarks, remove } = useBookmarks();
  const [query, setQuery] = useState('');

  const filtered = query.trim()
    ? bookmarks.filter(
        (b) =>
          b.title.toLowerCase().includes(query.toLowerCase()) ||
          b.url.toLowerCase().includes(query.toLowerCase())
      )
    : bookmarks;

  return (
    <div className="flex flex-col h-full bg-[var(--surface)] border-l border-[var(--border)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] shrink-0">
        <div className="flex items-center gap-2 text-[var(--text)]">
          <Bookmark size={15} />
          <span className="text-sm font-semibold">Bookmarks</span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded hover:bg-[var(--hover)] text-[var(--text-faint)] transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2 shrink-0">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--chrome)] border border-[var(--border)] focus-within:border-[var(--accent)] transition-colors">
          <Search size={13} className="text-[var(--text-faint)] shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search bookmarks…"
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
        {filtered.length === 0 && (
          <p className="text-center py-8 text-xs text-[var(--text-faint)]">
            {query ? 'No results' : 'No bookmarks yet'}
          </p>
        )}
        {filtered.map((bm: BookmarkType) => (
          <div
            key={bm.id}
            className="group flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-[var(--hover)] cursor-pointer transition-colors"
            onClick={() => onNavigate(bm.url)}
          >
            {bm.favicon
              ? <img src={bm.favicon} alt="" className="w-4 h-4 rounded-sm shrink-0"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              : <Bookmark size={14} className="text-[var(--text-faint)] shrink-0" />
            }
            <div className="flex-1 min-w-0">
              <p className="text-sm text-[var(--text)] truncate leading-none">{bm.title || bm.url}</p>
              <p className="text-[11px] text-[var(--text-faint)] truncate mt-0.5">{bm.url}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={(e) => { e.stopPropagation(); onNavigate(bm.url); }}
                className="p-0.5 rounded hover:text-[var(--accent)] transition-colors"
                title="Open"
              >
                <ExternalLink size={12} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); remove(bm.url); }}
                className="p-0.5 rounded hover:text-red-400 transition-colors"
                title="Remove bookmark"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
