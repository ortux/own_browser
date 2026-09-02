import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { webviewRegistry } from '../stores/webviewRegistry';

interface FindBarProps {
  tabId: string | undefined;
  onClose: () => void;
}

export const FindBar: React.FC<FindBarProps> = ({ tabId, onClose }) => {
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState(0);
  const [activeMatch, setActiveMatch] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setQuery('');
    setMatches(0);
    setActiveMatch(0);
    inputRef.current?.focus();
  }, [tabId]);

  useEffect(() => {
    if (!tabId) return;
    return webviewRegistry.subscribeFind(tabId, (event) => {
      setMatches(event.result.matches);
      setActiveMatch(event.result.activeMatchOrdinal);
    });
  }, [tabId]);

  useEffect(() => {
    const webview = tabId ? webviewRegistry.get(tabId) : undefined;
    if (!webview) return;
    if (!query) {
      webview.stopFindInPage('clearSelection');
      setMatches(0);
      setActiveMatch(0);
      return;
    }
    webview.findInPage(query, { forward: true, findNext: false, matchCase: false });
  }, [query, tabId]);

  const step = (forward: boolean) => {
    const webview = tabId ? webviewRegistry.get(tabId) : undefined;
    if (!webview || !query) return;
    webview.findInPage(query, { forward, findNext: true, matchCase: false });
  };

  const close = () => {
    const webview = tabId ? webviewRegistry.get(tabId) : undefined;
    webview?.stopFindInPage('clearSelection');
    onClose();
  };

  return (
    <div className="absolute right-4 top-4 z-30 flex w-[360px] items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] p-2 shadow-[0_8px_30px_rgba(0,0,0,0.4)]">
      <input
        ref={inputRef}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            step(!event.shiftKey);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            close();
          }
        }}
        placeholder="Find in page"
        aria-label="Find in page"
        className="min-w-0 flex-1 bg-transparent px-2 py-1 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]"
        autoFocus
      />
      <span className="min-w-[48px] text-center text-xs tabular-nums text-[var(--text-faint)]">
        {query ? `${activeMatch || 0}/${matches}` : ''}
      </span>
      <button
        type="button"
        onClick={() => step(false)}
        disabled={!query}
        title="Previous match"
        className="rounded-md p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--hover)] disabled:opacity-30"
      >
        <ChevronUp size={16} />
      </button>
      <button
        type="button"
        onClick={() => step(true)}
        disabled={!query}
        title="Next match"
        className="rounded-md p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--hover)] disabled:opacity-30"
      >
        <ChevronDown size={16} />
      </button>
      <button
        type="button"
        onClick={close}
        title="Close find bar"
        className="rounded-md p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text)]"
      >
        <X size={16} />
      </button>
    </div>
  );
};
