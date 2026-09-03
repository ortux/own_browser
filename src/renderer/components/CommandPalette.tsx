import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  Search,
  LayoutGrid,
  Star,
  Clock,
  X,
  Pin,
  VolumeX,
  RotateCcw,
} from 'lucide-react';
import { useBrowserStore } from '../stores/tabStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useBookmarks } from '../hooks/useBookmarks';
import { useHistory } from '../hooks/useHistory';
import { normalizeNavigationUrl } from '../../shared/navigation';

type Item =
  | { kind: 'tab'; id: string; title: string; url: string; active: boolean; muted: boolean; pinned: boolean }
  | { kind: 'bookmark'; id: number; title: string; url: string }
  | { kind: 'history'; id: number; title: string; url: string }
  | { kind: 'action'; id: string; label: string; hint?: string; run: () => void };

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (url: string) => void;
  onNewTab: () => void;
  onActivateTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onToggleMute: (id: string) => void;
  onTogglePin: (id: string) => void;
  onOpenSettings: () => void;
  onOpenDownloads: () => void;
  onPrint: () => void;
  onFind: () => void;
  onReload: () => void;
  onGoBack: () => void;
  onGoForward: () => void;
  onReaderToggle: () => void;
}

function score(text: string, query: string): number {
  if (!query) return 1;
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  const i = t.indexOf(q);
  if (i < 0) return 0;
  // Earlier match + word boundary beats substring.
  let s = 100 - i;
  if (i === 0 || /\W/.test(t[i - 1])) s += 30;
  if (t.startsWith(q)) s += 50;
  return s;
}

