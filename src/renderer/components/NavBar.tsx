import React, { useState, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  X,
  Star,
  Settings,
  Lock,
  Search,
  Home,
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
  const buildSearchUrl = useSettingsStore((s) => s.buildSearchUrl);
  const getSearchEngine = useSettingsStore((s) => s.getSearchEngine);
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
    <div className="flex items-center gap-1 px-2 py-1.5 bg-[#1c1c1c] border-t border-white/10 shrink-0">
      {/* Navigation buttons */}
      <button
        onClick={onBack}
        disabled={!activeTab?.canGoBack}
        className="p-2 rounded-lg hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-white/80"
        title="Back (Alt+Left)"
      >
        <ChevronLeft size={18} />
      </button>

      <button
        onClick={onForward}
        disabled={!activeTab?.canGoForward}
        className="p-2 rounded-lg hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-white/80"
        title="Forward (Alt+Right)"
      >
        <ChevronRight size={18} />
      </button>

      {isLoading ? (
        <button
          onClick={onStop}
          className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/80"
          title="Stop"
        >
          <X size={18} />
        </button>
      ) : (
        <button
          onClick={onReload}
          className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/80"
          title="Reload (Ctrl+R)"
        >
          <RotateCcw size={16} />
        </button>
      )}

      {/* Home button */}
      <button
        onClick={onHome}
        className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/50 hover:text-white/80"
        title="Home (new tab)"
      >
        <Home size={16} />
      </button>

      {/* Address / search bar */}
      <div
        className={`flex-1 flex items-center gap-2 mx-1 px-3 py-1.5 rounded-lg border transition-all
          ${isFocused
            ? 'bg-white border-blue-500 shadow-[0_0_0_2px_rgba(59,130,246,0.25)]'
            : 'bg-white/10 border-white/10 hover:bg-white/15 hover:border-white/20'
          }`}
      >
        {/* Lock / search icon */}
        {isFocused ? (
          <Search size={14} className="text-gray-400 shrink-0" />
        ) : isSecure ? (
          <Lock size={13} className="text-green-400 shrink-0" />
        ) : (
          <Search size={14} className="text-white/30 shrink-0" />
        )}

        <input
          type="text"
          value={isFocused ? input : displayUrl(input)}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={`Search with ${engine.name} or enter URL…`}
          className={`flex-1 bg-transparent outline-none text-sm min-w-0
            ${isFocused ? 'text-gray-900' : 'text-white/80'} placeholder-white/30`}
          spellCheck={false}
        />

        {/* Loading indicator inside bar */}
        {isLoading && !isFocused && (
          <div className="w-3 h-3 rounded-full border-2 border-blue-400 border-t-transparent animate-spin shrink-0" />
        )}
      </div>

      {/* Bookmark */}
      <button
        className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/50 hover:text-white/80"
        title="Bookmark (Ctrl+D)"
      >
        <Star size={16} />
      </button>

      {/* Settings */}
      <button
        onClick={onOpenSettings}
        className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/50 hover:text-white/80"
        title="Settings"
      >
        <Settings size={16} />
      </button>
    </div>
  );
};
