import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search as SearchIcon,
  Globe,
  Star,
  Plus,
  EyeOff,
  Download as DownloadIcon,
  History as HistoryIcon,
  Activity,
  Settings as SettingsIcon,
  Sun,
  Moon,
  ShieldCheck,
  ShieldOff,
  Trash2,
  CornerDownLeft,
  Layers,
} from 'lucide-react';
import type { HistoryEntry, Bookmark } from '../../shared/types';
import { useSettingsStore } from '../stores/settingsStore';

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  run: () => void;
  keywords?: string;
}

/** A unified palette row: either a command or a searchable destination. */
interface PaletteRow {
  kind: 'command' | 'history' | 'bookmark';
  id: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  run: () => void;
  score: number;
}

interface CommandPaletteProps {
  onClose: () => void;
  onNavigate: (url: string) => void;
  onCreateTab: (privateMode: boolean) => void;
  onOpenUrl: (url: string) => void;
  onOpenSettings: () => void;
  onOpenFind: () => void;
  onClearData: () => void;
}

/** Simple subsequence fuzzy match: every query char appears, in order. */
function fuzzyScore(text: string, query: string): number {
  if (!query) return 1;
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  let score = 0;
  let index = 0;
  for (const char of lowerQuery) {
    const found = lowerText.indexOf(char, index);
    if (found === -1) return 0;
    score += found === index ? 2 : 1;
    index = found + 1;
  }
  return score + (lowerText.startsWith(lowerQuery) ? 10 : 0);
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  onClose,
  onNavigate,
  onCreateTab,
  onOpenUrl,
  onOpenSettings,
  onOpenFind,
  onClearData,
}) => {
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const blockTrackers = useSettingsStore((s) => s.security.blockTrackers);
  const setSecurityFlag = useSettingsStore((s) => s.setSecurityFlag);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Prefetch a slice of history + bookmarks for the tab/ bookmark switcher.
  useEffect(() => {
    window.browserAPI.history.get(100).then(setHistory).catch(() => {});
    window.browserAPI.bookmarks.get().then(setBookmarks).catch(() => {});
  }, []);

  const commands = useMemo<Command[]>(() => {
    const base: Command[] = [
      { id: 'new-tab', label: 'New tab', icon: <Plus size={15} />, run: () => onCreateTab(false), keywords: 'open create' },
      { id: 'new-private', label: 'New private tab', icon: <EyeOff size={15} />, run: () => onCreateTab(true), keywords: 'incognito private' },
      { id: 'downloads', label: 'Open downloads', icon: <DownloadIcon size={15} />, run: () => onOpenUrl('zyphora://downloads') },
      { id: 'history', label: 'Open history', icon: <HistoryIcon size={15} />, run: () => onOpenUrl('zyphora://history') },
      { id: 'diagnostics', label: 'Open diagnostics', icon: <Activity size={15} />, run: () => onOpenUrl('zyphora://diagnostics') },
      { id: 'settings', label: 'Open settings', icon: <SettingsIcon size={15} />, run: onOpenSettings, keywords: 'preferences' },
      { id: 'find', label: 'Find in page', hint: 'Ctrl+F', icon: <SearchIcon size={15} />, run: onOpenFind },
      {
        id: 'theme',
        label: theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
        icon: theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />,
        run: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
      },
      {
        id: 'adblock',
        label: blockTrackers ? 'Disable ad blocker' : 'Enable ad blocker',
        icon: blockTrackers ? <ShieldOff size={15} /> : <ShieldCheck size={15} />,
        run: () => setSecurityFlag('blockTrackers', !blockTrackers),
        keywords: 'ads trackers shield',
      },
      { id: 'clear-data', label: 'Clear browsing data…', icon: <Trash2 size={15} />, run: onClearData },
    ];
    return base;
  }, [theme, blockTrackers, setTheme, setSecurityFlag, onCreateTab, onOpenUrl, onOpenSettings, onOpenFind, onClearData]);

  const rows = useMemo<PaletteRow[]>(() => {
    const q = query.trim();
    const out: PaletteRow[] = [];

    for (const command of commands) {
      const score = fuzzyScore(`${command.label} ${command.keywords ?? ''}`, q);
      if (score > 0) out.push({ kind: 'command', ...command, score });
    }
    if (q) {
      for (const entry of history.slice(0, 40)) {
        const score = fuzzyScore(`${entry.title} ${entry.url}`, q);
        if (score > 0) {
          out.push({
            kind: 'history', id: `h-${entry.id}`, label: entry.title || entry.url, hint: entry.url,
            icon: <Globe size={15} />, run: () => onNavigate(entry.url), score,
          });
        }
      }
      for (const bookmark of bookmarks.slice(0, 40)) {
        const score = fuzzyScore(`${bookmark.title} ${bookmark.url}`, q);
        if (score > 0) {
          out.push({
            kind: 'bookmark', id: `b-${bookmark.id}`, label: bookmark.title || bookmark.url, hint: bookmark.url,
            icon: <Star size={15} className="text-yellow-400" />, run: () => onNavigate(bookmark.url), score,
          });
        }
      }
      out.sort((a, b) => b.score - a.score);
    } else {
      // Empty query: commands first, then recent history.
      for (const entry of history.slice(0, 5)) {
        out.push({
          kind: 'history', id: `h-${entry.id}`, label: entry.title || entry.url, hint: entry.url,
          icon: <Globe size={15} />, run: () => onNavigate(entry.url), score: 0,
        });
      }
    }
    return out.slice(0, 12);
  }, [commands, history, bookmarks, query, onNavigate]);

  useEffect(() => { setActiveIdx(0); }, [query]);

  useEffect(() => {
    const row = listRef.current?.children[activeIdx] as HTMLElement | undefined;
    row?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  const runActive = () => {
    const row = rows[activeIdx];
    if (row) { onClose(); row.run(); }
  };

  return (
    <div className="absolute inset-0 z-50 flex items-start justify-center bg-black/40 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Command palette">
      <div
        className="w-[560px] max-w-[90vw] rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[0_24px_80px_rgba(0,0,0,0.5)] overflow-hidden"
        style={{ animation: 'popIn 140ms ease-out' }}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)]">
          <SearchIcon size={16} className="text-[var(--text-faint)] shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, rows.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
              else if (e.key === 'Enter') { e.preventDefault(); runActive(); }
              else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
            }}
            placeholder="Type a command, or search tabs, history and bookmarks…"
            className="flex-1 bg-transparent text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]"
            spellCheck={false}
          />
          <kbd className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] text-[var(--text-faint)]">Esc</kbd>
        </div>

        <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-1.5">
          {rows.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-[var(--text-faint)]">No matches</p>
          )}
          {rows.map((row, i) => (
            <button
              key={row.id}
              type="button"
              onMouseEnter={() => setActiveIdx(i)}
              onClick={() => { onClose(); row.run(); }}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                i === activeIdx ? 'bg-[var(--hover)]' : 'hover:bg-[var(--hover)]'
              }`}
            >
              <span className="shrink-0 text-[var(--text-muted)]">{row.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-[var(--text)]">{row.label}</span>
                {row.hint && <span className="block truncate text-xs text-[var(--text-faint)]">{row.hint}</span>}
              </span>
              {i === activeIdx && <CornerDownLeft size={13} className="shrink-0 text-[var(--text-faint)]" />}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-4 border-t border-[var(--border)] px-4 py-2 text-[10px] text-[var(--text-faint)]">
          <span className="flex items-center gap-1"><Layers size={10} /> Commands</span>
          <span className="flex items-center gap-1"><Globe size={10} /> History</span>
          <span className="flex items-center gap-1"><Star size={10} /> Bookmarks</span>
        </div>
      </div>
    </div>
  );
};