export const CommandPalette: React.FC<CommandPaletteProps> = (props) => {
  const tabs = useBrowserStore((s) => s.tabs);
  const activeTabId = useBrowserStore((s) => s.activeTabId);
  const { bookmarks } = useBookmarks();
  const { entries: history } = useHistory();
  const buildSearchUrl = useSettingsStore((s) => s.buildSearchUrl);

  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset whenever the palette opens.
  useEffect(() => {
    if (props.open) {
      setQ('');
      setIdx(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [props.open]);

  // ── Build the candidate list. ───────────────────────────────────────────
  const items: Item[] = useMemo(() => {
    const out: Item[] = [];
    for (const t of tabs) {
      out.push({
        kind: 'tab',
        id: t.id,
        title: t.title || (t.url === 'about:blank' ? 'New Tab' : t.url),
        url: t.url,
        active: t.id === activeTabId,
        muted: t.muted,
        pinned: t.pinned,
      });
    }
    for (const b of bookmarks) {
      out.push({ kind: 'bookmark', id: b.id, title: b.title || b.url, url: b.url });
    }
    // De-dup history by url (most recent wins).
    const seen = new Set<string>();
    for (const h of history) {
      if (seen.has(h.url)) continue;
      seen.add(h.url);
      out.push({ kind: 'history', id: h.id, title: h.title || h.url, url: h.url });
      if (out.length > 200) break;
    }

    // Built-in actions.
    out.push(
      { kind: 'action', id: 'act:newtab', label: 'Open new tab', hint: 'Ctrl+T', run: props.onNewTab },
      { kind: 'action', id: 'act:settings', label: 'Open settings', hint: 'Ctrl+,', run: props.onOpenSettings },
      { kind: 'action', id: 'act:downloads', label: 'Open downloads', hint: 'Ctrl+J', run: props.onOpenDownloads },
      { kind: 'action', id: 'act:print', label: 'Print page', hint: 'Ctrl+P', run: props.onPrint },
      { kind: 'action', id: 'act:find', label: 'Find on page', hint: 'Ctrl+F', run: props.onFind },
      { kind: 'action', id: 'act:reload', label: 'Reload', hint: 'Ctrl+R', run: props.onReload },
      { kind: 'action', id: 'act:back', label: 'Go back', hint: 'Alt+←', run: props.onGoBack },
      { kind: 'action', id: 'act:fwd', label: 'Go forward', hint: 'Alt+→', run: props.onGoForward },
      { kind: 'action', id: 'act:reader', label: 'Toggle reading mode', hint: 'Ctrl+Shift+R', run: props.onReaderToggle },
    );
    return out;
  }, [tabs, activeTabId, bookmarks, history, props]);

  // ── Filter / sort. ──────────────────────────────────────────────────────
  const ranked = useMemo(() => {
    if (!q.trim()) {
      // Tabs first, then bookmarks, then history, then actions.
      const order: Record<string, number> = { tab: 0, bookmark: 1, history: 2, action: 3 };
      return [...items]
        .sort((a, b) => order[a.kind] - order[b.kind])
        .slice(0, 60);
    }
    const scored: { item: Item; s: number }[] = [];
    for (const it of items) {
      const text =
        it.kind === 'tab' || it.kind === 'bookmark' || it.kind === 'history'
          ? `${it.title} ${it.url}`
          : it.label;
      const s = score(text, q);
      if (s > 0) scored.push({ item: it, s });
    }
    scored.sort((a, b) => b.s - a.s);
    return scored.slice(0, 60).map((x) => x.item);
  }, [items, q]);

  // If the query looks like a URL or a search, prepend a synthetic "go" action.
  const syntheticGo = useMemo<Item | null>(() => {
    const t = q.trim();
    if (!t) return null;
    const looksLikeUrl = /^[\w-]+(\.[\w-]+)+/.test(t) || t.startsWith('http') || t.startsWith('about:');
    const url = looksLikeUrl ? normalizeNavigationUrl(t) : null;
    const destination = url ?? buildSearchUrl(t);
    return {
      kind: 'action',
      id: 'act:go',
      label: looksLikeUrl ? `Go to ${t}` : `Search for "${t}"`,
      hint: '↵',
      run: () => props.onNavigate(destination),
    };
  }, [q, buildSearchUrl, props]);

  const finalList = useMemo(() => {
    if (!syntheticGo) return ranked;
    // Put the synthetic "go" at the top, then dedupe by id.
    const seen = new Set([syntheticGo.id]);
    const out: Item[] = [syntheticGo];
    for (const r of ranked) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      out.push(r);
    }
    return out.slice(0, 60);
  }, [syntheticGo, ranked]);

  // Keep idx in range.
  useEffect(() => {
    if (idx >= finalList.length) setIdx(0);
  }, [finalList, idx]);

  // Scroll active row into view.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const el = list.querySelector<HTMLElement>(`[data-row="${idx}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [idx, finalList.length]);

  const run = useCallback(
    (it: Item) => {
      if (it.kind === 'tab') {
        props.onActivateTab(it.id);
      } else if (it.kind === 'bookmark' || it.kind === 'history') {
        props.onNavigate(it.url);
      } else {
        it.run();
      }
      props.onClose();
    },
    [props]
  );

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIdx((i) => Math.min(finalList.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIdx((i) => Math.max(0, i - 1));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setIdx(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setIdx(finalList.length - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const it = finalList[idx];
      if (it) run(it);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      props.onClose();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      setIdx((i) => (e.shiftKey ? Math.max(0, i - 1) : Math.min(finalList.length - 1, i + 1)));
    } else if (e.key === 'Backspace' && (e.metaKey || e.ctrlKey) && q === '') {
      e.preventDefault();
      const cur = finalList[idx];
      if (cur?.kind === 'tab' && !cur.pinned) props.onCloseTab(cur.id);
    }
  };

  if (!props.open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center pt-[12vh] bg-black/35"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div
        className="w-full max-w-xl rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl overflow-hidden"
        style={{ animation: 'popIn 140ms var(--ease-out, ease-out)' }}
        onKeyDown={onKey}
      >
        {/* Input */}
        <div className="flex items-center gap-2 px-3.5 py-3 border-b border-[var(--border)]">
          <Search size={15} className="text-[var(--text-faint)] shrink-0" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setIdx(0);
            }}
            placeholder="Type a command, search, or URL…"
            className="flex-1 bg-transparent text-sm text-[var(--text)] placeholder:text-[var(--text-faint)] outline-none"
            style={{ WebkitUserSelect: 'text', userSelect: 'text' }}
          />
          {q && (
            <button
              onClick={() => {
                setQ('');
                setIdx(0);
                inputRef.current?.focus();
              }}
              className="text-[var(--text-faint)] p-1 rounded hover:bg-[var(--hover)]"
              title="Clear"
            >
              <X size={12} />
            </button>
          )}
          <kbd className="ml-1">Esc</kbd>
        </div>

        {/* List */}
        <div ref={listRef} className="max-h-[55vh] overflow-y-auto py-1">
          {finalList.length === 0 && (
            <p className="text-center text-xs text-[var(--text-faint)] py-12">No matches</p>
          )}
          {finalList.map((it, i) => {
            const active = i === idx;
            return (
              <div
                key={it.id}
                data-row={i}
                onMouseEnter={() => setIdx(i)}
                onClick={() => run(it)}
                className={`flex items-center gap-2.5 px-3 py-1.5 cursor-pointer transition-colors ${
                  active ? 'bg-[var(--selected)]' : 'hover:bg-[var(--hover)]'
                }`}
              >
                <RowIcon item={it} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-[var(--text)] truncate leading-tight">
                    {it.kind === 'tab' || it.kind === 'bookmark' || it.kind === 'history'
                      ? it.title
                      : it.label}
                  </p>
                  {it.kind === 'tab' || it.kind === 'bookmark' || it.kind === 'history' ? (
                    <p className="text-[11px] text-[var(--text-faint)] truncate">{it.url}</p>
                  ) : null}
                </div>
                <RowRight item={it} />
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-3 py-1.5 border-t border-[var(--border)] bg-[var(--paper-sunken)] text-[10px] text-[var(--text-faint)]">
          <div className="flex items-center gap-3">
            <span>
              <kbd>↑</kbd>
              <kbd>↓</kbd> navigate
            </span>
            <span>
              <kbd>↵</kbd> open
            </span>
            <span>
              <kbd>⌘</kbd>
              <kbd>⌫</kbd> close tab
            </span>
          </div>
          <span>{finalList.length} results</span>
        </div>
      </div>
    </div>
  );
};

function RowIcon({ item }: { item: Item }) {
  if (item.kind === 'tab')
    return (
      <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--paper-sunken)] text-[var(--text-muted)]">
        {item.pinned ? <Pin size={12} /> : <LayoutGrid size={12} />}
      </div>
    );
  if (item.kind === 'bookmark')
    return (
      <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--paper-sunken)] text-yellow-400">
        <Star size={12} fill="currentColor" />
      </div>
    );
  if (item.kind === 'history')
    return (
      <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--paper-sunken)] text-[var(--text-muted)]">
        <Clock size={12} />
      </div>
    );
  return (
    <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--paper-sunken)] text-[var(--text-muted)]">
      <RotateCcw size={12} />
    </div>
  );
}

function RowRight({ item }: { item: Item }) {
  if (item.kind === 'tab') {
    return (
      <div className="flex items-center gap-1 shrink-0">
        {item.muted && <VolumeX size={12} className="text-[var(--text-faint)]" />}
        {item.active && (
          <span className="text-[10px] uppercase tracking-wider text-[var(--text-faint)]">
            current
          </span>
        )}
      </div>
    );
  }
  if (item.kind === 'action' && item.hint) {
    return <span className="text-[10px] text-[var(--text-faint)] shrink-0">{item.hint}</span>;
  }
  return null;
}
