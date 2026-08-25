import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  X,
  Star,
  Lock,
  Search,
  Home,
  Shield,
  ShieldCheck,
  ShieldAlert,
  History as HistoryIcon,
  CornerDownLeft,
  Download as DownloadIcon,
} from 'lucide-react';
import type { Tab, HistoryEntry, Download } from '../../shared/types';
import type { CertInfo } from '../../main/certificate';
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
  onBookmark?: () => void;
  isBookmarked?: boolean;
  onOpenDownloads?: () => void;
}

function looksLikeUrl(input: string): boolean {
  const trimmed = input.trim();
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('file://') ||
    trimmed.startsWith('about:') ||
    trimmed.startsWith('zyphora://') ||
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

// ── History suggestion helpers ──────────────────────────────────────────────
function domainOf(url: string): string {
  try { return new URL(url).hostname; } catch { return url; }
}

function faviconFor(url: string): string {
  return `https://www.google.com/s2/favicons?domain=${domainOf(url)}&sz=32`;
}

export const NavBar: React.FC<NavBarProps> = ({
  activeTab,
  onBack,
  onForward,
  onReload,
  onStop,
  onNavigate,
  onHome,
  onBookmark,
  isBookmarked = false,
  onOpenDownloads,
}) => {
  const [input, setInput] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const buildSearchUrl = useSettingsStore((s) => s.buildSearchUrl);
  const getSearchEngine = useSettingsStore((s) => s.getSearchEngine);
  const engine = getSearchEngine();

  // ── History suggestions ──
  const [history, setHistory]           = useState<HistoryEntry[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIdx, setActiveIdx]       = useState(-1);
  const searchRef = useRef<HTMLInputElement>(null);

  // ── Live downloads indicator ──
  const [activeDownloads, setActiveDownloads] = useState<Download[]>([]);
  useEffect(() => {
    const update = (list: Download[]) => {
      setActiveDownloads(list.filter((d) => d.state === 'progressing'));
    };
    window.browserAPI.downloads.list().then(update).catch(() => {});
    const unsub = window.browserAPI.downloads.onUpdated(update);
    return unsub;
  }, []);

  const loadSuggestions = useCallback(async (q: string) => {
    if (!window.browserAPI) return;
    try {
      const data = q.trim()
        ? await window.browserAPI.history.search(q.trim())
        : await window.browserAPI.history.get();
      setHistory(data);
    } catch {
      setHistory([]);
    }
  }, []);

  // Fetch (de-duplicated by domain) suggestions whenever the typed query changes.
  useEffect(() => {
    if (isFocused) loadSuggestions(input);
    setActiveIdx(-1);
  }, [input, isFocused, loadSuggestions]);

  // De-duplicate history entries by domain, keeping the most recent visit.
  const suggestions = useMemo(() => {
    const seen = new Set<string>();
    const out: HistoryEntry[] = [];
    for (const e of history) {
      const d = domainOf(e.url);
      if (seen.has(d)) continue;
      seen.add(d);
      out.push(e);
      if (out.length >= 8) break;
    }
    return out;
  }, [history]);

  const openSuggestion = useCallback((entry: HistoryEntry) => {
    // Navigate to the root domain (e.g. youtube.com) rather than the exact
    // page that was visited (e.g. a specific video), so clicking a suggestion
    // lands you on the site's home page.
    const root = `https://${domainOf(entry.url)}`;
    onNavigate(root);
    setIsFocused(false);
    setShowSuggestions(false);
    setInput(root);
    searchRef.current?.blur();
  }, [onNavigate]);

  const isSecure = activeTab?.url?.startsWith('https://');
  const isLoading = activeTab?.loading;

  // ── Certificate / security shield ──
  const [cert, setCert] = useState<CertInfo | null>(null);
  const [certPending, setCertPending] = useState(false);
  const [showCert, setShowCert] = useState(false);

  const tabUrl = activeTab?.url;
  const isHttps = !!tabUrl && tabUrl.startsWith('https://');
  const tabHost = (() => {
    try {
      return tabUrl ? new URL(tabUrl).hostname : '';
    } catch {
      return '';
    }
  })();

  useEffect(() => {
    setShowCert(false);
    if (!isHttps || !tabHost) {
      setCert(null);
      setCertPending(false);
      return;
    }
    let cancelled = false;
    setCertPending(true);
    const fetchCert = async () => {
      try {
        const info = await window.browserAPI.cert.get(tabHost);
        if (!cancelled) {
          setCert(info);
          setCertPending(false);
        }
      } catch {
        if (!cancelled) setCertPending(false);
      }
    };
    // Cert is captured during the TLS handshake; query shortly after nav, retry once.
    const t1 = setTimeout(fetchCert, 400);
    const t2 = setTimeout(fetchCert, 1400);
    return () => {
      cancelled = true;
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [tabHost, isHttps, activeTab?.id, activeTab?.loading]);

  const certStatus: 'insecure' | 'pending' | 'secure' | 'invalid' = !isHttps
    ? 'insecure'
    : certPending
      ? 'pending'
      : cert?.present && cert.valid
        ? 'secure'
        : 'invalid';

  const shieldColor =
    certStatus === 'secure'
      ? 'text-green-400 hover:text-green-300'
      : certStatus === 'pending'
        ? 'text-[var(--text-faint)]'
        : 'text-red-400 hover:text-red-300';
  const ShieldIcon =
    certStatus === 'secure' ? ShieldCheck : certStatus === 'pending' ? Shield : ShieldAlert;
  const shieldTitle =
    certStatus === 'secure'
      ? 'Secure connection'
      : certStatus === 'pending'
        ? 'Checking connection…'
        : certStatus === 'insecure'
          ? 'Not secure (no HTTPS)'
          : 'Invalid certificate';

  useEffect(() => {
    if (!isFocused) {
      setInput(activeTab?.url && activeTab.url !== 'about:blank' ? activeTab.url : '');
    }
  }, [activeTab?.url, activeTab?.id, isFocused]);

  const handleFocus = () => {
    setIsFocused(true);
    setShowSuggestions(true);
    // Show full URL when focused, select all
    setInput(activeTab?.url && activeTab.url !== 'about:blank' ? activeTab.url : '');
    setTimeout(() => {
      const el = document.activeElement as HTMLInputElement;
      el?.select();
    }, 0);
  };

  const handleBlur = () => {
    setIsFocused(false);
    setShowSuggestions(false);
    // Restore stripped display URL
    setInput(activeTab?.url && activeTab.url !== 'about:blank' ? activeTab.url : '');
  };

  const handleSubmit = () => {
    // If a suggestion is highlighted, navigate to it instead of submitting the raw text.
    if (showSuggestions && activeIdx >= 0 && suggestions[activeIdx]) {
      openSuggestion(suggestions[activeIdx]);
      return;
    }
    const raw = input.trim();
    if (!raw) return;
    const url = looksLikeUrl(raw) ? raw : buildSearchUrl(raw);
    onNavigate(url);
    setIsFocused(false);
    setShowSuggestions(false);
    (document.activeElement as HTMLElement)?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Suggestion navigation takes priority.
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' && activeIdx >= 0) {
        e.preventDefault();
        openSuggestion(suggestions[activeIdx]);
        return;
      }
      if (e.key === 'Escape') {
        setShowSuggestions(false);
        return;
      }
    }
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
      <div className="relative flex-1 mx-1">
      <div
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all
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
          ref={searchRef}
          type="text"
          value={isFocused ? input : displayUrl(input)}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={`Search with ${engine.name} or enter URL…`}
          className="flex-1 bg-transparent outline-none text-sm min-w-0 text-[var(--text)] placeholder-[var(--text-faint)]"
          spellCheck={false}
          autoComplete="off"
        />

        {/* Loading indicator inside bar */}
        {isLoading && !isFocused && (
          <div className="w-3 h-3 rounded-full border-2 border-blue-400 border-t-transparent animate-spin shrink-0" />
        )}
      </div>

      {/* History suggestions tooltip/dialog — opens upward (bar sits at the bottom) */}
      {showSuggestions && isFocused && suggestions.length > 0 && (
        <div
          className="absolute bottom-full left-0 right-0 mb-2 max-h-80 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl p-1.5 z-50"
          onMouseDown={(e) => e.preventDefault()}
        >
          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">
            {input.trim() ? 'Suggestions from history' : 'Recent domains'}
          </div>
          {suggestions.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onMouseEnter={() => setActiveIdx(i)}
              onClick={() => openSuggestion(s)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors duration-150 ${
                i === activeIdx ? 'bg-[var(--hover)]' : 'hover:bg-[var(--hover)]'
              }`}
            >
              <img
                src={s.favicon || faviconFor(s.url)}
                alt=""
                className="h-5 w-5 shrink-0 rounded-sm"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = faviconFor(s.url);
                }}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-[var(--text)]">
                  {domainOf(s.url)}
                </div>
                {s.title && s.title !== domainOf(s.url) && (
                  <div className="truncate text-xs text-[var(--text-muted)]">{s.title}</div>
                )}
              </div>
              {i === activeIdx && (
                <CornerDownLeft size={14} className="shrink-0 text-[var(--text-faint)]" />
              )}
            </button>
          ))}
        </div>
      )}

      {showSuggestions && isFocused && suggestions.length === 0 && (
        <div
          className="absolute bottom-full left-0 right-0 mb-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl p-3 z-50"
          onMouseDown={(e) => e.preventDefault()}
        >
          <div className="flex items-center gap-2 px-2 text-sm text-[var(--text-muted)]">
            <HistoryIcon size={14} />
            {input.trim() ? 'No matches in your history' : 'No history yet'}
          </div>
        </div>
      )}
      </div>

      {/* Security shield — reflects the site's TLS certificate */}
      <div className="relative shrink-0">
        <button
          onClick={() => setShowCert((v) => !v)}
          className={`p-2 rounded-lg hover:bg-[var(--hover)] transition-colors ${shieldColor}`}
          title={shieldTitle}
          aria-label="Connection security"
        >
          <ShieldIcon size={16} />
        </button>

        {showCert && (
          <div className="absolute bottom-full right-0 mb-2 w-72 rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-xl p-4 text-sm z-50">
            <div className="flex items-center gap-2 mb-3">
              <ShieldIcon size={16} className={shieldColor} />
              <span className="font-semibold">{shieldTitle}</span>
            </div>

            {certStatus === 'insecure' ? (
              <p className="text-[var(--text-muted)] leading-relaxed">
                This site is not using HTTPS. Your connection is not encrypted and
                could be intercepted by third parties.
              </p>
            ) : cert && cert.present ? (
              <dl className="space-y-2">
                <Row label="Issued to" value={cert.subject || '—'} />
                <Row label="Issuer" value={cert.issuer || '—'} />
                <Row
                  label="Valid from"
                  value={cert.validFrom ? new Date(cert.validFrom).toLocaleString() : '—'}
                />
                <Row
                  label="Valid to"
                  value={cert.validTo ? new Date(cert.validTo).toLocaleString() : '—'}
                />
                <Row label="Serial number" value={cert.serialNumber || '—'} mono />
                <Row label="Fingerprint" value={cert.fingerprint || '—'} mono />
                {certStatus === 'invalid' && cert.error && (
                  <p className="mt-1 text-xs text-red-400">Error: {cert.error}</p>
                )}
              </dl>
            ) : (
              <p className="text-[var(--text-muted)]">Certificate details unavailable.</p>
            )}
          </div>
        )}
      </div>

      {/* Bookmark */}
      <button
        onClick={onBookmark}
        className={`p-2 rounded-lg hover:bg-[var(--hover)] transition-colors ${
          isBookmarked
            ? 'text-yellow-400 hover:text-yellow-300'
            : 'text-[var(--text-muted)] hover:text-[var(--text)]'
        }`}
        title={isBookmarked ? 'Remove bookmark (Ctrl+D)' : 'Bookmark (Ctrl+D)'}
      >
        <Star
          size={16}
          fill={isBookmarked ? 'currentColor' : 'none'}
        />
      </button>

      {/* Live download indicator — shows while anything is downloading */}
      {activeDownloads.length > 0 && onOpenDownloads && (
        <button
          onClick={onOpenDownloads}
          title="Open Downloads"
          className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 hover:bg-[var(--hover)] transition-colors max-w-[220px]"
        >
          <DownloadIcon size={15} className="shrink-0 text-[var(--accent)] animate-pulse" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2 text-[11px] leading-none">
              <span className="truncate text-[var(--text-muted)]">
                {activeDownloads.length === 1
                  ? activeDownloads[0].filename
                  : `${activeDownloads.length} downloads`}
              </span>
              <span className="shrink-0 tabular-nums text-[var(--text-faint)]">
                {Math.round(
                  (activeDownloads.reduce((s, d) => s + d.percent, 0) /
                    activeDownloads.length) *
                    100
                )}%
              </span>
            </div>
            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
              <div
                className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-200"
                style={{
                  width: `${
                    (activeDownloads.reduce((s, d) => s + d.percent, 0) /
                      activeDownloads.length) *
                    100
                  }%`,
                }}
              />
            </div>
          </div>
        </button>
      )}

      {/* Account / menu */}
       
    </div>
  );
};

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">{label}</dt>
      <dd className={`text-[var(--text)] break-all ${mono ? 'font-mono text-[11px]' : ''}`}>
        {value}
      </dd>
    </div>
  );
}
