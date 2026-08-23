import React, { useState, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  X,
  Star,
  User,
  Lock,
  Search,
  Home,
  Puzzle,
  Settings,
} from 'lucide-react';
import type { Tab } from '../../shared/types';
import { useSettingsStore } from '../stores/settingsStore';

interface NavBarProps {
  activeTab: Tab | undefined;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onStop: () => void;
  onNavigate: (url: string) => void;
  onOpenSettings: () => void;
  onHome: () => void;
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

/** Strip protocol for a cleaner display when not focused */
function displayUrl(url: string): string {
  if (!url || url === 'about:blank') return '';
  return url.replace(/^https?:\/\//, '');
}

export const NavBar: React.FC<NavBarProps> = ({
  activeTab,
  onBack,
  onForward,
  onReload,
  onStop,
  onNavigate,
  onOpenSettings,
  onHome,
}) => {
  const [input, setInput] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const buildSearchUrl = useSettingsStore((s) => s.buildSearchUrl);
  const getSearchEngine = useSettingsStore((s) => s.getSearchEngine);
  const account = useSettingsStore((s) => s.account);
  const engine = getSearchEngine();

  const isSecure = activeTab?.url?.startsWith('https://');
  const isLoading = activeTab?.loading;

  useEffect(() => {
    if (!isFocused) {
      setInput(activeTab?.url && activeTab.url !== 'about:blank' ? activeTab.url : '');
    }
  }, [activeTab?.url, activeTab?.id, isFocused]);

  const handleFocus = () => {
    setIsFocused(true);
    // Show full URL when focused, select all
    setInput(activeTab?.url && activeTab.url !== 'about:blank' ? activeTab.url : '');
    setTimeout(() => {
      const el = document.activeElement as HTMLInputElement;
      el?.select();
    }, 0);
  };

  const handleBlur = () => {
    setIsFocused(false);
    // Restore stripped display URL
    setInput(activeTab?.url && activeTab.url !== 'about:blank' ? activeTab.url : '');
  };

  const handleSubmit = () => {
    const raw = input.trim();
    if (!raw) return;
    const url = looksLikeUrl(raw) ? raw : buildSearchUrl(raw);
    onNavigate(url);
    (document.activeElement as HTMLElement)?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSubmit();
    if (e.key === 'Escape') {
      setInput(activeTab?.url && activeTab.url !== 'about:blank' ? activeTab.url : '');
      (document.activeElement as HTMLElement)?.blur();
    }
  };

  return (
    <div className="flex items-center gap-1 px-2 py-1.5 bg-[var(--chrome)] border-t border-[var(--border)] shrink-0">
      {/* Navigation buttons */}
      <button
        onClick={onBack}
        disabled={!activeTab?.canGoBack}
        className="p-2 rounded-lg hover:bg-[var(--hover)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-[var(--text-muted)]"
        title="Back (Alt+Left)"
      >
        <ChevronLeft size={18} />
      </button>

      <button
        onClick={onForward}
        disabled={!activeTab?.canGoForward}
        className="p-2 rounded-lg hover:bg-[var(--hover)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-[var(--text-muted)]"
        title="Forward (Alt+Right)"
      >
        <ChevronRight size={18} />
      </button>

      {isLoading ? (
        <button
          onClick={onStop}
          className="p-2 rounded-lg hover:bg-[var(--hover)] transition-colors text-[var(--text-muted)]"
          title="Stop"
        >
          <X size={18} />
        </button>
      ) : (
        <button
          onClick={onReload}
          className="p-2 rounded-lg hover:bg-[var(--hover)] transition-colors text-[var(--text-muted)]"
          title="Reload (Ctrl+R)"
        >
          <RotateCcw size={16} />
        </button>
      )}

      {/* Home button */}
      <button
        onClick={onHome}
        className="p-2 rounded-lg hover:bg-[var(--hover)] transition-colors text-[var(--text-muted)] hover:text-[var(--text)]"
        title="Home (new tab)"
      >
        <Home size={16} />
      </button>

      {/* Address / search bar */}
      <div
        className={`flex-1 flex items-center gap-2 mx-1 px-3 py-1.5 rounded-lg border transition-all
          ${isFocused
            ? 'bg-[var(--surface-2)] border-blue-500 shadow-[0_0_0_2px_rgba(59,130,246,0.25)]'
            : 'bg-[var(--surface-2)] border-[var(--border)] hover:bg-[var(--hover)] hover:border-[var(--border-strong)]'
          }`}
      >
        {/* Lock / search icon */}
        {isFocused ? (
          <Search size={14} className="text-[var(--text-faint)] shrink-0" />
        ) : isSecure ? (
          <Lock size={13} className="text-green-400 shrink-0" />
        ) : (
          <Search size={14} className="text-[var(--text-faint)] shrink-0" />
        )}

        <input
          type="text"
          value={isFocused ? input : displayUrl(input)}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={`Search with ${engine.name} or enter URL…`}
          className="flex-1 bg-transparent outline-none text-sm min-w-0 text-[var(--text)] placeholder-[var(--text-faint)]"
          spellCheck={false}
        />

        {/* Loading indicator inside bar */}
        {isLoading && !isFocused && (
          <div className="w-3 h-3 rounded-full border-2 border-blue-400 border-t-transparent animate-spin shrink-0" />
        )}
      </div>

      {/* Bookmark */}
      <button
        className="p-2 rounded-lg hover:bg-[var(--hover)] transition-colors text-[var(--text-muted)] hover:text-[var(--text)]"
        title="Bookmark (Ctrl+D)"
      >
        <Star size={16} />
      </button>

      {/* Account / menu */}
      <div className="relative">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className={`p-2 rounded-lg transition-colors ${
            menuOpen
              ? 'bg-[var(--hover)] text-[var(--text)]'
              : 'hover:bg-[var(--hover)] text-[var(--text-muted)] hover:text-[var(--text)]'
          }`}
          title="Account & settings"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          {account?.image ? (
            <img
              src={account.image}
              alt=""
              className="h-5 w-5 rounded-full object-cover"
            />
          ) : (
            <User size={16} />
          )}
        </button>

        {menuOpen && (
          <>
            {/* Backdrop to close on outside click */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => setMenuOpen(false)}
            />
            <div
              role="menu"
              className="absolute bottom-full right-0 mb-2 z-50 w-60 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl"
            >
              {/* Account section */}
              {account ? (
                <div className="flex items-center gap-3 px-3 py-3">
                  {account.image ? (
                    <img
                      src={account.image}
                      alt=""
                      className="h-9 w-9 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
                      <User size={18} />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-[var(--text)]">
                      {account.name}
                    </div>
                    <div className="text-xs text-[var(--text-faint)]">Signed in</div>
                  </div>
                </div>
              ) : (
                <div className="px-3 py-3">
                  <div className="mb-1 text-sm font-medium text-[var(--text)]">
                    Not signed in
                  </div>
                  <p className="mb-2 text-xs leading-snug text-[var(--text-faint)]">
                    Sign in to sync your bookmarks, history and settings.
                  </p>
                  <button className="w-full rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90">
                    Sign in
                  </button>
                </div>
              )}

              <div className="h-px bg-[var(--border)]" />

              <button
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-[var(--text-muted)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text)]"
              >
                <Puzzle size={16} /> Extensions
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenSettings();
                }}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-[var(--text-muted)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text)]"
              >
                <Settings size={16} /> Settings
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
