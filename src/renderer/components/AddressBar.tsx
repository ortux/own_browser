import React, { useState, useEffect } from 'react';
import { Star } from 'lucide-react';
import type { Tab } from '../../shared/types';
import { useSettingsStore } from '../stores/settingsStore';

interface AddressBarProps {
  activeTab: Tab | undefined;
  onNavigate: (url: string) => void;
}

/**
 * Returns true if the input looks like a URL rather than a search query.
 * e.g. "github.com", "https://example.com", "localhost:3000"
 */
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
  // Has a dot and no spaces → likely a domain
  return trimmed.includes('.') && !trimmed.includes(' ');
}

export const AddressBar: React.FC<AddressBarProps> = ({ activeTab, onNavigate }) => {
  const [input, setInput] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const buildSearchUrl = useSettingsStore((s) => s.buildSearchUrl);
  const getSearchEngine = useSettingsStore((s) => s.getSearchEngine);

  useEffect(() => {
    if (activeTab) {
      const displayUrl = activeTab.url === 'about:blank' ? '' : activeTab.url;
      setInput(displayUrl);
    }
  }, [activeTab?.id, activeTab?.url]);

  const handleSubmit = () => {
    const raw = input.trim();
    if (!raw) return;

    const url = looksLikeUrl(raw) ? raw : buildSearchUrl(raw);
    onNavigate(url);
    setIsFocused(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSubmit();
  };

  const handleFocus = () => {
    setIsFocused(true);
    setTimeout(() => {
      const el = document.activeElement as HTMLInputElement;
      if (el) el.select();
    }, 0);
  };

  const engine = getSearchEngine();

  return (
    <div className="flex items-center gap-3 px-3 py-3 bg-white border-b border-gray-200">
      <button
        className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-600"
        title="Bookmark (Ctrl+D)"
      >
        <Star size={18} />
      </button>

      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={() => setIsFocused(false)}
        placeholder={`Search with ${engine.name} or enter URL...`}
        className={`flex-1 px-3 py-2 rounded-lg border transition-colors focus:outline-none ${
          isFocused
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 bg-gray-50 hover:bg-gray-100'
        }`}
      />
    </div>
  );
};
