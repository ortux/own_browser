import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  X,
  Star,
  Search,
  Home,
  Shield,
  ShieldCheck,
  ShieldAlert,
  ShieldOff,
  ShieldBan,
  History as HistoryIcon,
  CornerDownLeft,
  Download as DownloadIcon,
  Globe,
  BookOpen,
  Settings as SettingsIcon,
} from 'lucide-react';
import type { Tab, HistoryEntry, Download, BlockedRequest } from '../../shared/types';
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
  onToggleReader?: () => void;
  readerActive?: boolean;
  onOpenSiteSettings?: () => void;
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
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
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
  onToggleReader,
  readerActive = false,
  onOpenSiteSettings,
}) => {
  const [input, setInput] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const buildSearchUrl = useSettingsStore((s) => s.buildSearchUrl);
  const getSearchEngine = useSettingsStore((s) => s.getSearchEngine);
  const engine = getSearchEngine();

  // ── Ad blocker state (mirrors SecuritySettings.blockTrackers) ──
  const blockTrackers = useSettingsStore((s) => s.security.blockTrackers);
  const adblockAllowlist = useSettingsStore((s) => s.adblockAllowlist);
  const setSecurityFlag = useSettingsStore((s) => s.setSecurityFlag);
  const setAdblockAllowlist = useSettingsStore((s) => s.setAdblockAllowlist);
  const [showAdblock, setShowAdblock] = useState(false);
  const [adblockStats, setAdblockStats] = useState<{ enabled: boolean; blocked: number }>({
    enabled: blockTrackers,
    blocked: 0,
  });
  useEffect(() => {
    const unsub = window.browserAPI.onAdblockStats(setAdblockStats);
    return unsub;
  }, []);
  const toggleAdblock = useCallback(
    () => setSecurityFlag('blockTrackers', !blockTrackers),
    [blockTrackers, setSecurityFlag]
  );
  // ── History suggestions ──
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const suggestionRequest = useRef(0);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const searchRef = useRef<HTMLInputElement>(null);

  // ── Live downloads indicator ──
  const [activeDownloads, setActiveDownloads] = useState<Download[]>([]);
  useEffect(() => {
    const update = (list: Download[]) => {
      setActiveDownloads(list.filter((d) => d.state === 'progressing'));
    };
    window.browserAPI.downloads
      .list()
      .then(update)
      .catch(() => {});
    const unsub = window.browserAPI.downloads.onUpdated(update);
    return unsub;
  }, []);

  const loadSuggestions = useCallback(async (q: string) => {
    if (!window.browserAPI) return;
    const request = ++suggestionRequest.current;
    try {
      const data = q.trim()
        ? await window.browserAPI.history.search(q.trim())
        : await window.browserAPI.history.get();
      if (request === suggestionRequest.current) setHistory(data);
    } catch {
      if (request === suggestionRequest.current) setHistory([]);
    }
  }, []);

  // Fetch (de-duplicated by domain) suggestions whenever the typed query changes.
  // Debouncing prevents an IPC/database round-trip for every keystroke.
  useEffect(() => {
    setActiveIdx(-1);
    if (!isFocused) return;
    const timer = setTimeout(() => {
      void loadSuggestions(input);
    }, 120);
    return () => clearTimeout(timer);
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

  const openSuggestion = useCallback(
    (entry: HistoryEntry) => {
      // Navigate to the root domain (e.g. youtube.com) rather than the exact
      // page that was visited (e.g. a specific video), so clicking a suggestion
      // lands you on the site's home page.
      const root = `https://${domainOf(entry.url)}`;
      onNavigate(root);
      setIsFocused(false);
      setShowSuggestions(false);
      setInput(root);
      searchRef.current?.blur();
    },
    [onNavigate]
  );

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
  const [siteBlockedCount, setSiteBlockedCount] = useState(0);
  const [blockedRequests, setBlockedRequests] = useState<BlockedRequest[]>([]);
  const siteKey = tabHost.toLowerCase().replace(/^www\./, '');
  const siteAllowed = !!siteKey && adblockAllowlist.includes(siteKey);

  useEffect(() => {
    let cancelled = false;
    if (!siteKey || !window.browserAPI?.adblock?.siteStatus) {
      setSiteBlockedCount(0);
      setBlockedRequests([]);
      return;
    }
    Promise.all([
      window.browserAPI.adblock.siteStatus(siteKey),
      window.browserAPI.adblock.siteDetails(siteKey),
    ])
      .then(([status, details]) => {
        if (!cancelled) {
          setSiteBlockedCount(status.blocked);
          setBlockedRequests(details);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSiteBlockedCount(0);
          setBlockedRequests([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [siteKey, activeTab?.id, blockTrackers]);

  const toggleSiteProtection = () => {
    if (!siteKey) return;
    const next = siteAllowed
      ? adblockAllowlist.filter((site) => site !== siteKey)
      : [...adblockAllowlist, siteKey];
    setAdblockAllowlist(next);
    void window.browserAPI.adblock.setAllowlist(next).catch(() => {});
    setShowAdblock(false);
    onReload();
  };

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

  const certStatus: 'insecure' | 'pending' | 'secure' | 'invalid' | 'unknown' = !isHttps
    ? 'insecure'
    : certPending
      ? 'pending'
      : cert?.present && cert.valid
        ? 'secure'
        : cert?.present
          ? 'invalid'
          : 'unknown';

  const shieldColor =
    certStatus === 'secure'
      ? 'text-[var(--success)] hover:text-[var(--success)]'
      : certStatus === 'pending' || certStatus === 'unknown'
        ? 'text-[var(--text-faint)]'
        : 'text-[var(--danger)] hover:text-[var(--danger)]';
  const ShieldIcon =
    certStatus === 'secure'
      ? ShieldCheck
      : certStatus === 'pending' || certStatus === 'unknown'
        ? Shield
        : ShieldAlert;
  const shieldTitle =
    certStatus === 'secure'
      ? 'Secure connection'
      : certStatus === 'pending'
        ? 'Checking connection…'
        : certStatus === 'insecure'
          ? 'Not secure (no HTTPS)'
          : certStatus === 'unknown'
            ? 'Certificate details unavailable'
            : 'Invalid certificate';

  // The left affordance shows the search icon on the home page (and while
  // typing); on any real site it becomes the shield that reveals cert details.
  const isHome = !activeTab?.url || activeTab.url === 'about:blank';
  const showSearchIcon = isFocused || isHome;

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
        className="p-2 rounded-md hover:bg-[var(--hover)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-[var(--text-muted)]"
        title="Back (Alt+Left)"
      >
        <ChevronLeft size={18} />
      </button>

      <button
        onClick={onForward}
        disabled={!activeTab?.canGoForward}
        className="p-2 rounded-md hover:bg-[var(--hover)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-[var(--text-muted)]"
        title="Forward (Alt+Right)"
      >
        <ChevronRight size={18} />
      </button>

      {isLoading ? (
        <button
          onClick={onStop}
          className="p-2 rounded-md hover:bg-[var(--hover)] transition-colors text-[var(--text-muted)]"
          title="Stop"
        >
          <X size={18} />
        </button>
      ) : (
        <button
          onClick={onReload}
          className="p-2 rounded-md hover:bg-[var(--hover)] transition-colors text-[var(--text-muted)]"
          title="Reload (Ctrl+R)"
        >
          <RotateCcw size={16} />
        </button>
      )}

      {/* Home button */}
      <button
        onClick={onHome}
        className="p-2 rounded-md hover:bg-[var(--hover)] transition-colors text-[var(--text-muted)] hover:text-[var(--text)]"
        title="Home (new tab)"
      >
        <Home size={16} />
      </button>

      {/* Address / search bar */}
      <div className="relative flex-1 mx-1">
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-md border bg-[var(--surface-2)] border-[var(--border)] hover:bg-[var(--hover)] hover:border-[var(--border-strong)] transition-colors"
        >
          {/* Lock / search / shield — merged security affordance.
        Home (new tab): search icon. On a real site: shield that toggles
        the certificate details. */}
          <div className="relative shrink-0 flex items-center">
            {showSearchIcon ? (
              <Search size={14} className="text-[var(--text-faint)]" />
            ) : (
              <button
                type="button"
                onClick={() => setShowCert((v) => !v)}
                className={`flex items-center justify-center rounded-full p-1 transition-colors hover:bg-[var(--hover)] ${shieldColor}`}
                title={shieldTitle}
                aria-label="Connection security"
              >
                <ShieldIcon size={15} />
              </button>
            )}

            {showCert && !showSearchIcon && (
              <div
                className="absolute bottom-full left-0 mb-2 w-80 rounded-md border border-[var(--border)] bg-[var(--surface)] shadow-[0_8px_30px_rgba(0,0,0,0.35)] p-4 text-sm z-50"
                style={{ animation: 'popIn 160ms ease-out' }}
                onMouseDown={(e) => e.preventDefault()}
              >
                <div className="flex items-center gap-3 mb-4">
                  <span
                    className={`flex h-10 w-10 items-center justify-center rounded-full ${
                      certStatus === 'secure' ? 'bg-[var(--accent-soft)]' : 'bg-[var(--surface-2)]'
                    }`}
                  >
                    <ShieldIcon size={20} className={shieldColor} />
                  </span>
                  <div>
                    <div className="font-semibold leading-tight text-[var(--text)]">
                      Connection security
                    </div>
                    <div className="text-xs text-[var(--text-faint)]">{shieldTitle}</div>
                  </div>
                </div>

                {certStatus === 'insecure' ? (
                  <p className="text-[var(--text-muted)] leading-relaxed">
                    This site is not using HTTPS. Your connection is not encrypted and could be
                    intercepted by third parties.
                  </p>
                ) : cert && cert.present ? (
                  <dl className="space-y-3">
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
                      <p className="text-xs text-[var(--danger)]">Error: {cert.error}</p>
                    )}
                  </dl>
                ) : (
                  <p className="text-[var(--text-muted)]">Certificate details unavailable.</p>
                )}
              </div>
            )}
          </div>

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
            <div className="w-3 h-3 rounded-full border-2 border-[var(--text-faint)] border-t-transparent animate-spin shrink-0" />
          )}
        </div>

        {/* History suggestions tooltip/dialog — opens upward (bar sits at the bottom) */}
        {showSuggestions && isFocused && suggestions.length > 0 && (
          <div
            className="absolute bottom-full left-0 right-0 mb-2 max-h-80 overflow-y-auto rounded-md border border-[var(--border)] bg-[var(--surface)] shadow-[0_8px_30px_rgba(0,0,0,0.35)] p-1.5 z-50"
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
                className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors duration-150 ${
                  i === activeIdx ? 'bg-[var(--hover)]' : 'hover:bg-[var(--hover)]'
                }`}
              >
                {s.favicon ? (
                  <img
                    src={s.favicon}
                    alt=""
                    className="h-5 w-5 shrink-0 rounded-sm"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                ) : (
                  <Globe size={18} className="shrink-0 text-[var(--text-faint)]" />
                )}
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
            className="absolute bottom-full left-0 right-0 mb-2 rounded-md border border-[var(--border)] bg-[var(--surface)] shadow-[0_8px_30px_rgba(0,0,0,0.35)] p-3 z-50"
            onMouseDown={(e) => e.preventDefault()}
          >
            <div className="flex items-center gap-2 px-2 text-sm text-[var(--text-muted)]">
              <HistoryIcon size={14} />
              {input.trim() ? 'No matches in your history' : 'No history yet'}
            </div>
          </div>
        )}
      </div>

      {/* Ad blocker toggle */}
      <div className="relative shrink-0">
        <button
          onClick={() => setShowAdblock((v) => !v)}
          className={`p-2 rounded-md hover:bg-[var(--hover)] transition-colors ${
            blockTrackers ? 'text-[var(--accent-fg)]' : 'text-[var(--text-faint)]'
          }`}
          title={blockTrackers ? 'Ad blocker on' : 'Ad blocker off'}
          aria-label="Ad blocker"
        >
          {blockTrackers ? <ShieldBan size={16} /> : <ShieldOff size={16} />}
        </button>

        {showAdblock && (
          <div
            className="absolute bottom-full right-0 mb-2 w-72 rounded-md border border-[var(--border)] bg-[var(--surface)] shadow-[0_8px_30px_rgba(0,0,0,0.35)] p-4 text-sm z-50"
            style={{ animation: 'popIn 160ms ease-out' }}
            onMouseDown={(e) => e.preventDefault()}
          >
            <div className="flex items-center gap-3 mb-3">
              <span
                className={`flex h-10 w-10 items-center justify-center rounded-full ${
                  blockTrackers ? 'bg-[var(--accent-soft)]' : 'bg-[var(--surface-2)]'
                }`}
              >
                {blockTrackers ? (
                  <ShieldBan size={20} className="text-[var(--accent-fg)]" />
                ) : (
                  <ShieldOff size={20} className="text-[var(--text-faint)]" />
                )}
              </span>
              <div>
                <div className="font-semibold leading-tight text-[var(--text)]">Ad blocker</div>
                <div className="text-xs text-[var(--text-faint)]">
                  {blockTrackers ? 'Protecting you' : 'Disabled'}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-md bg-[var(--surface-2)] px-3 py-2.5">
              <span className="text-[var(--text)]">Block trackers &amp; ads</span>
              <button
                type="button"
                onClick={toggleAdblock}
                className={`relative h-6 w-[44px] shrink-0 rounded-full border-2 transition-colors duration-200 ease-out ${
                  blockTrackers
                    ? 'border-[var(--accent)] bg-[var(--accent)]'
                    : 'border-[var(--border-strong)] bg-[var(--surface-2)]'
                }`}
                aria-pressed={blockTrackers}
              >
                <span
                  className={`absolute top-1/2 -translate-y-1/2 rounded-full shadow-sm transition-all duration-200 ease-out ${
                    blockTrackers ? 'left-[22px] bg-white' : 'left-[3px] bg-[var(--text-faint)]'
                  } h-4 w-4`}
                />
              </button>
            </div>

            <div className="mt-3 rounded-md bg-[var(--surface-2)] px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-xs text-[var(--text-muted)]">
                  {siteKey || 'Current site'}
                </span>
                <button
                  type="button"
                  onClick={toggleSiteProtection}
                  disabled={!siteKey}
                  className="shrink-0 text-xs font-medium text-[var(--accent-fg)] hover:underline disabled:opacity-40"
                >
                  {siteAllowed ? 'Enable here' : 'Disable on site'}
                </button>
              </div>
              <p className="mt-1 text-[11px] text-[var(--text-faint)]">
                {siteAllowed
                  ? 'Protection is disabled for this site.'
                  : siteBlockedCount > 0
                    ? `${siteBlockedCount} requests blocked on this site`
                    : 'No blocked requests recorded for this site'}
              </p>
              {blockedRequests.length > 0 && (
                <div className="mt-2 max-h-24 space-y-1 overflow-y-auto border-t border-[var(--border)] pt-2">
                  {blockedRequests.slice(0, 8).map((request, index) => (
                    <div
                      key={`${request.timestamp}-${index}`}
                      className="truncate text-[10px] text-[var(--text-faint)]"
                      title={request.url}
                    >
                      <span className="mr-1 rounded bg-[var(--surface)] px-1">{request.type}</span>
                      {request.url}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <p className="mt-3 text-xs text-[var(--text-faint)]">
              {adblockStats.blocked > 0
                ? `${adblockStats.blocked} requests blocked this session`
                : 'No requests blocked yet'}
            </p>
          </div>
        )}
      </div>

      {/* Bookmark */}
      <button
        onClick={onBookmark}
        className={`p-2 rounded-md hover:bg-[var(--hover)] transition-colors ${
          isBookmarked
            ? 'text-yellow-400 hover:text-yellow-300'
            : 'text-[var(--text-muted)] hover:text-[var(--text)]'
        }`}
        title={isBookmarked ? 'Remove bookmark (Ctrl+D)' : 'Bookmark (Ctrl+D)'}
      >
        <Star size={16} fill={isBookmarked ? 'currentColor' : 'none'} />
      </button>

      {/* Reader mode — only meaningful on real http(s) pages. */}
      {onToggleReader && activeTab?.url && /^https?:\/\//.test(activeTab.url) && (
        <button
          onClick={onToggleReader}
          className={`p-2 rounded-md hover:bg-[var(--hover)] transition-colors ${
            readerActive
              ? 'text-[var(--accent-fg)] bg-[var(--accent-soft)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text)]'
          }`}
          title="Reading mode (Ctrl+Shift+R)"
          aria-label="Toggle reading mode"
        >
          <BookOpen size={16} />
        </button>
      )}

      {/* Per-site settings — opens the SiteSettingsPopover. */}
      {onOpenSiteSettings && activeTab?.url && /^https?:\/\//.test(activeTab.url) && (
        <button
          onClick={onOpenSiteSettings}
          className="p-2 rounded-md hover:bg-[var(--hover)] transition-colors text-[var(--text-muted)] hover:text-[var(--text)]"
          title="Site settings"
          aria-label="Site settings"
        >
          <SettingsIcon size={16} />
        </button>
      )}

      {/* Live download indicator — shows while anything is downloading */}
      {activeDownloads.length > 0 &&
        onOpenDownloads &&
        (() => {
          // Byte-weighted progress across downloads whose size is known.
          // Unknown-size downloads are excluded; if none are known the bar
          // pulses indeterminately instead of being stuck at 0%.
          const known = activeDownloads.filter((d) => d.totalBytes > 0);
          const total = known.reduce((s, d) => s + d.totalBytes, 0);
          const received = known.reduce((s, d) => s + d.receivedBytes, 0);
          const aggPct = total > 0 ? Math.min(100, Math.round((received / total) * 100)) : null;
          return (
            <button
              onClick={onOpenDownloads}
              title="Open Downloads"
              className="flex items-center gap-2 rounded-md px-2.5 py-1.5 hover:bg-[var(--hover)] transition-colors max-w-[220px]"
            >
              <DownloadIcon size={15} className="shrink-0 text-[var(--accent-fg)] animate-pulse" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2 text-[11px] leading-none">
                  <span className="truncate text-[var(--text-muted)]">
                    {activeDownloads.length === 1
                      ? activeDownloads[0].filename
                      : `${activeDownloads.length} downloads`}
                  </span>
                  {aggPct !== null && (
                    <span className="shrink-0 tabular-nums text-[var(--text-faint)]">
                      {aggPct}%
                    </span>
                  )}
                </div>
                <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
                  <div
                    className={`h-full rounded-full bg-[var(--accent)] ${
                      aggPct === null ? 'animate-pulse' : 'transition-[width] duration-200'
                    }`}
                    style={{ width: aggPct === null ? '100%' : `${aggPct}%` }}
                  />
                </div>
              </div>
            </button>
          );
        })()}

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
