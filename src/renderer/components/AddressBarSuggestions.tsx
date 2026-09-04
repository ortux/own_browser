import React, { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { Search, CornerDownLeft } from 'lucide-react';
import type { HistoryEntry, Bookmark } from '../../shared/types';

// ── Types ────────────────────────────────────────────────────────────────────

export interface SuggestionItem {
  id: string;
  title: string;
  url: string;
  favicon?: string | null;
}

interface AddressBarSuggestionsProps {
  query: string;
  isOpen: boolean;
  activeIndex: number;
  onSelect: (item: SuggestionItem) => void;
  onActiveIndexChange: (index: number) => void;
  /** Called when activeIndex changes — passes the highlighted item or null. */
  onHighlight: (item: SuggestionItem | null) => void;
  onClose: () => void;
  /** Updated with the total number of rendered suggestion rows. */
  onCountChange?: (count: number) => void;
  /** Search engine URL template (e.g. "https://google.com/search?q=%s"). */
  searchEngineUrl: string;
  // Feature flags (from General settings)
  searchSuggestions: boolean;
  historySuggestions: boolean;
  bookmarkSuggestions: boolean;
  searchFromAddressBar: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function domainOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Bold the portion of `text` that matches `query`. */
function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const escaped = escapeRegExp(query);
  const regex = new RegExp(`(${escaped})`, 'ig');
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <span key={i} className="font-semibold">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

// ── Deduplicated local filter (client-side) ─────────────────────────────────

function filterLocal<T extends { title: string; url: string }>(
  entries: T[],
  query: string
): T[] {
  const q = query.toLowerCase();
  const seen = new Set<string>();
  const out: T[] = [];
  for (const e of entries) {
    if (seen.has(e.url)) continue;
    seen.add(e.url);
    if (
      e.title.toLowerCase().includes(q) ||
      e.url.toLowerCase().includes(q)
    ) {
      out.push(e);
    }
  }
  return out;
}

// ── Remote suggestions (Google Autocomplete via main process IPC) ───────────

const remoteCache = new Map<string, string[]>();

async function fetchRemoteSuggestions(query: string): Promise<string[]> {
  if (!query.trim()) return [];
  const cached = remoteCache.get(query);
  if (cached) return cached;
  try {
    const suggestions = await window.browserAPI.searchSuggestions(query);
    remoteCache.set(query, suggestions);
    if (remoteCache.size > 200) {
      const first = remoteCache.keys().next().value!;
      remoteCache.delete(first);
    }
    return suggestions;
  } catch {
    return [];
  }
}

// ── Main Component ───────────────────────────────────────────────────────────

const AddressBarSuggestions: React.FC<AddressBarSuggestionsProps> = ({
  query,
  isOpen,
  activeIndex,
  onSelect,
  onActiveIndexChange,
  onHighlight,
  onClose,
  onCountChange,
  searchEngineUrl,
  searchSuggestions,
  historySuggestions,
  bookmarkSuggestions,
  searchFromAddressBar,
}) => {
  const [localHistory, setLocalHistory] = useState<HistoryEntry[]>([]);
  const [localBookmarks, setLocalBookmarks] = useState<Bookmark[]>([]);
  const [remoteSuggestions, setRemoteSuggestions] = useState<string[]>([]);
  const [loadingRemote, setLoadingRemote] = useState(false);
  const requestRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Fetch local data ─────────────────────────────────────────────────────

  const fetchLocal = useCallback(
    async (q: string) => {
      if (!window.browserAPI) return;
      const request = ++requestRef.current;
      const trimmed = q.trim();
      try {
        const [fromHistory, fromBookmarks] = await Promise.all([
          historySuggestions
            ? trimmed
              ? window.browserAPI.history.search(trimmed)
              : window.browserAPI.history.get()
            : Promise.resolve([]),
          bookmarkSuggestions
            ? trimmed
              ? window.browserAPI.bookmarks.search(trimmed)
              : window.browserAPI.bookmarks.get()
            : Promise.resolve([]),
        ]);
        if (request === requestRef.current) {
          setLocalHistory(fromHistory);
          setLocalBookmarks(fromBookmarks);
        }
      } catch {
        if (request === requestRef.current) {
          setLocalHistory([]);
          setLocalBookmarks([]);
        }
      }
    },
    [historySuggestions, bookmarkSuggestions]
  );

  // ── Fetch remote suggestions ─────────────────────────────────────────────

  const fetchRemote = useCallback(
    async (q: string) => {
      if (!searchSuggestions || !searchFromAddressBar || !q.trim()) {
        setRemoteSuggestions([]);
        return;
      }
      const request = ++requestRef.current;
      setLoadingRemote(true);
      try {
        const results = await fetchRemoteSuggestions(q.trim());
        if (request === requestRef.current) {
          setRemoteSuggestions(results);
        }
      } catch {
        if (request === requestRef.current) {
          setRemoteSuggestions([]);
        }
      } finally {
        if (request === requestRef.current) {
          setLoadingRemote(false);
        }
      }
    },
    [searchSuggestions, searchFromAddressBar]
  );

  // ── Debounced effect: fetch everything when query changes ────────────────

  useEffect(() => {
    if (!isOpen) return;
    setRemoteSuggestions([]);

    const timer = setTimeout(() => {
      void fetchLocal(query);
      void fetchRemote(query);
    }, 150);
    return () => clearTimeout(timer);
  }, [query, isOpen, fetchLocal, fetchRemote]);

  // ── Rank & merge into flat list ──────────────────────────────────────────

  const { allItems, totalCount } = useMemo(() => {
    const trimmed = query.trim();

    // 1. Bookmarks — exact URL match first, then title/URL contains
    const bmFiltered = filterLocal(
      localBookmarks.map((b) => ({ title: b.title, url: b.url, favicon: b.favicon })),
      trimmed
    );
    const bmSorted = [...bmFiltered].sort((a, b) => {
      const aExact = a.url === trimmed || a.url === `https://${trimmed}`;
      const bExact = b.url === trimmed || b.url === `https://${trimmed}`;
      if (aExact !== bExact) return aExact ? -1 : 1;
      return 0;
    });
    const bookmarks: SuggestionItem[] = bmSorted.slice(0, 4).map((b, i) => ({
      id: `bm-${i}`,
      title: b.title || domainOf(b.url),
      url: b.url,
      favicon: b.favicon,
    }));

    // 2. History — deduplicated by domain, most recent first
    const histFiltered = filterLocal(
      localHistory.map((h) => ({ title: h.title, url: h.url, favicon: h.favicon })),
      trimmed
    );
    const seenDomains = new Set<string>();
    const histDeduped = histFiltered.filter((h) => {
      const d = domainOf(h.url);
      if (seenDomains.has(d)) return false;
      seenDomains.add(d);
      return true;
    });
    const history: SuggestionItem[] = histDeduped.slice(0, 5).map((h, i) => ({
      id: `hist-${i}`,
      title: h.title || domainOf(h.url),
      url: h.url,
      favicon: h.favicon,
    }));

    // 3. Remote search suggestions — exclude anything already in local results
    const localUrls = new Set([
      ...bookmarks.map((b) => b.url),
      ...history.map((h) => h.url),
    ]);
    const localTitles = new Set([
      ...bookmarks.map((b) => b.title.toLowerCase()),
      ...history.map((h) => h.title.toLowerCase()),
    ]);
    const search: SuggestionItem[] = remoteSuggestions
      .filter((s) => {
        const sLower = s.toLowerCase();
        return !localUrls.has(s) && !localTitles.has(sLower);
      })
      .slice(0, 5)
      .map((s, i) => ({
        id: `search-${i}`,
        title: s,
        url: searchEngineUrl.replace('%s', encodeURIComponent(s)),
      }));

    const merged = [...bookmarks, ...history, ...search];
    return { allItems: merged, totalCount: merged.length };
  }, [query, localHistory, localBookmarks, remoteSuggestions, searchEngineUrl]);

  // ── Notify parent of highlighted item ────────────────────────────────────

  useEffect(() => {
    if (activeIndex >= 0 && activeIndex < allItems.length) {
      onHighlight(allItems[activeIndex]);
    } else {
      onHighlight(null);
    }
  }, [activeIndex, allItems, onHighlight]);

  // ── Expose total count to parent for keyboard bounds checking ─────────────

  useEffect(() => {
    onCountChange?.(totalCount);
  }, [totalCount, onCountChange]);

  // ── Click outside to dismiss ─────────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, onClose]);

  // ── Auto-scroll active item into view ────────────────────────────────────

  useEffect(() => {
    if (activeIndex < 0) return;
    const el = containerRef.current?.querySelector(`[data-suggestion-idx="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  // ── Nothing to show? ────────────────────────────────────────────────────

  const hasAnyContent = totalCount > 0 || loadingRemote;

  if (!isOpen || !hasAnyContent) {
    if (isOpen) {
      return (
        <div
          ref={containerRef}
          className="absolute bottom-full left-0 right-0 mb-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-[0_-8px_30px_rgba(0,0,0,0.35)] p-3 z-50"
          onMouseDown={(e) => e.preventDefault()}
        >
          <div className="flex items-center gap-2 px-2 text-sm text-[var(--text-muted)]">
            <Search size={14} />
            {query.trim() ? 'No matches found' : 'Type to search'}
          </div>
        </div>
      );
    }
    return null;
  }

  return (
    <div
      ref={containerRef}
      id="navbar-suggestions"
      role="listbox"
      aria-label="Suggestions"
      className="absolute bottom-full left-0 right-0 mb-2 max-h-[50vh] overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-[0_-8px_30px_rgba(0,0,0,0.35)] z-50 overscroll-contain"
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="py-0.5">
        {allItems.map((item, idx) => {
          const isActive = idx === activeIndex;
          const isSearch = !item.favicon;
          return (
            <button
              key={item.id}
              type="button"
              data-suggestion-idx={idx}
              role="option"
              aria-selected={isActive}
              onMouseEnter={() => onActiveIndexChange(idx)}
              onClick={() => onSelect(item)}
              className={`flex w-full items-center gap-3 px-3 py-1.5 text-left transition-colors duration-75 ${
                isActive
                  ? 'bg-[var(--accent-soft)]'
                  : 'hover:bg-[var(--hover)]'
              }`}
            >
              {item.favicon ? (
                <img
                  src={item.favicon}
                  alt=""
                  className="w-4 h-4 shrink-0 rounded-sm"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <Search size={14} className="w-4 h-4 shrink-0 text-[var(--text-faint)]" />
              )}
              <div className="min-w-0 flex-1 flex items-baseline gap-2">
                <span className="truncate text-sm text-[var(--text)]">
                  <HighlightedText text={item.title} query={query} />
                </span>
                <span className="truncate text-xs text-[var(--text-faint)]">
                  {isSearch ? item.url : domainOf(item.url)}
                </span>
              </div>
              {isActive && (
                <CornerDownLeft size={13} className="shrink-0 text-[var(--text-faint)]" />
              )}
            </button>
          );
        })}
      </div>
      {loadingRemote && (
        <div className="flex items-center justify-center gap-2 border-t border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-faint)]">
          <div className="w-3 h-3 rounded-full border-2 border-[var(--text-faint)] border-t-transparent animate-spin" />
          Fetching suggestions…
        </div>
      )}
    </div>
  );
};

export default AddressBarSuggestions;
