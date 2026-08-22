import React, { useEffect, useState } from 'react';
import { ArrowRight, Plus, X } from 'lucide-react';
import { useSettingsStore } from '../stores/settingsStore';

interface NewTabPageProps {
  onSearch: (url: string) => void;
}

interface Shortcut {
  name: string;
  url: string;
}

function looksLikeUrl(input: string): boolean {
  const trimmed = input.trim();
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('file://') ||
    trimmed.startsWith('about:') ||
    trimmed.startsWith('localhost')
  ) {
    return true;
  }
  return trimmed.includes('.') && !trimmed.includes(' ');
}

function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('file://') ||
    trimmed.startsWith('about:')
  ) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

function faviconFor(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?';
}

const DEFAULT_SHORTCUTS: Shortcut[] = [
  { name: 'GitHub', url: 'https://github.com' },
  { name: 'Wikipedia', url: 'https://wikipedia.org' },
  { name: 'Mozilla', url: 'https://mozilla.org' },
  { name: 'DuckDuckGo', url: 'https://duckduckgo.com' },
];

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export const NewTabPage: React.FC<NewTabPageProps> = ({ onSearch }) => {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [shortcuts, setShortcuts] = useState<Shortcut[]>(DEFAULT_SHORTCUTS);
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const buildSearchUrl = useSettingsStore((s) => s.buildSearchUrl);
  const getSearchEngine = useSettingsStore((s) => s.getSearchEngine);
  const engine = getSearchEngine();
  const now = useClock();

  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const date = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

  const handleSubmit = () => {
    const raw = query.trim();
    if (!raw) return;
    const url = looksLikeUrl(raw) ? raw : buildSearchUrl(raw);
    onSearch(url);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSubmit();
  };

  const resetAddForm = () => {
    setIsAdding(false);
    setNewName('');
    setNewUrl('');
  };

  const handleAddShortcut = () => {
    const url = newUrl.trim();
    if (!url) return;
    const name = newName.trim() || url.replace(/^https?:\/\//, '').split('/')[0];
    setShortcuts((prev) => [...prev, { name, url: normalizeUrl(url) }]);
    resetAddForm();
  };

  const handleAddKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleAddShortcut();
    if (e.key === 'Escape') resetAddForm();
  };

  const handleRemoveShortcut = (url: string) => {
    setShortcuts((prev) => prev.filter((s) => s.url !== url));
  };

  return (
    <div className="relative flex h-full flex-col items-center justify-center bg-[#0a0a0b] px-6 overflow-hidden">
      {/* faint ambient vignette, static — no moving decoration */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 38%, rgba(255,255,255,0.05), transparent 55%)',
        }}
      />

      <div className="relative w-full max-w-md">
        {/* Clock — the one signature element. Functional, not decorative. */}
        <div
          className="mb-14 text-center opacity-0 animate-[fadeIn_0.6s_ease-out_0.05s_forwards] motion-reduce:opacity-100 motion-reduce:animate-none"
        >
          <div
            className="font-mono text-[64px] leading-none tracking-tight text-[#ededed] tabular-nums"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {time}
          </div>
          <div className="mt-3 font-mono text-[11px] uppercase tracking-[0.2em] text-[#5a5a5f]">
            {date}
          </div>
        </div>

        {/* Search — a line, not a box. Brightens only on focus. */}
        <div
          className="opacity-0 animate-[fadeIn_0.6s_ease-out_0.2s_forwards] motion-reduce:opacity-100 motion-reduce:animate-none"
        >
          <div
            className={`flex items-center gap-3 border-b pb-3 transition-colors duration-300 motion-reduce:transition-none ${
              focused ? 'border-[#4a4a4f]' : 'border-[#232326]'
            }`}
          >
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder={`Search ${engine.name} or enter a URL`}
              className="flex-1 bg-transparent text-[15px] text-[#ededed] placeholder-[#5a5a5f] outline-none"
              autoFocus
            />
            <button
              onClick={handleSubmit}
              aria-label="Go"
              tabIndex={query ? 0 : -1}
              className={`shrink-0 text-[#8a8a8f] transition-all duration-200 hover:text-[#ededed] focus-visible:text-[#ededed] focus-visible:outline-none motion-reduce:transition-none ${
                query ? 'opacity-100 translate-x-0' : 'pointer-events-none opacity-0 -translate-x-1'
              }`}
            >
              <ArrowRight size={18} />
            </button>
          </div>
        </div>

        {/* Shortcuts — each tile gets a quiet highlight ring; nothing shouts */}
        <nav
          className="mt-10 flex flex-wrap items-stretch justify-center gap-2 opacity-0 animate-[fadeIn_0.6s_ease-out_0.35s_forwards] motion-reduce:opacity-100 motion-reduce:animate-none"
          aria-label="Shortcuts"
        >
          {shortcuts.map((link) => (
            <div key={link.url} className="group relative">
              <button
                onClick={() => onSearch(link.url)}
                className="flex w-[84px] flex-col items-center gap-2 rounded-lg border border-[#232326] bg-transparent px-2 py-3 transition-all duration-200 hover:border-[#3a3a3f] hover:bg-white/[0.03] focus-visible:border-[#3a3a3f] focus-visible:bg-white/[0.03] focus-visible:outline-none motion-reduce:transition-none"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[#2c2c30] font-mono text-xs text-[#8a8a8f]">
                  {faviconFor(link.name)}
                </span>
                <span className="w-full truncate text-center font-mono text-[10px] uppercase tracking-[0.08em] text-[#6e6e73] group-hover:text-[#ededed]">
                  {link.name}
                </span>
              </button>

              {/* remove — quiet, only appears on hover/focus */}
              <button
                onClick={() => handleRemoveShortcut(link.url)}
                aria-label={`Remove ${link.name}`}
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-[#2c2c30] bg-[#0a0a0b] text-[#6e6e73] opacity-0 transition-opacity duration-150 hover:text-[#ededed] group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none motion-reduce:transition-none"
              >
                <X size={11} />
              </button>
            </div>
          ))}

          {/* Add shortcut */}
          {isAdding ? (
            <div className="flex w-[168px] flex-col gap-1.5 rounded-lg border border-[#3a3a3f] bg-white/[0.03] p-2.5">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={handleAddKeyDown}
                placeholder="Name"
                className="w-full bg-transparent font-mono text-[11px] text-[#ededed] placeholder-[#5a5a5f] outline-none"
              />
              <input
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                onKeyDown={handleAddKeyDown}
                placeholder="URL"
                className="w-full border-t border-[#232326] bg-transparent pt-1.5 font-mono text-[11px] text-[#ededed] placeholder-[#5a5a5f] outline-none"
              />
              <div className="mt-0.5 flex items-center justify-end gap-3">
                <button
                  onClick={resetAddForm}
                  className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#6e6e73] hover:text-[#ededed] focus-visible:outline-none"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddShortcut}
                  disabled={!newUrl.trim()}
                  className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#ededed] disabled:text-[#4a4a4f] focus-visible:outline-none"
                >
                  Add
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setIsAdding(true)}
              aria-label="Add shortcut"
              className="flex w-[84px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[#2c2c30] px-2 py-3 text-[#5a5a5f] transition-all duration-200 hover:border-[#4a4a4f] hover:text-[#ededed] focus-visible:border-[#4a4a4f] focus-visible:text-[#ededed] focus-visible:outline-none motion-reduce:transition-none"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-dashed border-[#2c2c30]">
                <Plus size={14} />
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.08em]">Add</span>
            </button>
          )}
        </nav>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};